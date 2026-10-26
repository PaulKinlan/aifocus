// Minimal D1 stand-in over node:sqlite, enough for the reader functions:
// prepare().bind().first()/all()/run() and db.batch().
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) {
    return new Statement(this.db, this.sql, params);
  }
  async first() {
    return this.db.prepare(this.sql).get(...this.params) ?? null;
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this.params), success: true };
  }
  async run() {
    const info = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(info.changes) } };
  }
  async exec() {
    return /^\s*select/i.test(this.sql) ? this.all() : this.run();
  }
}

export function createD1(migrationPath) {
  const db = new DatabaseSync(":memory:");
  if (migrationPath) db.exec(readFileSync(migrationPath, "utf8"));
  return {
    raw: db,
    prepare(sql) {
      return new Statement(db, sql);
    },
    async batch(statements) {
      const out = [];
      for (const s of statements) out.push(await s.exec());
      return out;
    },
  };
}
