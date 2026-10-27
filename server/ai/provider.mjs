import https from "node:https";
import http from "node:http";
import { lookup } from "node:dns/promises";
import { isIP, BlockList } from "node:net";
import { z } from "zod";
import { AiError, normalizeUsage } from "./policy.mjs";
import { setLongTimeout } from "./long-timeout.mjs";

const redact = (value, key, max = 1500) =>
  String(value ?? "")
    .split(key)
    .join("[REDACTED]")
    .replace(/Bearer\s+[\w.+\/-]+/gi, "Bearer [REDACTED]")
    .slice(0, max);

const blocked = new BlockList();
for (const [ip, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
])
  blocked.addSubnet(ip, bits, "ipv4");
export function publicAddress(address) {
  if (isIP(address) === 4) return !blocked.check(address, "ipv4");
  if (isIP(address) === 6)
    return /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:db8:/i.test(address);
  return false;
}
export async function checkedUrl(base, { allowLocalTest = false } = {}) {
  const url = new URL(base);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" && !(allowLocalTest && url.protocol === "http:"))
  )
    throw new AiError(
      400,
      "服务地址需要 HTTPS，且不能包含凭据、查询参数或片段",
    );
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true }).catch(() => {
        throw new AiError(400, "无法解析服务商域名");
      });
  const testOnly =
    allowLocalTest &&
    addresses.every((x) => ["127.0.0.1", "::1"].includes(x.address));
  if (
    !addresses.length ||
    (!testOnly && addresses.some((x) => !publicAddress(x.address)))
  )
    throw new AiError(400, "服务地址不能指向本机、内网或保留网络");
  return { url, address: addresses[0] };
}
export function createProvider(options = {}) {
  async function request(config, key, path, body, signal, onSend = () => {}) {
    const started = Date.now();
    const timeoutMs = config.timeoutMs || options.timeoutMs || 75000;
    const target = await new Promise((resolve, reject) => {
      const cleanup = () => {
        cancelTimer();
        signal?.removeEventListener("abort", abort);
      };
      const abort = () => {
        cleanup();
        reject(new AiError(499, "任务已取消", "AI_CANCELLED"));
      };
      const cancelTimer = setLongTimeout(() => {
        cleanup();
        reject(new AiError(504, "服务商域名解析超时", "AI_TIMEOUT"));
      }, timeoutMs);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) {
        abort();
        return;
      }
      checkedUrl(config.baseUrl, options)
        .then(resolve, reject)
        .finally(cleanup);
    });
    target.url.pathname = target.url.pathname.replace(/\/$/, "") + path;
    return await new Promise((resolve, reject) => {
      let sent = false,
        finished = false;
      const finish = (error, data) => {
        if (finished) return;
        finished = true;
        cancelDeadline();
        signal?.removeEventListener("abort", abort);
        if (error) {
          error.sent = sent;
          reject(error);
        } else resolve(data);
      };
      const client = target.url.protocol === "https:" ? https : http;
      const req = client.request(
        target.url,
        {
          method: body ? "POST" : "GET",
          headers: {
            Authorization: "Bearer " + key,
            Accept: "application/json",
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          // Validate all DNS answers and pin this connection to one validated IP.
          lookup: (_, opts, cb) =>
            opts.all
              ? cb(null, [target.address])
              : cb(null, target.address.address, target.address.family),
        },
        (res) => {
          const chunks = [];
          let bytes = 0;
          res.on("data", (part) => {
            bytes += part.length;
            if (bytes > 1024 * 1024) {
              req.destroy();
              finish(
                new AiError(502, "服务商响应超过限制", "AI_RESPONSE_LIMIT"),
              );
            } else chunks.push(part);
          });
          res.on("end", () => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              const error = new AiError(
                502,
                "服务商返回 HTTP " + res.statusCode,
                "AI_PROVIDER_HTTP",
              );
              error.noCharge = [400, 401, 403, 404, 405, 422, 429].includes(
                res.statusCode,
              );
              error.upstreamStatus = res.statusCode;
              error.requestId = String(
                res.headers["x-request-id"] || res.headers["request-id"] || "",
              ).slice(0, 191);
              error.requestId = redact(error.requestId, key, 191);
              const retryAfter = String(res.headers["retry-after"] || "");
              const seconds = /^\d+(?:\.\d+)?$/.test(retryAfter)
                ? Number(retryAfter)
                : (Date.parse(retryAfter) - Date.now()) / 1000;
              error.retryAfterMs = Number.isFinite(seconds)
                ? Math.min(86400000, Math.max(1000, seconds * 1000))
                : 0;
              try {
                const detail = JSON.parse(
                  Buffer.concat(chunks).toString("utf8"),
                );
                const message = detail.error?.message || detail.message;
                error.upstreamCode = String(
                  detail.error?.code || detail.error?.type || "",
                )
                  .split(key)
                  .join("[REDACTED]")
                  .slice(0, 191);
                if (typeof message === "string")
                  error.providerDetail = message
                    .split(key)
                    .join("[REDACTED]")
                    .slice(0, 1500);
              } catch {
                error.providerDetail = redact(
                  Buffer.concat(chunks).toString("utf8"),
                  key,
                );
              }
              return finish(error);
            }
            try {
              finish(null, {
                body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
                requestId: redact(
                  res.headers["x-request-id"] ||
                    res.headers["request-id"] ||
                    "",
                  key,
                  191,
                ),
              });
            } catch {
              const error = new AiError(
                502,
                "服务商返回了无效 JSON",
                "AI_PROVIDER_JSON",
              );
              error.upstreamStatus = res.statusCode;
              error.providerDetail = redact(
                Buffer.concat(chunks).toString("utf8"),
                key,
              );
              finish(error);
            }
          });
          res.on("error", () =>
            finish(
              new AiError(502, "服务商响应中断", "AI_PROVIDER_INTERRUPTED"),
            ),
          );
        },
      );
      const abort = () => {
        req.destroy();
        finish(
          new AiError(409, "调用已取消，用量可能需要核对", "AI_CANCELLED"),
        );
      };
      const cancelDeadline = setLongTimeout(
        () => {
          req.destroy();
          finish(
            new AiError(504, "服务商响应超时，用量可能需要核对", "AI_TIMEOUT"),
          );
        },
        Math.max(1, timeoutMs - (Date.now() - started)),
      );
      req.on("error", (cause) => {
        const error = new AiError(
          502,
          "无法连接服务商，请检查服务地址和网络",
          "AI_PROVIDER_NETWORK",
        );
        error.networkCode = /^[A-Z_]{2,60}$/.test(cause.code || "")
          ? cause.code
          : "";
        finish(error);
      });
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) return abort();
      try {
        onSend();
        sent = true;
        req.end(body ? JSON.stringify(body) : undefined);
      } catch (error) {
        req.destroy();
        finish(error);
      }
    });
  }
  return {
    validate: (url) => checkedUrl(url, options),
    async models(config, key) {
      const { body } = await request(config, key, "/models");
      if (!Array.isArray(body.data))
        throw new AiError(502, "服务商未返回标准模型列表，可手动填写模型 ID");
      return [
        ...new Set(
          body.data
            .map((x) => x.id)
            .filter((x) => typeof x === "string" && x.length <= 160),
        ),
      ].slice(0, 1000);
    },
    async generate(config, key, messages, schema, signal, onSend) {
      const json = z.toJSONSchema(schema);
      delete json.$schema;
      const format =
        config.format === "schema"
          ? {
              type: "json_schema",
              json_schema: {
                name: "knowforge_result",
                strict: true,
                schema: json,
              },
            }
          : config.format === "json"
            ? { type: "json_object" }
            : undefined;
      const body =
        config.protocol === "responses"
          ? {
              model: config.model,
              input: messages,
              max_output_tokens: config.outputLimit,
              store: false,
              ...(format
                ? {
                    text: {
                      format:
                        format.type === "json_schema"
                          ? {
                              type: "json_schema",
                              name: "knowforge_result",
                              strict: true,
                              schema: json,
                            }
                          : format,
                    },
                  }
                : {}),
            }
          : {
              model: config.model,
              messages,
              [config.tokenParameter || "max_completion_tokens"]:
                config.outputLimit,
              stream: false,
              ...(format ? { response_format: format } : {}),
            };
      const response = await request(
        config,
        key,
        config.protocol === "responses" ? "/responses" : "/chat/completions",
        body,
        signal,
        onSend,
      );
      const raw = response.body;
      const usage = normalizeUsage(raw.usage, config.protocol);
      const text =
        config.protocol === "responses"
          ? (raw.output || [])
              .filter((x) => x.type === "message")
              .flatMap((x) => x.content || [])
              .filter((x) => x.type === "output_text")
              .map((x) => x.text)
              .join("")
          : raw.choices?.[0]?.message?.content;
      const complete =
        config.protocol === "responses"
          ? raw.status === "completed"
          : raw.choices?.[0]?.finish_reason === "stop";
      const refusal =
        config.protocol === "responses"
          ? (raw.output || [])
              .flatMap((x) => x.content || [])
              .filter((x) => x.type === "refusal")
              .map((x) => x.refusal || "")
              .join("")
          : raw.choices?.[0]?.message?.refusal || "";
      return {
        finishReason: redact(
          config.protocol === "responses"
            ? raw.incomplete_details?.reason || raw.status || ""
            : raw.choices?.[0]?.finish_reason || "",
          key,
          100,
        ),
        refusal:
          typeof refusal === "string"
            ? refusal.slice(0, 2000).split(key).join("[REDACTED]")
            : "",
        text:
          typeof text === "string" ? text.split(key).join("[REDACTED]") : "",
        complete,
        usage,
        requestId: redact(response.requestId || raw.id || "", key, 191),
        actualModel:
          typeof raw.model === "string"
            ? redact(raw.model, key, 160)
            : config.model,
      };
    },
  };
}
