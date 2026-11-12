<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";
import { request } from "../store.js";
import QrCode from "../components/QrCode.vue";
import { inWechat, chooseWechatPay, wechatSigningUrl } from "../wechat-sdk.js";
const paymentUrl = ref("");
const phase = ref("loading"),
  preview = ref(null),
  error = ref(""),
  busy = ref(false);
const key = "knowforge.wechat.checkout",
  credentials = { ticket: "", secret: "" };
let disposed = false,
  timer;
function capture() {
  const entries = new URLSearchParams(location.hash.slice(1)).getAll("ticket");
  let saved;
  try {
    saved = JSON.parse(sessionStorage.getItem(key) || "null");
  } catch {}
  if (entries.length === 1 && /^[a-f0-9]{64}$/.test(entries[0])) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    Object.assign(credentials, {
      ticket: entries[0],
      secret:
        saved?.ticket === entries[0]
          ? saved.secret
          : Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join(""),
    });
    sessionStorage.setItem(key, JSON.stringify(credentials));
  } else if ((location.hash === "#resume" || !location.hash) && saved)
    Object.assign(credentials, saved);
  else throw new Error("支付链接无效，请返回原设备重新打开订单");
  history.replaceState(null, "", location.pathname);
  if (
    !/^[a-f0-9]{64}$/.test(credentials.ticket) ||
    !/^[a-f0-9]{64}$/.test(credentials.secret)
  )
    throw new Error("支付授权已失效，请返回原设备重新扫码");
  paymentUrl.value =
    location.origin + location.pathname + "#ticket=" + credentials.ticket;
}
const call = (path, body = {}) =>
  request("/payments/handoff/" + path, "POST", { ...credentials, ...body });
async function authorize() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const result = await call("start");
    if (!disposed) location.assign(result.url);
  } catch (e) {
    if (!disposed) {
      error.value = e.message;
      phase.value = "error";
    }
  } finally {
    busy.value = false;
  }
}
async function sync() {
  if (disposed) return;
  clearTimeout(timer);
  try {
    const result = await call("sync");
    if (disposed) return;
    if (preview.value) preview.value.order = result.order;
    if (result.order.status === "paid") {
      phase.value = "paid";
      error.value = "";
      sessionStorage.removeItem(key);
      return;
    }
    if (
      result.order.status === "closed" ||
      Date.parse(result.order.expiresAt) <= Date.now()
    ) {
      phase.value = "closed";
      return;
    }
    timer = setTimeout(sync, 5000);
  } catch (e) {
    if (!disposed) error.value = e.message;
  }
}
async function pay(confirmed = false) {
  if (busy.value || disposed) return;
  busy.value = true;
  error.value = "";
  phase.value = "paying";
  try {
    const result = await call(
      "intent",
      confirmed
        ? { confirmedRecipientId: preview.value.recipient.publicId }
        : {},
    );
    if (disposed) return;
    const config = await call("js-sdk", { url: wechatSigningUrl() });
    if (disposed) return;
    timer = setTimeout(sync, 5000);
    const outcome = await chooseWechatPay(
      result.intent.parameters,
      config,
      () => !disposed && phase.value !== "paid",
    );
    if (disposed || phase.value === "paid") return;
    phase.value = "pending";
    if (outcome === "cancel") error.value = "已取消支付，可继续支付原订单。";
    if (outcome === "fail") error.value = "支付未完成，请核对订单后重试。";
    await sync();
  } catch (e) {
    if (!disposed && phase.value !== "paid") {
      phase.value = "error";
      error.value = e.message;
    }
  } finally {
    busy.value = false;
  }
}
onMounted(async () => {
  try {
    capture();
    if (!inWechat()) {
      phase.value = "outside";
      return;
    }
    try {
      preview.value = await call("preview");
    } catch (e) {
      if (e.status === 401) {
        await authorize();
        return;
      }
      throw e;
    }
    if (disposed) return;
    if (preview.value.order.status === "paid") {
      phase.value = "paid";
      return;
    }
    if (
      preview.value.order.status === "closed" ||
      Date.parse(preview.value.order.expiresAt) <= Date.now()
    ) {
      phase.value = "closed";
      return;
    }
    if (preview.value.payerUnavailable)
      throw new Error("此订单已由另一个微信发起支付，请返回原设备核对");
    if (!preview.value.sameAccount) {
      phase.value = "confirm";
      return;
    }
    await pay();
  } catch (e) {
    if (!disposed) {
      phase.value = "error";
      error.value = e.message;
    }
  }
});
onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(timer);
});
</script>
<template>
  <main class="wechat-payment-page">
    <section class="wechat-payment-card">
      <h1>
        {{
          phase === "paid"
            ? "支付成功"
            : phase === "confirm"
              ? "确认接收账号"
              : "微信支付"
        }}
      </h1>
      <template v-if="preview"
        ><h2>{{ preview.order.product }}</h2>
        <strong class="payment-amount">¥{{ preview.order.amount }}</strong>
        <p>
          资源包接收账号：{{ preview.recipient.displayName }} ·
          {{ preview.recipient.publicId }}
        </p></template
      >
      <p v-if="phase === 'loading' || phase === 'paying'" role="status">
        {{
          phase === "loading" ? "正在确认微信支付身份…" : "正在调起微信支付…"
        }}
      </p>
      <template v-if="phase === 'outside'">
        <div class="payment-qr">
          <QrCode
            :value="paymentUrl"
            alt="网页支付二维码，请使用手机微信扫一扫"
          />
        </div>
        <p>请用手机微信扫一扫，进入页面后将自动调起微信支付确认。</p>
        <p class="tiny muted">
          请在微信支付确认页核对商户和金额，完成支付后原订单会自动更新。
        </p>
      </template>
      <p v-if="phase === 'confirm'" class="payment-warning">
        当前微信与下单账号不一致。确认后将为上方账号付款，额度会发放给该账号。
      </p>
      <button
        v-if="phase === 'confirm'"
        class="btn primary"
        :disabled="busy"
        @click="pay(true)"
      >
        确认给 {{ preview.recipient.displayName }} 付款
      </button>
      <p v-if="phase === 'paid'" role="status">
        付款已确认，额度已发放到下单账号。可以返回原设备继续学习。
      </p>
      <p v-if="phase === 'closed'">订单已关闭或过期，请返回原设备核对。</p>
      <p v-if="error" class="ai-error" role="alert">{{ error }}</p>
      <template v-if="['pending', 'error'].includes(phase)"
        ><button
          v-if="preview"
          class="btn primary"
          :disabled="busy"
          @click="pay(!preview.sameAccount)"
        >
          继续微信支付</button
        ><button v-if="preview" class="btn" :disabled="busy" @click="sync">
          核对支付结果</button
        ><button
          v-if="!preview"
          class="btn primary"
          :disabled="busy"
          @click="authorize"
        >
          重新授权
        </button></template
      >
      <a href="/" class="text-btn">返回学习空间</a>
    </section>
  </main>
</template>
<style scoped>
.payment-qr {
  display: flex;
  justify-content: center;
  margin: 24px 0;
}
.wechat-payment-page {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--theme-soft);
}
.wechat-payment-card {
  width: 100%;
  max-width: 460px;
  display: grid;
  gap: 20px;
  padding: 32px 24px;
  background: white;
  border: 1px solid var(--line);
  border-radius: 18px;
  text-align: center;
}
.wechat-payment-card h1 {
  font-size: 23px;
}
.wechat-payment-card h2 {
  font-size: 17px;
}
.payment-amount {
  font-size: 36px;
}
.payment-warning {
  color: #8a6841;
}
.wechat-payment-card p {
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 1.8;
}
</style>
