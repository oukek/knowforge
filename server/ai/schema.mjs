export const aiTables = [
  "auth_roles",
  "ai_config",
  "ai_health",
  "ai_accounts",
  "ai_credit_accounts",
  "ai_credit_lots",
  "ai_credit_events",
  "ai_billing_units",
  "ai_products",
  "ai_product_versions",
  "ai_ledger",
  "ai_runs",
  "ai_model_invocations",
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
    ai_credit_accounts: `userId ${id} PRIMARY KEY,data ${text} NOT NULL,updatedAt ${stamp} NOT NULL`,
    ai_credit_lots: `id ${id} PRIMARY KEY,userId ${id} NOT NULL,source ${id} NOT NULL,title ${text} NOT NULL,granted BIGINT NOT NULL,available BIGINT NOT NULL,reserved BIGINT NOT NULL,consumed BIGINT NOT NULL,expired BIGINT NOT NULL,revoked BIGINT NOT NULL,expiresAt ${stamp} NOT NULL,data ${text} NOT NULL,createdAt ${stamp} NOT NULL,updatedAt ${stamp} NOT NULL`,
    ai_credit_events: `id ${id} PRIMARY KEY,userId ${id} NOT NULL,runId ${id} NOT NULL,kind ${id} NOT NULL,amount BIGINT NOT NULL,note ${text} NOT NULL,data ${text} NOT NULL,createdAt ${stamp} NOT NULL`,
    ai_billing_units: `id ${id} PRIMARY KEY,userId ${id} NOT NULL,feature ${id} NOT NULL,status ${id} NOT NULL,mode ${id} NOT NULL,quoted BIGINT NOT NULL,due BIGINT,charged BIGINT,waived BIGINT,budgetUsed BIGINT NOT NULL,data ${text} NOT NULL,createdAt ${stamp} NOT NULL,updatedAt ${stamp} NOT NULL`,
    ai_products: `id ${id} PRIMARY KEY,code ${id} NOT NULL UNIQUE,status ${id} NOT NULL,revision ${id} NOT NULL,publishedId ${id} NOT NULL,data ${text} NOT NULL,createdAt ${stamp} NOT NULL,updatedAt ${stamp} NOT NULL`,
    ai_product_versions: `id ${id} PRIMARY KEY,productId ${id} NOT NULL,version INT NOT NULL,data ${text} NOT NULL,createdAt ${stamp} NOT NULL`,
    ai_ledger: `id ${id} PRIMARY KEY,userId ${id} NOT NULL,runId ${id},kind ${id} NOT NULL,amount BIGINT NOT NULL,balance BIGINT NOT NULL,reserved BIGINT NOT NULL,note ${text} NOT NULL,createdAt ${stamp} NOT NULL`,
    ai_runs: `id ${id} PRIMARY KEY,userId ${id} NOT NULL,requestKey ${id} NOT NULL,fingerprint ${id} NOT NULL,feature ${id} NOT NULL,status ${id} NOT NULL,sessionId ${id} NOT NULL,lessonId ${id} NOT NULL,questionId ${id} NOT NULL,data ${text} NOT NULL,inputTokens BIGINT,outputTokens BIGINT,chargedPoints BIGINT,createdAt ${stamp} NOT NULL,updatedAt ${stamp} NOT NULL,UNIQUE(userId,requestKey)`,
    ai_model_invocations: `id ${id} PRIMARY KEY,modelId ${id} NOT NULL,runId ${id} NOT NULL,userId ${id} NOT NULL,questionId ${id} NOT NULL,feature ${id} NOT NULL,createdAt ${stamp} NOT NULL`,
    ai_sessions: `id ${id} PRIMARY KEY,userId ${id} NOT NULL,status ${id} NOT NULL,data ${text} NOT NULL,createdAt ${stamp} NOT NULL,updatedAt ${stamp} NOT NULL`,
    ai_questions: `id ${id} PRIMARY KEY,userId ${id} NOT NULL,lessonId ${id} NOT NULL,parentQuestionId ${id} NOT NULL,runId ${id} NOT NULL,data ${text} NOT NULL,createdAt ${stamp} NOT NULL`,
    admin_audit: `id ${id} PRIMARY KEY,userId ${id} NOT NULL,action ${id} NOT NULL,data ${text} NOT NULL,createdAt ${stamp} NOT NULL`,
  };
  return Object.entries(definitions).map(([name, columns]) => {
    const index =
      mysql &&
      [
        "ai_runs",
        "ai_model_invocations",
        "ai_sessions",
        "ai_questions",
        "ai_ledger",
        "ai_credit_lots",
        "ai_credit_events",
        "ai_billing_units",
      ].includes(name)
        ? ",INDEX(userId,createdAt)" +
          (name === "ai_model_invocations" ? ",INDEX(createdAt,modelId)" : "")
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
