// Preserve Node's spec diagnostics while emitting only test files observed to
// execute a non-skipped test. A file's wrapper pass (or import/parse failure)
// is not evidence that any test inside it ran (aifocus-73qr).
import { spec } from "node:test/reporters";
import { compose } from "node:stream";
import path from "node:path";

export default async function* nodeTestEvidence(source) {
  const executed = new Set();
  async function* observe() {
    for await (const event of source) {
      if ((event.type === "test:pass" || event.type === "test:fail") &&
          event.data.entryFile && !event.data.skip && !event.data.todo) {
        const file = path.relative(process.cwd(), event.data.entryFile).replaceAll(path.sep, "/");
        if (file.startsWith("tests/") && file.endsWith(".test.mjs")) executed.add(file);
      }
      yield event;
    }
  }
  yield* compose(observe(), spec());
  for (const file of [...executed].sort()) yield `fast-gate: ran: ${file}\n`;
}
