import { studyStore, serialSession } from "./study-store.mjs";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { accountSchema } from "./account-schema.mjs";
export function createStore(path = resolve("runtime/study.sqlite")) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS progress(id TEXT PRIMARY KEY,status TEXT NOT NULL,updatedAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY,content TEXT NOT NULL,updatedAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS bookmarks(id TEXT PRIMARY KEY,createdAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS attempts(id INTEGER PRIMARY KEY AUTOINCREMENT,questionId TEXT NOT NULL,kind TEXT NOT NULL,answer TEXT NOT NULL,score REAL,passed INTEGER NOT NULL,createdAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS reviews(questionId TEXT PRIMARY KEY,dueAt TEXT NOT NULL,intervalDays REAL NOT NULL,streak INTEGER NOT NULL,lastRating INTEGER NOT NULL,wrong INTEGER NOT NULL,updatedAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS exams(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS lesson_attempts(id INTEGER PRIMARY KEY AUTOINCREMENT,exerciseId TEXT NOT NULL,lessonId TEXT NOT NULL,type TEXT NOT NULL,answer TEXT NOT NULL,passed INTEGER NOT NULL,passedTests INTEGER NOT NULL,totalTests INTEGER NOT NULL,createdAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS activity(day TEXT PRIMARY KEY,actions INTEGER NOT NULL DEFAULT 0);
 `);
  let transaction = false;
  for (const sql of accountSchema("sqlite")) db.exec(sql);
  return studyStore({
    driver: "sqlite",
    db,
    all: (sql, ...args) => db.prepare(sql).all(...args),
    get: (sql, ...args) => db.prepare(sql).get(...args),
    run: (sql, ...args) => db.prepare(sql).run(...args),
    exec(sql) {
      if (sql === "ROLLBACK" && !transaction) return;
      db.exec(sql);
      if (sql === "BEGIN") transaction = true;
      if (sql === "COMMIT" || sql === "ROLLBACK") transaction = false;
    },
    session: serialSession(async (callback) => {
      try {
        return await callback();
      } finally {
        if (transaction) {
          db.exec("ROLLBACK");
          transaction = false;
        }
      }
    }),
    close: () => db.close(),
  });
}
export { scheduleReview } from "./study-store.mjs";
