<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from "vue";
import { request, store } from "../store.js";
import QrCode from "./QrCode.vue";
import { inWechat } from "../wechat-sdk.js";
import AppDialog from "./AppDialog.vue";
const props = defineProps({ product: Object, orderId: String });
const emit = defineEmits(["close", "paid"]);
const wechat = inWechat();
const order = ref(null),
  intent = ref(null),
  error = ref(""),
  busy = ref(false),
  checking = ref(false);
const title = computed(() =>
  order.value?.status === "paid"
    ? "支付成功"
    : order.value?.status === "closed"
      ? "订单已关闭"
      : "微信支付",
);
let timer,
  disposed = false,
  notified = false;
const userId = store.user.id;
const key = `knowforge.checkout.${userId}.${props.product?.published?.versionId || props.orderId}`;
function notifyPaid() {
  if (["paid", "closed"].includes(order.value?.status))
    sessionStorage.removeItem(
      `knowforge.checkout.${userId}.${order.value.versionId}`,
    );
  if (order.value?.status === "closed") sessionStorage.removeItem(key);
  if (order.value?.status === "paid" && !notified) {
    notified = true;
    sessionStorage.removeItem(key);
    emit("paid");
  }
}
function invoke() {
  if (intent.value?.type === "handoff") location.assign(intent.value.url);
}
async function sync(manual = false) {
  if (!order.value || checking.value || disposed) return;
  clearTimeout(timer);
  checking.value = true;
  if (manual) error.value = "";
  try {
    const result = await request(
      `/payments/orders/${order.value.id}/sync`,
      "POST",
      {},
    );
    if (disposed) return;
    order.value = result.order;
    error.value = "";
    notifyPaid();
  } catch (e) {
    if (!disposed) error.value = e.message;
  } finally {
    checking.value = false;
    if (!disposed && order.value?.status === "pending")
      timer = setTimeout(() => sync(), 5000);
  }
}
async function start() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    let result;
    if (props.orderId)
      result = await request(
        `/payments/orders/${props.orderId}/checkout`,
        "POST",
        {
          mode: "jsapi",
        },
      );
    else {
      let requestId = sessionStorage.getItem(key);
      if (!requestId) {
        requestId = crypto.randomUUID();
        sessionStorage.setItem(key, requestId);
      }
      result = await request("/payments/orders", "POST", {
        productVersionId: props.product.published.versionId,
        requestId,
        mode: "jsapi",
      });
    }
    if (disposed) return;
    order.value = result.order;
    intent.value = result.intent;
    notifyPaid();
    if (order.value.status === "pending") {
      if (intent.value?.type === "handoff" && wechat) invoke();
      sync();
    }
  } catch (e) {
    if (!disposed) error.value = e.message;
  } finally {
    busy.value = false;
  }
}
onMounted(start);
onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(timer);
});
</script>
<template>
  <AppDialog open :title="title" :width="430" @close="emit('close')">
    <div class="checkout">
      <p v-if="busy" role="status">正在准备订单…</p>
      <template v-if="order">
        <h3>{{ order.product }}</h3>
        <strong class="checkout-amount">¥{{ order.amount }}</strong>
        <p v-if="order.status === 'paid'" role="status">
          付款已确认，资源包额度已入账。
        </p>
        <p v-else-if="order.status === 'closed'">
          此订单已关闭，可以重新选择资源包购买。
        </p>
        <template v-else>
          <QrCode
            v-if="
              (!wechat || intent?.type === 'qr') &&
              ['qr', 'handoff'].includes(intent?.type) &&
              (intent.codeUrl || intent.url) &&
              Date.parse(order.expiresAt) > Date.now()
            "
            :value="intent.url || intent.codeUrl"
            alt="微信支付二维码，请使用微信扫一扫"
          />
          <p
            v-if="Date.parse(order.expiresAt) <= Date.now()"
            class="ai-error"
            role="alert"
          >
            此支付链接已过期，请关闭弹窗后重新购买。
          </p>
          <p v-else-if="!intent" class="ai-error" role="alert">
            尚未取得支付链接，请重新获取支付二维码。
          </p>
          <p v-else class="tiny muted">
            {{
              intent?.type === "handoff" && wechat
                ? "请在微信内完成支付，额度到账后将自动更新。"
                : "请用手机微信扫一扫，进入支付页后会自动调起微信支付。"
            }}
          </p>
          <p class="tiny muted">
            支付有效期至
            {{
              new Date(order.expiresAt).toLocaleTimeString()
            }}，关掉弹窗后仍可从订单列表核对。
          </p>
          <button
            v-if="intent?.type === 'handoff' && wechat"
            class="btn primary"
            @click="invoke"
          >
            继续微信支付
          </button>
        </template>
        <p class="tiny muted">订单号 {{ order.id }}</p>
      </template>
      <p v-if="error" class="ai-error" role="alert">{{ error }}</p>
    </div>
    <template #footer>
      <button class="btn" @click="emit('close')">关闭</button>
      <button v-if="!order" class="btn primary" :disabled="busy" @click="start">
        重试原订单
      </button>
      <button
        v-if="order?.status === 'pending' && !intent"
        class="btn"
        :disabled="busy"
        @click="start"
      >
        重新获取支付二维码
      </button>
      <button
        v-if="order?.status === 'pending'"
        class="btn primary"
        :disabled="checking"
        @click="sync(true)"
      >
        {{ checking ? "正在核对…" : "我已支付，核对结果" }}
      </button>
    </template>
  </AppDialog>
</template>
<style scoped>
.checkout {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
}
.checkout p {
  margin: 0;
  overflow-wrap: anywhere;
}
.checkout-amount {
  font-size: 32px;
}
</style>
