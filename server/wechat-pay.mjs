import { randomBytes, sign, verify, createDecipheriv } from "node:crypto";
import { AiError } from "./ai/policy.mjs";
const fail = () => new AiError(502, "微信支付校验失败，请稍后核对订单");
export class WechatPay {
  constructor(config, fetcher = fetch) {
    this.config = config;
    this.fetcher = fetcher;
  }
  verify(raw, headers) {
    const get = (name) => (headers.get ? headers.get(name) : headers[name]);
    const stamp = get("wechatpay-timestamp"),
      nonce = get("wechatpay-nonce"),
      signature = get("wechatpay-signature");
    if (
      !/^\d+$/.test(stamp || "") ||
      Math.abs(Date.now() / 1000 - Number(stamp)) > 300 ||
      !nonce ||
      typeof signature !== "string" ||
      get("wechatpay-serial") !== this.config.platformSerial ||
      !verify(
        "RSA-SHA256",
        Buffer.concat([
          Buffer.from(`${stamp}\n${nonce}\n`),
          Buffer.from(raw),
          Buffer.from("\n"),
        ]),
        this.config.platformPublicKey,
        Buffer.from(signature, "base64"),
      )
    )
      throw fail();
  }
  async request(method, path, body) {
    const c = this.config,
      stamp = String(Math.floor(Date.now() / 1000)),
      nonce = randomBytes(16).toString("hex"),
      raw = body ? JSON.stringify(body) : "";
    const signature = sign(
      "RSA-SHA256",
      Buffer.from(`${method}\n${path}\n${stamp}\n${nonce}\n${raw}\n`),
      c.privateKey,
    ).toString("base64");
    const response = await this.fetcher(
      `https://api.mch.weixin.qq.com${path}`,
      {
        method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${c.merchantId}",nonce_str="${nonce}",timestamp="${stamp}",serial_no="${c.merchantSerial}",signature="${signature}"`,
          "Wechatpay-Serial": c.platformSerial,
        },
        body: raw || undefined,
        signal: AbortSignal.timeout(15000),
      },
    );
    const buffer = Buffer.from(await response.arrayBuffer());
    this.verify(buffer, response.headers);
    if (!response.ok)
      throw new AiError(502, "微信支付暂不可用，请稍后核对或重试原订单");
    return buffer.length ? JSON.parse(buffer.toString()) : {};
  }
  async create(order, mode, openid) {
    const c = this.config;
    const result = await this.request("POST", `/v3/pay/transactions/${mode}`, {
      appid: c.appId,
      mchid: c.merchantId,
      description: JSON.parse(order.product).name,
      out_trade_no: order.id,
      time_expire: order.expiresAt.replace(/\.\d{3}Z$/, "+00:00"),
      notify_url: c.apiUrl + "/api/payments/wechat/notify",
      amount: { total: Number(order.amountFen), currency: "CNY" },
      ...(mode === "jsapi" ? { payer: { openid } } : {}),
    });
    if (mode === "native") {
      if (
        typeof result.code_url !== "string" ||
        !result.code_url.startsWith("weixin://wxpay/") ||
        result.code_url.length > 1024
      )
        throw fail();
      return { type: "qr", codeUrl: result.code_url };
    }
    if (!/^[\w-]{1,128}$/.test(result.prepay_id || "")) throw fail();
    const parameters = {
      appId: c.appId,
      timeStamp: String(Math.floor(Date.now() / 1000)),
      nonceStr: randomBytes(16).toString("hex"),
      package: `prepay_id=${result.prepay_id}`,
      signType: "RSA",
    };
    parameters.paySign = sign(
      "RSA-SHA256",
      Buffer.from(
        `${c.appId}\n${parameters.timeStamp}\n${parameters.nonceStr}\n${parameters.package}\n`,
      ),
      c.privateKey,
    ).toString("base64");
    return { type: "jsapi", parameters };
  }
  query(id) {
    return this.request(
      "GET",
      `/v3/pay/transactions/out-trade-no/${id}?mchid=${this.config.merchantId}`,
    );
  }
  notification(raw, headers) {
    this.verify(raw, headers);
    const envelope = JSON.parse(raw.toString());
    if (
      envelope.event_type !== "TRANSACTION.SUCCESS" ||
      envelope.resource_type !== "encrypt-resource" ||
      envelope.resource?.algorithm !== "AEAD_AES_256_GCM"
    )
      throw fail();
    const r = envelope.resource,
      ciphertext = Buffer.from(r.ciphertext, "base64"),
      decipher = createDecipheriv(
        "aes-256-gcm",
        Buffer.from(this.config.apiV3Key),
        Buffer.from(r.nonce),
      );
    decipher.setAuthTag(ciphertext.subarray(-16));
    decipher.setAAD(Buffer.from(r.associated_data || ""));
    return JSON.parse(
      Buffer.concat([
        decipher.update(ciphertext.subarray(0, -16)),
        decipher.final(),
      ]).toString(),
    );
  }
}
