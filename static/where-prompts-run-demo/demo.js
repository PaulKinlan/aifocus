/**
 * Self-adapting journal demo — the harness is small enough to fit on
 * the page. Everything below is the runtime: a tool-use loop against
 * one of three provider APIs (Anthropic, Google Gemini, OpenAI), plus
 * three OPFS tools the agent can call. The *program* is the prose in
 * the system-prompt textarea.
 *
 * Edit the prompt, and the same runtime becomes a different tool.
 * Switch the provider, and the same prompt runs against a different
 * model. That's the claim the post is making. This file is the
 * evidence.
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

// ─── Canonical tool definitions ──────────────────────────────────────
//
// Same JSONSchema for the three tools, three different wrappers per
// provider. Keeping them in one place so the rest of the file doesn't
// have to know about provider-specific shapes.

const TOOL_SPECS = [
  {
    name: 'opfs_list',
    description: 'List the contents of an OPFS directory. Pass an empty string for the root.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Directory path. Empty string means root.' } },
      required: ['path'],
    },
  },
  {
    name: 'opfs_read',
    description: 'Read a text file from OPFS.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'opfs_write',
    description: 'Write (or overwrite) a text file in OPFS. Creates parent directories as needed.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
    },
  },
];

const TOOLS_ANTHROPIC = TOOL_SPECS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.parameters,
}));

const TOOLS_OPENAI = TOOL_SPECS.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

const TOOLS_GOOGLE = TOOL_SPECS.map((t) => ({
  name: t.name,
  description: t.description,
  parameters: t.parameters,
}));

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

// ─── Provider abstraction ────────────────────────────────────────────
//
// Each provider has:
//   defaultModel:   suggested model id
//   keyPlaceholder: the field placeholder for the API key
//   endpoint:       the host the key gets sent to (for the banner)
//   init():         build the per-run context (messages, system, etc.)
//   step():         do one round-trip; returns {textBlocks, toolUses, done}
//   appendResults():append tool results into the context for the next step
//
// Tool uses are normalised to {id, name, input}. Tool results are
// {id, name, result:string}. The runner is provider-agnostic.

const PROVIDERS = {
  anthropic: {
    label: 'Anthropic (Claude)',
    defaultModel: 'claude-sonnet-4-6',
    keyPlaceholder: 'sk-ant-…',
    endpoint: 'api.anthropic.com',
    init(system, userMessage) {
      return { messages: [{ role: 'user', content: userMessage }], system };
    },
    async step(ctx, apiKey, model) {
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
          system: ctx.system,
          messages: ctx.messages,
          tools: TOOLS_ANTHROPIC,
        }),
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
      const reply = await res.json();
      ctx.messages.push({ role: 'assistant', content: reply.content });
      const textBlocks = reply.content.filter((b) => b.type === 'text').map((b) => b.text);
      const toolUses = reply.content
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({ id: b.id, name: b.name, input: b.input ?? {} }));
      const done = reply.stop_reason === 'end_turn' || toolUses.length === 0;
      return { textBlocks, toolUses, done };
    },
    appendResults(ctx, results) {
      ctx.messages.push({
        role: 'user',
        content: results.map((r) => ({
          type: 'tool_result',
          tool_use_id: r.id,
          content: r.result,
        })),
      });
    },
  },

  openai: {
    label: 'OpenAI (GPT)',
    defaultModel: 'gpt-5.4',
    keyPlaceholder: 'sk-…',
    endpoint: 'api.openai.com',
    init(system, userMessage) {
      return {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMessage },
        ],
      };
    },
    async step(ctx, apiKey, model) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: ctx.messages,
          tools: TOOLS_OPENAI,
        }),
      });
      if (!res.ok) throw new Error(`openai ${res.status}: ${await res.text()}`);
      const reply = await res.json();
      const choice = reply.choices?.[0];
      const msg = choice?.message ?? {};
      ctx.messages.push(msg);
      const textBlocks = msg.content ? [msg.content] : [];
      const toolUses = (msg.tool_calls ?? []).map((tc) => {
        let input = {};
        try { input = JSON.parse(tc.function?.arguments ?? '{}'); } catch { input = {}; }
        return { id: tc.id, name: tc.function?.name ?? '', input };
      });
      const done = choice?.finish_reason !== 'tool_calls' && toolUses.length === 0;
      return { textBlocks, toolUses, done };
    },
    appendResults(ctx, results) {
      for (const r of results) {
        ctx.messages.push({
          role: 'tool',
          tool_call_id: r.id,
          content: r.result,
        });
      }
    },
  },

  google: {
    label: 'Google (Gemini)',
    defaultModel: 'gemini-3.1-pro-preview',
    keyPlaceholder: 'AIza…',
    endpoint: 'generativelanguage.googleapis.com',
    init(system, userMessage) {
      return {
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        system,
      };
    },
    async step(ctx, apiKey, model) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const body = {
        contents: ctx.contents,
        systemInstruction: { parts: [{ text: ctx.system }] },
        tools: [{ functionDeclarations: TOOLS_GOOGLE }],
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`google ${res.status}: ${await res.text()}`);
      const reply = await res.json();
      const cand = reply.candidates?.[0];
      const parts = cand?.content?.parts ?? [];
      ctx.contents.push({ role: 'model', parts });
      const textBlocks = parts.filter((p) => p.text).map((p) => p.text);
      // Gemini doesn't issue tool-call IDs; synthesise stable ones from the position.
      const toolUses = parts
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => p.functionCall)
        .map(({ p, i }) => ({
          id: `g${ctx.contents.length}-${i}`,
          name: p.functionCall.name,
          input: p.functionCall.args ?? {},
        }));
      const done = toolUses.length === 0;
      return { textBlocks, toolUses, done };
    },
    appendResults(ctx, results) {
      ctx.contents.push({
        role: 'user',
        parts: results.map((r) => ({
          functionResponse: {
            name: r.name,
            response: { result: r.result },
          },
        })),
      });
    },
  },
};

// ─── Provider-agnostic loop ──────────────────────────────────────────

async function runLoop({ providerId, apiKey, model, system, userMessage, onEvent }) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw new Error(`unknown provider: ${providerId}`);
  const ctx = provider.init(system, userMessage);

  for (let step = 0; step < 12; step++) {
    onEvent({ type: 'step', step });
    const { textBlocks, toolUses, done } = await provider.step(ctx, apiKey, model);
    for (const t of textBlocks) if (t.trim()) onEvent({ type: 'text', text: t });

    if (done) return;

    const results = [];
    for (const use of toolUses) {
      onEvent({ type: 'tool_use', name: use.name, input: use.input });
      let result;
      try { result = await runTool(use.name, use.input); }
      catch (e) { result = `ERROR: ${e.message}`; }
      onEvent({ type: 'tool_result', name: use.name, result });
      results.push({ id: use.id, name: use.name, result: typeof result === 'string' ? result : JSON.stringify(result) });
    }
    provider.appendResults(ctx, results);
  }
  onEvent({ type: 'text', text: '(stopped at step cap)' });
}

// ─── UI wiring ───────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const LS_PROMPT = 'wpr_demo_prompt';
const LS_PROVIDER = 'wpr_demo_provider';
const LS_KEY = (p) => `wpr_demo_apikey_${p}`;
const LS_MODEL = (p) => `wpr_demo_model_${p}`;

// The page is provider-locked. window.PROVIDER_ID is set inline in the
// HTML before this module runs. The provider dropdown is a navigator
// to the other provider's HTML page, not a runtime switch — each page
// has its own strict CSP that allows only one provider's endpoint.
const PROVIDER_PAGES = {
  anthropic: './',
  google: './google.html',
  openai: './openai.html',
};

function getProviderId() {
  return window.PROVIDER_ID;
}

function loadState() {
  const p = getProviderId();
  const def = PROVIDERS[p];
  // Restore stored values for the current locked provider.
  const storedKey = localStorage.getItem(LS_KEY(p));
  if (storedKey) $('apiKey').value = storedKey;
  const storedModel = localStorage.getItem(LS_MODEL(p));
  if (storedModel) $('model').value = storedModel;
  $('apiKey').placeholder = def.keyPlaceholder;
  $('endpointHint').textContent = def.endpoint;
  $('provider').value = p;
  const storedPrompt = localStorage.getItem(LS_PROMPT) ?? DEFAULT_PROMPT;
  $('systemPrompt').value = storedPrompt;
  updateSendEnabled();
}

function updateSendEnabled() {
  const ok = $('apiKey').value.trim().length > 5 && $('userInput').value.trim().length > 0;
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
  const providerId = getProviderId();
  const apiKey = $('apiKey').value.trim();
  const model = $('model').value.trim() || PROVIDERS[providerId].defaultModel;
  const system = $('systemPrompt').value;
  const userMessage = $('userInput').value.trim();
  if (!apiKey || !userMessage) return;

  localStorage.setItem(LS_PROVIDER, providerId);
  localStorage.setItem(LS_KEY(providerId), apiKey);
  localStorage.setItem(LS_MODEL(providerId), model);
  localStorage.setItem(LS_PROMPT, system);

  appendTranscript('user', userMessage);
  $('userInput').value = '';
  updateSendEnabled();

  const btn = $('send');
  btn.disabled = true;
  toast(`running on ${PROVIDERS[providerId].label}…`);
  $('step').textContent = '';

  try {
    await runLoop({
      providerId, apiKey, model, system,
      userMessage: `Today's date: ${new Date().toISOString().slice(0, 10)}\n\nUser input:\n${userMessage}`,
      onEvent: (e) => {
        if (e.type === 'step') {
          $('step').textContent = `step ${e.step + 1}`;
        } else if (e.type === 'tool_use') {
          appendTranscript('tool', { name: e.name, input: e.input });
          refreshTree();
        } else if (e.type === 'tool_result') {
          const t = $('transcript');
          const lastTool = t.querySelector('.msg.tool:last-child');
          if (lastTool && lastTool.querySelectorAll('pre').length < 2) {
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

$('provider').addEventListener('change', (e) => {
  const target = e.target.value;
  if (target === getProviderId()) return;
  // Each provider lives on a separate page with a strict CSP that only
  // allows that provider's endpoint. Navigate rather than switch.
  const url = PROVIDER_PAGES[target];
  if (url) window.location.href = url;
});
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

$('resetPrompt').addEventListener('click', (e) => {
  // Inside <summary>; stop the click from toggling the details element.
  e.stopPropagation();
  e.preventDefault();
  if (!confirm('Reset the system prompt to default? Your current edits will be lost.')) return;
  $('systemPrompt').value = DEFAULT_PROMPT;
  localStorage.removeItem(LS_PROMPT);
});

loadState();
refreshTree();
