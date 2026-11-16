// Regression guard for layouts/shortcodes/youtube.html and .youtube in main.css.
//
// Previously, calling {{< youtube id="..." >}} without class="youtube" emitted
// <div style="position: relative; min-height: 14rem;"> around a position:absolute
// iframe, collapsing every unclassed embed to 224px tall regardless of container
// width or video aspect ratio; meanwhile class="youtube" hardcoded 56.25% (16:9)
// even for 16:10 / 4:3 screen recordings, and ignored height / caption params.
import test from "node:test";
import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "parse5";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => readFileSync(`${root}/${rel}`, "utf8");

function* walk(node) {
  for (const child of node.childNodes ?? []) {
    if (child.tagName) {
      yield child;
      yield* walk(child.content ?? child);
    }
  }
}

const attr = (el, name) => el.attrs?.find((a) => a.name === name)?.value ?? null;

test("main.css sizes .youtube via aspect-ratio (--yt-aspect, 16 / 9) without the 56.25% height:0 hack", () => {
  const css = read("themes/aifocustheme/assets/css/main.css");
  assert.match(css, /\.youtube\s*\{[^}]*aspect-ratio:\s*var\(--yt-aspect,\s*16\s*\/\s*9\)/s);
  assert.doesNotMatch(css, /padding-bottom:\s*56\.25%/);
});

test("every built YouTube embed uses .youtube, privacy-enhanced domain, lazy loading, and native aspect ratio", () => {
  const pages = globSync(`${root}/public/**/*.html`);
  assert.ok(pages.length > 0, "public/ must be built before running youtube-shortcode.test.mjs");
  const youtubeMeta = JSON.parse(read("data/youtube.json"));
  let found = 0;

  for (const file of pages) {
    const html = readFileSync(file, "utf8");
    if (!html.includes("youtube-nocookie.com/embed/")) continue;
    const doc = parse(html);
    for (const el of walk(doc)) {
      if (el.tagName !== "iframe") continue;
      const src = attr(el, "src") ?? "";
      const m = /^https:\/\/www\.youtube-nocookie\.com\/embed\/([^?&/]+)/.exec(src);
      if (!m) continue;
      found += 1;
      const vid = m[1];
      assert.equal(attr(el, "loading"), "lazy", `${file}: YouTube iframe ${vid} should lazy-load`);
      assert.ok((attr(el, "title") ?? "").trim().length > 0, `${file}: YouTube iframe ${vid} needs an accessible title`);
      assert.doesNotMatch(attr(el, "style") ?? "", /position:\s*absolute/, `${file}: YouTube iframe ${vid} still uses legacy absolute positioning`);

      const parent = el.parentNode;
      const parentClass = attr(parent, "class") ?? "";
      const parentStyle = attr(parent, "style") ?? "";
      assert.match(parentClass, /\byoutube\b/, `${file}: YouTube wrapper for ${vid} missing .youtube class`);
      assert.doesNotMatch(parentStyle, /min-height:\s*14rem/, `${file}: YouTube wrapper for ${vid} collapsed to min-height: 14rem`);

      if (youtubeMeta[vid]) {
        const expected = new RegExp(`--yt-aspect:\\s*${youtubeMeta[vid].width}\\s*/\\s*${youtubeMeta[vid].height}\\b`);
        assert.ok(
          expected.test(parentStyle) || parentStyle.includes("height:"),
          `${file}: YouTube wrapper for ${vid} expected ${expected}, got style=${JSON.stringify(parentStyle)}`,
        );
      }
    }
  }

  assert.ok(found >= 8, `expected at least 8 built YouTube embeds across published posts, found ${found}`);
});
