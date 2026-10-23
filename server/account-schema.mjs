import { aiTables, aiSchema } from "./ai/schema.mjs";
// Separate tables leave old shared records inaccessible to public accounts.
export const accountTables = [
  "auth_users",
  "auth_sessions",
  "auth_profiles",
  "user_progress",
  "user_notes",
  "user_bookmarks",
  "user_attempts",
  "user_reviews",
  "user_exams",
  "user_settings",
  "user_lesson_attempts",
  "user_activity",
  ...aiTables,
];

export function accountSchema(driver, prefix = "") {
  const mysql = driver === "mysql";
  const text = mysql ? "VARCHAR(191)" : "TEXT";
  const stamp = mysql ? "VARCHAR(32)" : "TEXT";
  const long = mysql ? "LONGTEXT" : "TEXT";
  const uid = mysql ? "VARCHAR(36)" : "TEXT";
  const auto = mysql
    ? "BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY"
    : "INTEGER PRIMARY KEY AUTOINCREMENT";
  const definitions = {
    auth_users: `id ${uid} PRIMARY KEY,username ${mysql ? "VARCHAR(32)" : "TEXT"} NOT NULL UNIQUE,passwordHash ${mysql ? "VARCHAR(255)" : "TEXT"} NOT NULL,createdAt ${stamp} NOT NULL`,
    auth_sessions: `id ${mysql ? "VARCHAR(64)" : "TEXT"} PRIMARY KEY,userId ${uid} NOT NULL,csrfToken ${mysql ? "VARCHAR(64)" : "TEXT"} NOT NULL,expiresAt ${stamp} NOT NULL,createdAt ${stamp} NOT NULL`,
    auth_profiles: `userId ${uid} PRIMARY KEY,publicId ${mysql ? "VARCHAR(8)" : "TEXT"} NOT NULL UNIQUE,displayName ${mysql ? "VARCHAR(40)" : "TEXT"} NOT NULL,updatedAt ${stamp} NOT NULL`,
    user_progress: `userId ${uid} NOT NULL,id ${text} NOT NULL,status ${text} NOT NULL,updatedAt ${stamp} NOT NULL,PRIMARY KEY(userId,id)`,
    user_notes: `userId ${uid} NOT NULL,id ${text} NOT NULL,content ${long} NOT NULL,updatedAt ${stamp} NOT NULL,PRIMARY KEY(userId,id)`,
    user_bookmarks: `userId ${uid} NOT NULL,id ${text} NOT NULL,createdAt ${stamp} NOT NULL,PRIMARY KEY(userId,id)`,
    user_attempts: `id ${auto},userId ${uid} NOT NULL,questionId ${text} NOT NULL,kind ${text} NOT NULL,answer ${long} NOT NULL,score DOUBLE,passed INT NOT NULL,createdAt ${stamp} NOT NULL`,
    user_reviews: `userId ${uid} NOT NULL,questionId ${text} NOT NULL,dueAt ${stamp} NOT NULL,intervalDays DOUBLE NOT NULL,streak INT NOT NULL,lastRating INT NOT NULL,wrong INT NOT NULL,updatedAt ${stamp} NOT NULL,PRIMARY KEY(userId,questionId)`,
    user_exams: `userId ${uid} NOT NULL,id ${text} NOT NULL,payload ${long} NOT NULL,PRIMARY KEY(userId,id)`,
    user_settings: `userId ${uid} NOT NULL,\`key\` ${text} NOT NULL,value ${long} NOT NULL,PRIMARY KEY(userId,\`key\`)`,
    user_lesson_attempts: `id ${auto},userId ${uid} NOT NULL,exerciseId ${text} NOT NULL,lessonId ${text} NOT NULL,type ${text} NOT NULL,answer ${long} NOT NULL,passed INT NOT NULL,passedTests INT NOT NULL,totalTests INT NOT NULL,createdAt ${stamp} NOT NULL`,
    user_activity: `userId ${uid} NOT NULL,day ${mysql ? "VARCHAR(10)" : "TEXT"} NOT NULL,actions INT NOT NULL,PRIMARY KEY(userId,day)`,
  };
  return [
    ...Object.entries(definitions).map(([name, columns]) => {
      const index =
        mysql &&
        ["user_attempts", "user_lesson_attempts", "auth_sessions"].includes(
          name,
        )
          ? ",INDEX(userId)"
          : "";
      return `CREATE TABLE IF NOT EXISTS \`${prefix}${name}\` (${columns}${index})${mysql ? " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin" : ""}`;
    }),
    ...aiSchema(driver, prefix),
  ];
}
