export const aiTables = [
  "auth_roles",
  "ai_config",
  "ai_health",
  "ai_accounts",
  "ai_ledger",
  "ai_runs",
  "ai_sessions",
  "ai_questions",
  "admin_audit",
];

export function aiSchema(driver, prefix = "") {
  const mysql = driver === "mysql";
  const id = mysql ? "VARCHAR(191)" : "TEXT";
  const text = mysql ? "LONGTEXT" : "TEXT";
  const stamp = mysql ? "VARCHAR(32)" : "TEXT";
  const definitions = {
    auth_roles: `userId ${id} PRIMARY KEY,role ${id} NOT NULL`,
    ai_config: `id ${id} PRIMARY KEY,data ${text} NOT NULL,encryptedKey ${text} NOT NULL,updatedAt ${stamp} NOT NULL`,
    ai_health: `id ${id} PRIMARY KEY,data ${text} NOT NULL,updatedAt ${stamp} NOT NULL`,
    ai_accounts: `userId ${id} PRIMARY KEY,balance BIGINT NOT NULL,reserved BIGINT NOT NULL,blocked INT NOT NULL,updatedAt ${stamp} NOT NULL`,
    ai_ledger: `id ${id} PRIMARY KEY,userId ${id} NOT NULL,runId ${id},kind ${id} NOT NULL,amount BIGINT NOT NULL,balance BIGINT NOT NULL,reserved BIGINT NOT NULL,note ${text} NOT NULL,createdAt ${stamp} NOT NULL`,
    ai_runs: `id ${id} PRIMARY KEY,userId ${id} NOT NULL,requestKey ${id} NOT NULL,fingerprint ${id} NOT NULL,feature ${id} NOT NULL,status ${id} NOT NULL,sessionId ${id} NOT NULL,lessonId ${id} NOT NULL,questionId ${id} NOT NULL,data ${text} NOT NULL,inputTokens BIGINT,outputTokens BIGINT,chargedPoints BIGINT,createdAt ${stamp} NOT NULL,updatedAt ${stamp} NOT NULL,UNIQUE(userId,requestKey)`,
    ai_sessions: `id ${id} PRIMARY KEY,userId ${id} NOT NULL,status ${id} NOT NULL,data ${text} NOT NULL,createdAt ${stamp} NOT NULL,updatedAt ${stamp} NOT NULL`,
    ai_questions: `id ${id} PRIMARY KEY,userId ${id} NOT NULL,lessonId ${id} NOT NULL,parentQuestionId ${id} NOT NULL,runId ${id} NOT NULL,data ${text} NOT NULL,createdAt ${stamp} NOT NULL`,
    admin_audit: `id ${id} PRIMARY KEY,userId ${id} NOT NULL,action ${id} NOT NULL,data ${text} NOT NULL,createdAt ${stamp} NOT NULL`,
  };
  return Object.entries(definitions).map(([name, columns]) => {
    const index =
      mysql &&
      ["ai_runs", "ai_sessions", "ai_questions", "ai_ledger"].includes(name)
        ? ",INDEX(userId,createdAt)"
        : "";
    return (
      "CREATE TABLE IF NOT EXISTS `" +
      prefix +
      name +
      "` (" +
      columns +
      index +
      ")" +
      (mysql
        ? " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin"
        : "")
    );
  });
}
