export const wechatTables = [
  "auth_wechat",
  "wechat_flows",
  "payment_orders",
  "wechat_configurations",
  "wechat_configuration_head",
  "wechat_config_bindings",
];
export function wechatSchema(driver, prefix = "") {
  const mysql = driver === "mysql",
    text = mysql ? "VARCHAR(191)" : "TEXT",
    long = mysql ? "LONGTEXT" : "TEXT";
  const definitions = {
    wechat_configurations: `id ${text} PRIMARY KEY,encryptedConfig ${long} NOT NULL,createdAt ${text} NOT NULL,actorId ${text} NOT NULL`,
    wechat_configuration_head: `id ${text} PRIMARY KEY,configId ${text} NOT NULL`,
    wechat_config_bindings: `id ${text} PRIMARY KEY,configId ${text} NOT NULL`,
    auth_wechat: `id ${text} PRIMARY KEY,userId ${text} NOT NULL,appId ${text} NOT NULL,openid ${text} NOT NULL,UNIQUE(appId,openid)`,
    wechat_flows: `id ${text} PRIMARY KEY,secretHash ${text} NOT NULL,status ${text} NOT NULL,userId ${text} NOT NULL,expiresAt ${text} NOT NULL,createdAt ${text} NOT NULL`,
    payment_orders: `id ${text} PRIMARY KEY,userId ${text} NOT NULL,requestId ${text} NOT NULL UNIQUE,versionId ${text} NOT NULL,amountFen INT NOT NULL,status ${text} NOT NULL,transactionId ${text} UNIQUE,product ${long} NOT NULL,intent ${long} NOT NULL,appId ${text} NOT NULL,merchantId ${text} NOT NULL,createdAt ${text} NOT NULL,expiresAt ${text} NOT NULL,paidAt ${text} NOT NULL`,
  };
  const tables = Object.entries(definitions).map(
    ([name, columns]) =>
      `CREATE TABLE IF NOT EXISTS \`${prefix}${name}\` (${columns}${mysql && !name.startsWith("wechat_config") ? ",INDEX(userId)" : ""})${mysql ? " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin" : ""}`,
  );
  return [
    ...tables,
    ...(mysql
      ? []
      : Object.keys(definitions)
          .filter((name) => !name.startsWith("wechat_config"))
          .map(
            (name) =>
              `CREATE INDEX IF NOT EXISTS \`${prefix}${name}_user\` ON \`${prefix}${name}\` (userId)`,
          )),
  ];
}
