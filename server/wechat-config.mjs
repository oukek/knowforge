import { createPrivateKey, createPublicKey, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  PRODUCTION_FRONTEND_ORIGIN,
  PRODUCTION_API_ORIGIN,
} from "../shared/deployment.mjs";
import { AiError, encrypt, decrypt, encryptionKey } from "./ai/policy.mjs";
export const emptyWechatConfig = () => ({
  loginEnabled: false,
  payEnabled: false,
  appId: "",
  appSecret: "",
  frontendUrl: PRODUCTION_FRONTEND_ORIGIN,
  apiUrl: PRODUCTION_API_ORIGIN,
  merchantId: "",
  merchantSerial: "",
  platformSerial: "",
  privateKey: "",
  platformPublicKey: "",
  apiV3Key: "",
});
const secretFields = [
  "appSecret",
  "privateKey",
  "platformPublicKey",
  "apiV3Key",
];
const text = z.string().trim().max(16384);
const schemas = {
  login: z
    .object({
      revision: z.string(),
      loginEnabled: z.boolean(),
      appId: text,
      appSecret: text.optional(),
      frontendUrl: text,
      apiUrl: text,
    })
    .strict(),
  payment: z
    .object({
      revision: z.string(),
      payEnabled: z.boolean(),
      merchantId: text,
      merchantSerial: text,
      platformSerial: text,
      privateKey: text.optional(),
      platformPublicKey: text.optional(),
      apiV3Key: text.optional(),
    })
    .strict(),
};
function validate(c) {
  for (const key of ["apiUrl", "frontendUrl"]) {
    try {
      const url = new URL(c[key]);
      if (url.protocol !== "https:" || url.origin !== c[key]) throw Error();
    } catch {
      throw new AiError(
        400,
        "前端和 API 地址须为不带路径、尾部斜杠的 HTTPS 源地址",
      );
    }
  }
  if (
    (c.appId || c.loginEnabled || c.payEnabled) &&
    !/^wx[a-zA-Z0-9]{8,30}$/.test(c.appId)
  )
    throw new AiError(400, "请输入有效的公众号 AppID");
  if (c.loginEnabled && !/^[a-zA-Z0-9]{16,128}$/.test(c.appSecret))
    throw new AiError(400, "开放登录需要有效的 AppSecret");
  if (c.payEnabled) {
    if (
      !/^\d{6,32}$/.test(c.merchantId) ||
      !/^[A-Fa-f0-9]{16,64}$/.test(c.merchantSerial) ||
      !/^(PUB_KEY_ID_\w+|[A-Fa-f0-9]{16,64})$/.test(c.platformSerial) ||
      Buffer.byteLength(c.apiV3Key) !== 32
    )
      throw new AiError(
        400,
        "请填写有效的商户号、证书标识和 32 字节 API v3 密钥",
      );
    try {
      for (const key of [
        createPrivateKey(c.privateKey),
        createPublicKey(c.platformPublicKey),
      ])
        if (
          key.asymmetricKeyType !== "rsa" ||
          (key.asymmetricKeyDetails?.modulusLength || 0) < 2048
        )
          throw Error();
    } catch {
      throw new AiError(
        400,
        "商户私钥及微信支付公钥须为有效的 2048 位或以上 RSA PEM",
      );
    }
  }
}
export class WechatConfiguration {
  constructor(repo, rootKey) {
    this.repo = repo;
    this.rootKey = rootKey;
  }
  keyReady() {
    try {
      encryptionKey(this.rootKey);
      return true;
    } catch {
      return false;
    }
  }
  decode(row) {
    if (!row) return { ...emptyWechatConfig(), revision: "" };
    try {
      return {
        ...JSON.parse(decrypt(row.encryptedConfig, this.rootKey)),
        revision: row.id,
      };
    } catch {
      throw new AiError(
        503,
        "微信配置无法解密，请检查服务器主密钥并从备份恢复；不会覆盖现有密文",
      );
    }
  }
  async raw(db, id) {
    if (id) return db.get("SELECT * FROM wechat_configurations WHERE id=?", id);
    const head = await db.get(
      "SELECT configId FROM wechat_configuration_head WHERE id=?",
      "main",
    );
    return head
      ? db.get("SELECT * FROM wechat_configurations WHERE id=?", head.configId)
      : null;
  }
  runtime(id) {
    return this.repo.read(async (db) => this.decode(await this.raw(db, id)));
  }
  async view() {
    const config = await this.runtime(),
      result = { ...config, encryptionReady: this.keyReady() };
    for (const key of secretFields) {
      result["has" + key[0].toUpperCase() + key.slice(1)] = !!result[key];
      delete result[key];
    }
    result.oauthCallback = config.apiUrl + "/api/auth/wechat/callback";
    result.paymentNotify = config.apiUrl + "/api/payments/wechat/notify";
    return result;
  }
  async save(section, body, actor) {
    const input = schemas[section].parse(body);
    if (!this.keyReady())
      throw new AiError(
        503,
        "请先在服务器配置 AI_ENCRYPTION_KEY，用于加密微信配置",
      );
    await this.repo.transaction(async (db) => {
      await db.run(
        (db.driver === "mysql" ? "INSERT IGNORE" : "INSERT OR IGNORE") +
          " INTO wechat_configuration_head(id,configId) VALUES(?,?)",
        "main",
        "",
      );
      const head = await db.get(
        "SELECT configId FROM wechat_configuration_head WHERE id=?" +
          (db.driver === "mysql" ? " FOR UPDATE" : ""),
        "main",
      );
      if (head.configId !== input.revision)
        throw new AiError(409, "微信配置已被修改，请刷新后重新编辑");
      const old = this.decode(await this.raw(db, head.configId)),
        next = { ...old, ...input };
      for (const field of secretFields)
        next[field] = input[field]?.trim() || old[field];
      if (section === "login" && old.appId && next.appId !== old.appId) {
        if (!input.appSecret?.trim())
          throw new AiError(400, "更换 AppID 需要重新填写对应 AppSecret");
        if (old.payEnabled || next.payEnabled)
          throw new AiError(409, "请先关闭新购买，再更换公众号并重新配置支付");
      }
      if (
        section === "payment" &&
        old.merchantId &&
        next.merchantId !== old.merchantId &&
        (!input.privateKey?.trim() || !input.apiV3Key?.trim())
      )
        throw new AiError(400, "更换商户号需要重新填写商户私钥与 API v3 密钥");
      validate(next);
      const id = randomUUID();
      delete next.revision;
      await db.run(
        "INSERT INTO wechat_configurations(id,encryptedConfig,createdAt,actorId) VALUES(?,?,?,?)",
        id,
        encrypt(JSON.stringify(next), this.rootKey),
        new Date().toISOString(),
        actor,
      );
      await db.run(
        "UPDATE wechat_configuration_head SET configId=? WHERE id=?",
        id,
        "main",
      );
      await this.repo.audit(db, actor, "wechat.configuration", {
        section,
        revision: id,
        loginEnabled: next.loginEnabled,
        payEnabled: next.payEnabled,
      });
    });
    return this.view();
  }
  async bind(db, key, revision) {
    if (revision)
      await db.run(
        "INSERT INTO wechat_config_bindings(id,configId) VALUES(?,?)",
        key,
        revision,
      );
  }
  async bound(key) {
    return this.repo.read(async (db) => {
      const binding = await db.get(
        "SELECT configId FROM wechat_config_bindings WHERE id=?",
        key,
      );
      const bound = this.decode(await this.raw(db, binding?.configId));
      if (!binding) return bound;
      // Use the latest credentials for the bound merchant / account, preserving original identity and URLs.
      const rows = await db.all(
        "SELECT * FROM wechat_configurations ORDER BY createdAt DESC,id DESC LIMIT 200",
      );
      let accountDone = false,
        merchantDone = false;
      for (const row of rows) {
        const c = this.decode(row);
        if (!accountDone && c.appId === bound.appId) {
          bound.appSecret = c.appSecret;
          accountDone = true;
        }
        if (
          !merchantDone &&
          c.merchantId === bound.merchantId &&
          c.merchantId
        ) {
          for (const field of [
            "privateKey",
            "merchantSerial",
            "platformSerial",
            "platformPublicKey",
            "apiV3Key",
          ])
            bound[field] = c[field];
          merchantDone = true;
        }
        if (accountDone && merchantDone) break;
      }
      return bound;
    });
  }
  notificationConfigs() {
    return this.repo.read(async (db) =>
      (
        await db.all(
          "SELECT * FROM wechat_configurations ORDER BY createdAt DESC,id DESC LIMIT 200",
        )
      ).map((row) => this.decode(row)),
    );
  }
}
