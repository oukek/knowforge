<script setup>
import { ref, watch, shallowRef, nextTick } from "vue";
import { store, toast } from "../store.js";
import { ai, refreshAi } from "../ai.js";
import AppDialog from "./AppDialog.vue";
import CreditProducts from "./CreditProducts.vue";
import WechatCheckout from "./WechatCheckout.vue";
const selected = ref(null),
  opener = shallowRef(null);
watch(
  () => store.creditShopOpen,
  (open) => {
    if (open) opener.value = document.activeElement;
    else selected.value = null;
  },
);
async function paid() {
  store.creditShopOpen = false;
  await nextTick();
  if (opener.value?.isConnected) opener.value.focus();
  await refreshAi().catch(() => {});
  toast("资源包已到账");
}
</script>
<template>
  <AppDialog
    :open="store.creditShopOpen && !selected"
    title="购买资源包"
    description="付款确认后自动到账，不影响当前学习进度。"
    :width="1040"
    mobile-fullscreen
    :return-focus="opener"
    @close="store.creditShopOpen = false"
  >
    <div class="credit-shop-balance">
      <span
        >当前可用
        <strong>{{ ai.loaded ? ai.account.available : "—" }}</strong> 额度</span
      ><span v-if="ai.account.exempt">免费资格生效中</span>
    </div>
    <CreditProducts
      v-if="store.creditShopOpen && !selected"
      @select="selected = $event"
    />
    <template #footer
      ><RouterLink
        class="text-link"
        to="/credits?tab=ledger"
        @click="store.creditShopOpen = false"
        >查看额度与订单</RouterLink
      ><button class="btn" @click="store.creditShopOpen = false">
        关闭
      </button></template
    >
  </AppDialog>
  <WechatCheckout
    v-if="store.creditShopOpen && selected"
    :product="selected"
    @close="selected = null"
    @paid="paid"
  />
</template>
<style scoped>
.credit-shop-balance {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  margin-bottom: 20px;
  background: var(--theme-soft);
  border-radius: 8px;
  font-size: 12px;
  color: var(--green);
}
.credit-shop-balance strong {
  font-size: 19px;
  margin: 0 5px;
  font-variant-numeric: tabular-nums;
}
</style>
