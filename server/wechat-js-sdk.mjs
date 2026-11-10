import { createHash, randomBytes } from "node:crypto";
import { AiError } from "./ai/policy.mjs";
export class WechatJsSdk {
  constructor(fetcher = fetch) {
    this.fetcher = fetcher;
    this.cache = new Map();
    this.pending = new Map();
  }
  async ticket(c) {
    const key = createHash("sha256")
      .update(c.appId + ":" + c.appSecret)
      .digest("hex");
    if (this.cache.get(key)?.until > Date.now())
      return this.cache.get(key).ticket;
    if (this.pending.has(key)) return this.pending.get(key);
    const job = (async () => {
      try {
        const r = await this.fetcher(
          "https://api.weixin.qq.com/cgi-bin/stable_token",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              grant_type: "client_credential",
              appid: c.appId,
              secret: c.appSecret,
              force_refresh: false,
            }),
            redirect: "error",
            signal: AbortSignal.timeout(10000),
          },
        );
        const token = await r.json();
        if (!r.ok || token.errcode || !token.access_token) throw Error();
        const response = await this.fetcher(
          "https://api.weixin.qq.com/cgi-bin/ticket/getticket?" +
            new URLSearchParams({
              access_token: token.access_token,
              type: "jsapi",
            }),
          { redirect: "error", signal: AbortSignal.timeout(10000) },
        );
        const value = await response.json();
        if (
          !response.ok ||
          value.errcode ||
          !value.ticket ||
          !Number.isFinite(value.expires_in) ||
          value.expires_in <= 300
        )
          throw Error();
        if (this.cache.size >= 20) this.cache.clear();
        this.cache.set(key, {
          ticket: value.ticket,
          until: Date.now() + (Math.min(value.expires_in, 7200) - 300) * 1000,
        });
        return value.ticket;
      } catch {
        throw new AiError(
          502,
          "微信 JSSDK 初始化失败，请检查 AppSecret、公众号接口权限和服务器 IP 白名单",
        );
      }
    })();
    this.pending.set(key, job);
    try {
      return await job;
    } finally {
      this.pending.delete(key);
    }
  }
  async configuration(c, value) {
    let url;
    try {
      url = new URL(value);
      if (
        typeof value !== "string" ||
        value.length > 4096 ||
        url.protocol !== "https:" ||
        url.origin !== c.frontendUrl ||
        url.pathname !== "/pay/wechat" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw Error();
    } catch {
      throw new AiError(400, "只能为本站微信支付页面签名");
    }
    if (!c.appSecret)
      throw new AiError(503, "JSAPI 支付需要配置公众号 AppSecret");
    const ticket = await this.ticket(c),
      timestamp = Math.floor(Date.now() / 1000),
      nonceStr = randomBytes(16).toString("hex");
    const signature = createHash("sha1")
      .update(
        `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url.href}`,
      )
      .digest("hex");
    return { appId: c.appId, timestamp, nonceStr, signature };
  }
}
