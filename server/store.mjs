import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  function state() {
    return {
      progress: Object.fromEntries(
        all("SELECT * FROM progress").map((x) => [x.id, x]),
      ),
      notes: Object.fromEntries(
        all("SELECT * FROM notes").map((x) => [x.id, x]),
      ),
      bookmarks: all("SELECT id FROM bookmarks").map((x) => x.id),
      attempts: all("SELECT * FROM attempts ORDER BY id DESC LIMIT 5000").map(
        (x) => ({ ...x, answer: JSON.parse(x.answer), passed: !!x.passed }),
      ),
      exerciseAttempts: all(
        "SELECT * FROM lesson_attempts ORDER BY id DESC LIMIT 5000",
      ).map((x) => ({ ...x, passed: !!x.passed })),
      reviews: all("SELECT * FROM reviews"),
      exams: all("SELECT payload FROM exams")
        .map((x) => JSON.parse(x.payload))
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      settings: Object.fromEntries(
        all("SELECT * FROM settings").map((x) => [x.key, JSON.parse(x.value)]),
      ),
      activity: all("SELECT * FROM activity ORDER BY day"),
    };
  }
  function touch(now) {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(now));
    run(
      "INSERT INTO activity(day,actions) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET actions=actions+1",
      day,
    );
  }
  function schedule(questionId, rating, wrong, now = new Date().toISOString()) {
    const old = db
      .prepare("SELECT * FROM reviews WHERE questionId=?")
      .get(questionId);
    const { intervalDays, streak, dueAt } = scheduleReview(old, rating, now);
    run(
      "INSERT INTO reviews VALUES(?,?,?,?,?,?,?) ON CONFLICT(questionId) DO UPDATE SET dueAt=excluded.dueAt,intervalDays=excluded.intervalDays,streak=excluded.streak,lastRating=excluded.lastRating,wrong=excluded.wrong,updatedAt=excluded.updatedAt",
      questionId,
      dueAt,
      intervalDays,
      streak,
      rating,
      wrong ? 1 : 0,
      now,
    );
  }
  return { db, state, run, all, touch, schedule, close: () => db.close() };
}
export function scheduleReview(old, rating, now) {
  const prev = old?.intervalDays || 0;
  const intervalDays =
    rating === 0
      ? 10 / 1440
      : rating === 1
        ? 1
        : rating === 2
          ? Math.max(2, Math.round(prev * 1.8))
          : Math.max(4, Math.round(prev * 2.5));
  const streak = rating < 2 ? 0 : (old?.streak || 0) + 1;
  return {
    intervalDays,
    streak,
    dueAt: new Date(Date.parse(now) + intervalDays * 86400000).toISOString(),
  };
}
