import mysql from "mysql2/promise";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { serialSession, studyStore, tableColumns } from "./study-store.mjs";
import { accountSchema, accountTables } from "./account-schema.mjs";

export async function createMySQLStore(options = {}) {
  const prefix =
    options.prefix ?? process.env.MYSQL_TABLE_PREFIX ?? "knowforge_";
  if (!/^[A-Za-z0-9_]{1,40}$/.test(prefix))
    throw new Error("Invalid MYSQL_TABLE_PREFIX");
  const config = {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE,
    charset: "utf8mb4",
    connectionLimit: 5,
    connectTimeout: 10000,
    ...options,
  };
  delete config.prefix;
  if (!config.user || !config.database)
    throw new Error("MYSQL_USER and MYSQL_DATABASE are required");
  if (process.env.MYSQL_SSL === "true")
    config.ssl = {
      rejectUnauthorized: true,
      verifyIdentity: true,
      ...(process.env.MYSQL_SSL_CA
        ? { ca: readFileSync(process.env.MYSQL_SSL_CA, "utf8") }
        : {}),
    };
  const pool = mysql.createPool(config);
  const context = new AsyncLocalStorage();
  const table = (name) => "`" + prefix + name + "`";
  const definitions = {
    progress:
      "id VARCHAR(191) PRIMARY KEY,status VARCHAR(16) NOT NULL,updatedAt VARCHAR(32) NOT NULL",
    notes:
      "id VARCHAR(191) PRIMARY KEY,content LONGTEXT NOT NULL,updatedAt VARCHAR(32) NOT NULL",
    bookmarks: "id VARCHAR(191) PRIMARY KEY,createdAt VARCHAR(32) NOT NULL",
    attempts:
      "id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,questionId VARCHAR(191) NOT NULL,kind VARCHAR(16) NOT NULL,answer LONGTEXT NOT NULL,score DOUBLE NULL,passed TINYINT NOT NULL,createdAt VARCHAR(32) NOT NULL,INDEX(questionId,createdAt,kind)",
    reviews:
      "questionId VARCHAR(191) PRIMARY KEY,dueAt VARCHAR(32) NOT NULL,intervalDays DOUBLE NOT NULL,streak INT NOT NULL,lastRating TINYINT NOT NULL,wrong TINYINT NOT NULL,updatedAt VARCHAR(32) NOT NULL",
    exams: "id VARCHAR(191) PRIMARY KEY,payload LONGTEXT NOT NULL",
    settings: "`key` VARCHAR(191) PRIMARY KEY,value LONGTEXT NOT NULL",
    lesson_attempts:
      "id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,exerciseId VARCHAR(191) NOT NULL,lessonId VARCHAR(191) NOT NULL,type VARCHAR(16) NOT NULL,answer LONGTEXT NOT NULL,passed TINYINT NOT NULL,passedTests INT NOT NULL,totalTests INT NOT NULL,createdAt VARCHAR(32) NOT NULL,INDEX(exerciseId,createdAt)",
    activity: "day VARCHAR(10) PRIMARY KEY,actions INT NOT NULL",
  };
  try {
    for (const [name, columns] of Object.entries(definitions))
      await pool.query(
        `CREATE TABLE IF NOT EXISTS ${table(name)} (${columns}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
      );
    for (const sql of accountSchema("mysql", prefix)) await pool.query(sql);
  } catch (error) {
    await pool.end();
    throw error;
  }
  // Only known table identifiers are mapped; all data stays in bound parameters.
  const names = [...Object.keys(tableColumns), ...accountTables].join("|");
  const qualify = (sql) =>
    sql.replace(
      new RegExp(`\\b(FROM|INTO|UPDATE)\\s+(${names})\\b`, "gi"),
      (_, keyword, name) => keyword + " " + table(name.toLowerCase()),
    );
  async function query(sql, args = []) {
    const connection = context.getStore()?.connection || pool;
    const [rows] = await connection.execute(
      { sql: qualify(sql), timeout: 10000 },
      args,
    );
    return rows;
  }
  return studyStore({
    driver: "mysql",
    prefix,
    all: (sql, ...args) => query(sql, args),
    get: async (sql, ...args) => (await query(sql, args))[0],
    run: (sql, ...args) => query(sql, args),
    async exec(sql) {
      const session = context.getStore();
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) {
        if (!session)
          throw new Error("Transactions require a database session");
        if (sql === "BEGIN") {
          await session.connection.beginTransaction();
          session.transaction = true;
        } else if (sql === "COMMIT") {
          await session.connection.commit();
          session.transaction = false;
        } else {
          await session.connection.rollback();
          session.transaction = false;
        }
      } else await query(sql);
    },
    session: serialSession(async (callback) => {
      const connection = await pool.getConnection();
      const session = { connection, transaction: false };
      try {
        return await context.run(session, callback);
      } finally {
        try {
          if (session.transaction) await connection.rollback();
        } finally {
          connection.release();
        }
      }
    }),
    close: () => pool.end(),
  });
}
