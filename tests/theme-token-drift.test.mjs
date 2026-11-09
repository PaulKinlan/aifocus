// aifocus-t2pp, aifocus-1dsq: colour-scheme switching belongs to the tokens in
// the theme stylesheet. A template that re-declares a colour inside its own
// @media (prefers-color-scheme: dark) block shadows a token with a raw hex, so
// the page stops following --muted (or any other token) the moment the token
// moves. It happened twice in layouts/404.html: aifocus-1dsq removed the
// override on .game-hint and left the identical one on .not-found-lede one
// selector above, which then reported #9aa0a6 while --muted resolved to
// #aaaaaa. This reads the template sources because the drift is only visible as
// a shadowed declaration - the rendered page looks fine until a token moves.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));

function templates(dir) {
  const out = [];
  for (const entry of readdirSync(root(dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...templates(path));
    else if (entry.name.endsWith(".html")) out.push(path);
  }
  return out;
}

const LAYOUTS = [...templates("layouts"), ...templates("themes/aifocustheme/layouts")];

test("no template shadows a theme token with its own colour-scheme block", () => {
  assert.ok(LAYOUTS.length > 10, "the template scan found nothing to check");
  const offenders = [];
  for (const path of LAYOUTS) {
    const source = readFileSync(root(path), "utf8");
    for (const match of source.matchAll(/@media[^{]*prefers-color-scheme\s*:\s*(?:dark|light)[^{]*\{/g)) {
      const line = source.slice(0, match.index).split("\n").length;
      offenders.push(`${path}:${line} ${match[0].trim()}`);
    }
  }
  assert.deepEqual(offenders, [], "a template re-declares colours per scheme; put the value in the token instead");
});

test("the 404 lede takes its colour from --muted", () => {
  const source = readFileSync(root("layouts/404.html"), "utf8");
  const lede = [...source.matchAll(/\.not-found-lede[^{]*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.equal(lede.length, 1, ".not-found-lede should be declared once, with no per-scheme override");
  assert.match(lede[0], /color:\s*var\(--muted/, "the lede's colour is not the --muted token");
});
