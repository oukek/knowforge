<script setup>
import { ref, watch } from "vue";
import QRCode from "qrcode";
const props = defineProps({
  value: { type: String, required: true },
  alt: { type: String, required: true },
  size: { type: Number, default: 240 },
});
const src = ref(""),
  error = ref(""),
  retry = ref(0);
watch(
  () => [props.value, props.size, retry.value],
  async (_, __, onCleanup) => {
    let current = true;
    onCleanup(() => {
      current = false;
    });
    src.value = "";
    error.value = "";
    if (!props.value) return;
    try {
      const result = await QRCode.toDataURL(props.value, {
        width: Math.max(280, props.size * 2),
        margin: 2,
      });
      if (current) src.value = result;
    } catch {
      if (current) error.value = "二维码绘制失败，请重试。";
    }
  },
  { immediate: true },
);
</script>
<template>
  <div class="qr-code" :style="{ width: size + 'px', minHeight: size + 'px' }">
    <img v-if="src" :src="src" :alt="alt" :width="size" :height="size" />
    <div v-else-if="error" class="qr-code-message">
      <p role="alert">{{ error }}</p>
      <button class="text-btn" type="button" @click="retry++">重新绘制</button>
    </div>
    <span v-else role="status">正在绘制二维码…</span>
  </div>
</template>
<style scoped>
.qr-code {
  display: grid;
  place-items: center;
  max-width: 100%;
  flex-shrink: 0;
}
.qr-code img {
  display: block;
  max-width: 100%;
  height: auto;
}
.qr-code-message {
  text-align: center;
  font-size: 13px;
  color: var(--muted);
}
</style>
