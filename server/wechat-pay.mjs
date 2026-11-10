import {
  randomBytes,
  randomUUID,
  sign,
  verify,
  createDecipheriv,
} from "node:crypto";
import { AiError } from "./ai/policy.mjs";
const fail = () => new AiError(502, "微信支付校验失败，请稍后核对订单");
class WechatResponseError extends AiError {
  constructor(status, code) {
    super(502, "微信支付暂不可用，请稍后核对或重试原订单");
    this.upstreamStatus = status;
    this.upstreamCode = code;
  }
}
const diagnosticToken = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value)
    ? value
    : undefined;
export class WechatPay {
  constructor(config, fetcher = fetch, logger = console) {
    this.config = config;
    this.fetcher = fetcher;
    this.logger = logger;
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
  async request(method, path, body, { allowMissingOrder = false } = {}) {
    const c = this.config;
    let stage = "sign",
      response,
      payload,
      verified = false;
    try {
      const stamp = String(Math.floor(Date.now() / 1000)),
        nonce = randomBytes(16).toString("hex"),
        raw = body ? JSON.stringify(body) : "";
      const signature = sign(
        "RSA-SHA256",
        Buffer.from(`${method}\n${path}\n${stamp}\n${nonce}\n${raw}\n`),
        c.privateKey,
      ).toString("base64");
      stage = "network";
      response = await this.fetcher(`https://api.mch.weixin.qq.com${path}`, {
        method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${c.merchantId}",nonce_str="${nonce}",timestamp="${stamp}",serial_no="${c.merchantSerial}",signature="${signature}"`,
          "Wechatpay-Serial": c.platformSerial,
        },
        body: raw || undefined,
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
      stage = "read";
      const buffer = Buffer.from(await response.arrayBuffer());
      // Error codes from an unverified response must never change order state.
      try {
        payload = buffer.length ? JSON.parse(buffer.toString()) : {};
      } catch {}
      stage = "verify";
      this.verify(buffer, response.headers);
      verified = true;
      stage = "response";
      if (!response.ok) {
        const error = new WechatResponseError(
          response.status,
          diagnosticToken(payload?.code),
        );
        throw error;
      }
      stage = "parse";
      if (!payload || typeof payload !== "object" || Array.isArray(payload))
        throw new AiError(502, "微信支付响应格式异常，请稍后核对订单");
      return payload;
    } catch (cause) {
      if (
        allowMissingOrder &&
        cause instanceof WechatResponseError &&
        cause.upstreamStatus === 404 &&
        cause.upstreamCode === "ORDER_NOT_EXIST"
      )
        throw cause;
      const error =
        cause instanceof AiError
          ? cause
          : new AiError(502, "微信支付请求失败，请稍后核对或重试原订单");
      error.errorId = randomUUID();
      const get = (name) => response?.headers?.get(name);
      this.logger.error(
        "[wechat.pay.error]",
        JSON.stringify({
          errorId: error.errorId,
          method,
          path: path.split("?")[0],
          stage,
          status: response?.status,
          wechatCode: diagnosticToken(payload?.code),
          field: diagnosticToken(payload?.detail?.field),
          requestId: diagnosticToken(get("request-id")),
          responseVerified: verified,
          networkCode:
            stage === "network"
              ? diagnosticToken(cause.cause?.code || cause.code || cause.name)
              : undefined,
          expectedSerial:
            stage === "verify" ? diagnosticToken(c.platformSerial) : undefined,
          receivedSerial:
            stage === "verify"
              ? diagnosticToken(get("wechatpay-serial"))
              : undefined,
        }),
      );
      throw error;
    }
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
  async query(id) {
    try {
      return await this.request(
        "GET",
        `/v3/pay/transactions/out-trade-no/${id}?mchid=${this.config.merchantId}`,
        undefined,
        { allowMissingOrder: true },
      );
    } catch (error) {
      if (
        !(error instanceof WechatResponseError) ||
        error.upstreamStatus !== 404 ||
        error.upstreamCode !== "ORDER_NOT_EXIST"
      )
        throw error;
      // A local JSAPI order exists before the phone scans and creates a WeChat prepay order.
      return {
        out_trade_no: id,
        appid: this.config.appId,
        mchid: this.config.merchantId,
        trade_state: "NOTPAY",
        orderExists: false,
      };
    }
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
