import { randomUUID } from "node:crypto";
import { AiError, now } from "./policy.mjs";
import { micro } from "./amounts.mjs";

export const decodeRun = (row) =>
  row ? { ...row, ...JSON.parse(row.data), data: undefined } : null;
export class AiRepository {
  constructor(store) {
    this.store = store;
  }
  read(callback) {
    return this.store.session(() => callback(this.store));
  }
  async transaction(callback) {
    return this.store.session(async () => {
      await this.store.exec("BEGIN");
      try {
        const value = await callback(this.store);
        await this.store.exec("COMMIT");
        return value;
      } catch (e) {
        await this.store.exec("ROLLBACK");
        throw e;
      }
    });
  }
  async configRaw(db = this.store) {
    return db.get("SELECT * FROM ai_config WHERE id=?", "main");
  }
  async account(db, userId, lock = false) {
    let row = await db.get(
      "SELECT * FROM ai_accounts WHERE userId=?" +
        (lock && db.driver === "mysql" ? " FOR UPDATE" : ""),
      userId,
    );
    if (!row) {
      // New accounts start at zero; public registration never grants spendable credit.
      const sql =
        db.driver === "mysql"
          ? "INSERT IGNORE INTO ai_accounts"
          : "INSERT OR IGNORE INTO ai_accounts";
      // INSERT qualification only maps INTO; the fixed identifiers remain server-owned.
      await db.run(
        sql + "(userId,balance,reserved,blocked,updatedAt) VALUES(?,?,?,?,?)",
        userId,
        0,
        0,
        0,
        now(),
      );
      row = await db.get(
        "SELECT * FROM ai_accounts WHERE userId=?" +
          (lock && db.driver === "mysql" ? " FOR UPDATE" : ""),
        userId,
      );
    }
    return {
      ...row,
      balance: Number(row.balance),
      reserved: Number(row.reserved),
      blocked: !!row.blocked,
    };
  }
  async saveAccount(db, account) {
    await db.run(
      "UPDATE ai_accounts SET balance=?,reserved=?,blocked=?,updatedAt=? WHERE userId=?",
      account.balance,
      account.reserved,
      account.blocked ? 1 : 0,
      now(),
      account.userId,
    );
  }
  async ledger(db, account, runId, kind, amount, note, id = randomUUID()) {
    await db.run(
      "INSERT INTO ai_ledger(id,userId,runId,kind,amount,balance,reserved,note,createdAt) VALUES(?,?,?,?,?,?,?,?,?)",
      id,
      account.userId,
      runId || "",
      kind,
      amount,
      account.balance,
      account.reserved,
      note,
      now(),
    );
  }
  async audit(db, userId, action, data) {
    await db.run(
      "INSERT INTO admin_audit(id,userId,action,data,createdAt) VALUES(?,?,?,?,?)",
      randomUUID(),
      userId,
      action,
      JSON.stringify(data),
      now(),
    );
  }
  async runRaw(id, db = this.store) {
    return decodeRun(await db.get("SELECT * FROM ai_runs WHERE id=?", id));
  }
  async saveRun(db, run) {
    run.updatedAt = now();
    const { data, ...payload } = run;
    await db.run(
      "UPDATE ai_runs SET status=?,data=?,inputTokens=?,outputTokens=?,chargedPoints=?,updatedAt=? WHERE id=?",
      run.status,
      JSON.stringify(payload),
      run.usage?.input ?? null,
      run.usage?.output ?? null,
      run.chargedPoints == null
        ? null
        : run.billingVersion === 2
          ? String(micro(run.chargedPoints))
          : run.chargedPoints,
      run.updatedAt,
      run.id,
    );
  }
  async insertRun(db, run) {
    await db.run(
      "INSERT INTO ai_runs(id,userId,requestKey,fingerprint,feature,status,sessionId,lessonId,questionId,data,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      run.id,
      run.userId,
      run.requestKey,
      run.fingerprint,
      run.feature,
      run.status,
      run.sessionId || "",
      run.lessonId || "",
      run.questionId || "",
      JSON.stringify(run),
      run.createdAt,
      run.createdAt,
    );
  }
  async sessionRaw(id, userId, db = this.store) {
    const row = await db.get(
      "SELECT * FROM ai_sessions WHERE id=? AND userId=?",
      id,
      userId,
    );
    return row
      ? {
          ...JSON.parse(row.data),
          id: row.id,
          userId,
          status: row.status,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }
      : null;
  }
  async saveSession(db, session) {
    await db.run(
      "UPDATE ai_sessions SET status=?,data=?,updatedAt=? WHERE id=? AND userId=?",
      session.status,
      JSON.stringify(session),
      now(),
      session.id,
      session.userId,
    );
  }
  async generatedRaw(userId, id, db = this.store) {
    const row = await db.get(
      "SELECT data FROM ai_questions WHERE id=? AND userId=?",
      id,
      userId,
    );
    return row ? JSON.parse(row.data) : null;
  }
  async generatedListRaw(userId, db = this.store) {
    const recent = await db.all(
      "SELECT data FROM ai_questions WHERE userId=? ORDER BY createdAt DESC LIMIT 200",
      userId,
    );
    const referenced = await db.all(
      "SELECT data FROM ai_questions WHERE userId=? AND id IN (SELECT questionId FROM user_reviews WHERE userId=? UNION SELECT id FROM user_bookmarks WHERE userId=? UNION SELECT id FROM user_notes WHERE userId=?) LIMIT 5000",
      userId,
      userId,
      userId,
      userId,
    );
    return [
      ...new Map(
        [...recent, ...referenced].map((row) => {
          const q = JSON.parse(row.data);
          return [q.id, q];
        }),
      ).values(),
    ];
  }
  async recoverExpired() {
    return this.transaction(async (db) => {
      const rows = await db.all(
        "SELECT * FROM ai_runs WHERE status=? AND updatedAt<?",
        "running",
        new Date(Date.now() - 120000).toISOString(),
      );
      for (const row of rows) {
        const run = decodeRun(row);
        run.status = "pending";
        run.error = "任务租约已过期，用量待管理员核对；预占额度暂不释放";
        run.errorCode = "AI_INTERRUPTED";
        await this.saveRun(db, run);
      }
    });
  }
}
