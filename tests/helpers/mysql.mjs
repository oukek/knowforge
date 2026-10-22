import { randomBytes } from "node:crypto";
import { createMySQLStore } from "../../server/mysql-store.mjs";
import { accountTables } from "../../server/account-schema.mjs";
import { tableColumns } from "../../server/study-store.mjs";

// Every test owns its table namespace; never clear an existing database.
export async function mysqlFixture() {
  const prefix = `kf_test_${process.pid}_${randomBytes(5).toString("hex")}_`;
  const store = await createMySQLStore({ prefix });
  return {
    store,
    prefix,
    async cleanup() {
      try {
        for (const name of [...Object.keys(tableColumns), ...accountTables])
          await store.exec(`DROP TABLE IF EXISTS \`${prefix}${name}\``);
      } finally {
        await store.close();
      }
    },
  };
}
