/**
 * Self-adapting journal demo — the harness is small enough to fit on
 * the page. Everything below is the runtime: a five-step tool-use loop
 * against Anthropic's messages API, plus three OPFS tools the agent
 * can call. The *program* is the prose in the system-prompt textarea.
 *
 * Edit the prompt, and the same runtime becomes a different tool.
 * That's the claim the post is making. This file is the evidence.
 */

const DEFAULT_PROMPT = `You are a self-adapting journal. You manage a small directory of markdown files in a sandboxed filesystem (OPFS) that represents the user's notes, relationships, and themes. Nothing you write leaves the browser.

## Structure

- \`entries/YYYY-MM-DD.md\` — one file per day. If a file already exists for today, read it first and append a new timestamped section. Never overwrite earlier entries on the same day.
- \`people/<firstname>.md\` — one file per person mentioned. Contact details if known, key facts, and a dated log of mentions.
- \`topics/<slug>.md\` — one file per topic. A short summary plus a dated log.
- \`index.md\` — top-level index. Sections: Recent entries, People, Topics. Most recent first.

## On every user message

1. Call \`opfs_list\` with path \`""\` to see the current sandbox.
2. If any folder you need (entries, people, topics) doesn't yet exist, you don't have to pre-create it — writing a file will create the folder.
3. Decide what entries, people, and topics this message creates or updates.
4. For each file you need to touch, call \`opfs_read\` first if it exists, then \`opfs_write\` with the full new contents. Cross-link relentlessly — entries link to people/topics, people/topics log mentions back to the entry they appeared in.
5. Update \`index.md\` so the top of it reflects what was just added.
6. Reply with a single paragraph summarising what you captured and the relative paths of the files you touched. Keep it short. No preamble like "I will do X" — just do X and summarise after.

## Constraints

- Today's date, if you need it, should come from the user message or be inferred as 'the most recent date in the sandbox' (default to '2026-01-01' if the sandbox is empty).
- Don't invent details the user didn't supply. If the user says "had coffee with Alice" don't invent Alice's surname, job, or company.
- Keep files small. This is a playground, not a production journal.
`;

// ─── OPFS helpers ────────────────────────────────────────────────────

async function getRoot() { return await navigator.storage.getDirectory(); }

function splitPath(path) { return path.split('/').filter(Boolean); }

async function opfsWrite(path, content) {
  const segments = splitPath(path);
  const name = segments.pop();
  let dir = await getRoot();
  for (const seg of segments) dir = await dir.getDirectoryHandle(seg, { create: true });
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(content);
  await w.close();
}

async function opfsRead(path) {
  const segments = splitPath(path);
  const name = segments.pop();
  let dir = await getRoot();
  for (const seg of segments) dir = await dir.getDirectoryHandle(seg);
  const fh = await dir.getFileHandle(name);
  return await (await fh.getFile()).text();
}

async function opfsList(path) {
  const segments = splitPath(path);
  let dir = await getRoot();
  for (const seg of segments) dir = await dir.getDirectoryHandle(seg);
  const out = [];
  for await (const [name, handle] of dir.entries()) {
    out.push({ name, kind: handle.kind });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function opfsRemoveAll() {
  const root = await getRoot();
  for await (const [name, handle] of root.entries()) {
    await root.removeEntry(name, { recursive: handle.kind === 'directory' });
  }
}

async function opfsWalk(prefix = '') {
  const tree = [];
  const recurse = async (path) => {
    const entries = await opfsList(path);
    for (const e of entries) {
      const full = path ? `${path}/${e.name}` : e.name;
      if (e.kind === 'directory') {
        tree.push({ path: full, kind: 'dir' });
        await recurse(full);
      } else {
        tree.push({ path: full, kind: 'file' });
      }
    }
  };
  await recurse(prefix);
  return tree;
}

// ─── Tool declarations (Anthropic format) ────────────────────────────

const TOOLS = [
  {
    name: 'opfs_list',
    description: 'List the contents of an OPFS directory. Pass an empty string for the root.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Directory path. Empty string means root.' } },
      required: ['path'],
    },
  },
  {
    name: 'opfs_read',
    description: 'Read a text file from OPFS.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'opfs_write',
    description: 'Write (or overwrite) a text file in OPFS. Creates parent directories as needed.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
    },
  },
];

async function runTool(name, input) {
  if (name === 'opfs_list') {
    const entries = await opfsList(input.path ?? '');
    return entries.length === 0 ? '(empty)' : entries.map((e) => `${e.kind === 'directory' ? 'd' : 'f'} ${e.name}`).join('\n');
  }
  if (name === 'opfs_read') {
    try { return await opfsRead(input.path); }
    catch (e) { return `ERROR: ${e.message}`; }
  }
  if (name === 'opfs_write') {
    await opfsWrite(input.path, input.content);
    return `ok (wrote ${input.content.length} chars to ${input.path})`;
  }
  return `ERROR: unknown tool ${name}`;
}

// ─── Anthropic API loop ──────────────────────────────────────────────

async function callAnthropic({ apiKey, model, system, messages }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system,
      messages,
      tools: TOOLS,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`anthropic API ${res.status}: ${text}`);
  }
  return await res.json();
}

async function runLoop({ apiKey, model, system, userMessage, onEvent }) {
  const messages = [{ role: 'user', content: userMessage }];
  for (let step = 0; step < 12; step++) {
    onEvent({ type: 'step', step });
    const reply = await callAnthropic({ apiKey, model, system, messages });
    // Record assistant response (full content array) as the next assistant message.
    messages.push({ role: 'assistant', content: reply.content });

    const toolUses = reply.content.filter((b) => b.type === 'tool_use');
    const textBlocks = reply.content.filter((b) => b.type === 'text');
    for (const t of textBlocks) if (t.text.trim()) onEvent({ type: 'text', text: t.text });

    if (reply.stop_reason === 'end_turn' || toolUses.length === 0) {
      return;
    }

    // Execute every tool use from this step, then send results back.
    const toolResults = [];
    for (const use of toolUses) {
      onEvent({ type: 'tool_use', name: use.name, input: use.input });
      let result;
      try { result = await runTool(use.name, use.input); }
      catch (e) { result = `ERROR: ${e.message}`; }
      onEvent({ type: 'tool_result', name: use.name, result });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }
  onEvent({ type: 'text', text: '(stopped at step cap)' });
}

// ─── UI wiring ───────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const LS_KEY = 'wpr_demo_apikey';
const LS_PROMPT = 'wpr_demo_prompt';

function loadState() {
  const storedKey = localStorage.getItem(LS_KEY) ?? '';
  const storedPrompt = localStorage.getItem(LS_PROMPT) ?? DEFAULT_PROMPT;
  $('apiKey').value = storedKey;
  $('systemPrompt').value = storedPrompt;
  updateSendEnabled();
}

function updateSendEnabled() {
  const ok = $('apiKey').value.trim().length > 10 && $('userInput').value.trim().length > 0;
  $('send').disabled = !ok;
}

function toast(msg, cls = '') {
  const el = $('status');
  el.textContent = msg;
  el.style.color = cls === 'err' ? 'var(--err)' : 'var(--text-dim)';
}

let activeFile = null;

async function refreshTree() {
  const treeEl = $('tree');
  const entries = await opfsWalk('');
  if (entries.length === 0) {
    treeEl.innerHTML = `<div class="hint">No files yet. Write something below to kick off the journal.</div>`;
    $('fileCount').textContent = 'empty';
    return;
  }
  $('fileCount').textContent = `${entries.filter((e) => e.kind === 'file').length} files`;
  const lines = entries.map((e) => {
    if (e.kind === 'dir') return `<div class="dir">${escapeHtml(e.path)}/</div>`;
    return `<a class="file${activeFile === e.path ? ' active' : ''}" data-path="${escapeHtml(e.path)}">${escapeHtml(e.path)}</a>`;
  });
  treeEl.innerHTML = lines.join('');
  treeEl.querySelectorAll('.file').forEach((el) => {
    el.addEventListener('click', () => openFile(el.dataset.path));
  });
}

async function openFile(path) {
  activeFile = path;
  try {
    const text = await opfsRead(path);
    const v = $('viewer');
    v.className = 'viewer';
    v.textContent = text || '(empty file)';
  } catch (e) {
    const v = $('viewer');
    v.className = 'viewer empty';
    v.textContent = `Error reading ${path}: ${e.message}`;
  }
  await refreshTree();
}

function appendTranscript(kind, payload) {
  const t = $('transcript');
  if (t.querySelector('.empty-transcript')) t.innerHTML = '';
  const div = document.createElement('div');
  div.className = `msg ${kind}`;
  if (kind === 'user') {
    div.innerHTML = `<div class="kind">you</div><div>${escapeHtml(payload)}</div>`;
  } else if (kind === 'assistant') {
    div.innerHTML = `<div class="kind">agent</div><div>${escapeHtml(payload)}</div>`;
  } else if (kind === 'tool') {
    div.innerHTML = `<div class="kind">tool · ${escapeHtml(payload.name)}</div>
      <pre>${escapeHtml(JSON.stringify(payload.input ?? {}, null, 2))}</pre>
      ${payload.result !== undefined ? `<pre style="color: var(--text-dim);">${escapeHtml(truncate(payload.result, 500))}</pre>` : ''}`;
  } else if (kind === 'error') {
    div.innerHTML = `<div class="kind">error</div><div>${escapeHtml(payload)}</div>`;
  }
  t.appendChild(div);
  t.parentElement.scrollTop = t.parentElement.scrollHeight;
}

function truncate(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n) + `\n… (${s.length - n} more chars)`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function handleSend() {
  const apiKey = $('apiKey').value.trim();
  const model = $('model').value.trim() || 'claude-sonnet-4-6';
  const system = $('systemPrompt').value;
  const userMessage = $('userInput').value.trim();
  if (!apiKey || !userMessage) return;

  localStorage.setItem(LS_KEY, apiKey);
  localStorage.setItem(LS_PROMPT, system);

  appendTranscript('user', userMessage);
  $('userInput').value = '';
  updateSendEnabled();

  const btn = $('send');
  btn.disabled = true;
  toast('running…');
  $('step').textContent = '';

  const pendingTools = new Map();

  try {
    await runLoop({
      apiKey, model, system,
      userMessage: `Today's date: ${new Date().toISOString().slice(0, 10)}\n\nUser input:\n${userMessage}`,
      onEvent: (e) => {
        if (e.type === 'step') {
          $('step').textContent = `step ${e.step + 1}`;
        } else if (e.type === 'tool_use') {
          pendingTools.set(e.name + JSON.stringify(e.input), { name: e.name, input: e.input });
          appendTranscript('tool', { name: e.name, input: e.input });
          // Refresh the tree during tool use so the user sees files appear.
          refreshTree();
        } else if (e.type === 'tool_result') {
          // Attach result to the last tool message.
          const t = $('transcript');
          const lastTool = t.querySelector('.msg.tool:last-child');
          if (lastTool && !lastTool.querySelector('pre:nth-child(3)')) {
            const pre = document.createElement('pre');
            pre.style.color = 'var(--text-dim)';
            pre.textContent = truncate(e.result, 500);
            lastTool.appendChild(pre);
          }
          refreshTree();
        } else if (e.type === 'text') {
          appendTranscript('assistant', e.text);
        }
      },
    });
    toast('done');
  } catch (err) {
    appendTranscript('error', err.message || String(err));
    toast(err.message || 'error', 'err');
  } finally {
    btn.disabled = false;
    updateSendEnabled();
    await refreshTree();
  }
}

// ─── Wire events ─────────────────────────────────────────────────────

$('apiKey').addEventListener('input', updateSendEnabled);
$('userInput').addEventListener('input', updateSendEnabled);
$('send').addEventListener('click', handleSend);
$('userInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    if (!$('send').disabled) handleSend();
  }
});

$('reset').addEventListener('click', async () => {
  if (!confirm('Clear every file in the demo sandbox? This only affects the OPFS bucket for this page.')) return;
  await opfsRemoveAll();
  $('transcript').innerHTML = '<div class="empty-transcript">Sandbox cleared.</div>';
  $('viewer').className = 'viewer empty';
  $('viewer').textContent = 'Click a file to view its contents.';
  activeFile = null;
  await refreshTree();
  toast('sandbox cleared');
});

$('resetPrompt').addEventListener('click', () => {
  if (!confirm('Reset the system prompt to default? Your current edits will be lost.')) return;
  $('systemPrompt').value = DEFAULT_PROMPT;
  localStorage.removeItem(LS_PROMPT);
});

loadState();
refreshTree();
