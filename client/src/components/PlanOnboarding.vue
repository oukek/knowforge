<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { store, mutate } from "../store";
import Icon from "./Icon.vue";
const router = useRouter(),
  panel = ref(null),
  busy = ref(false);
const visible = computed(
  () =>
    !store.loading &&
    !store.error &&
    store.user &&
    store.state?.settings.planOnboarding === "pending",
);
let previous,
  overflow,
  inert,
  locked = false;
function unlock() {
  if (!locked) return;
  document.body.style.overflow = overflow;
  document.getElementById("app").inert = inert;
  previous?.isConnected && previous.focus({ preventScroll: true });
  locked = false;
}
watch(
  visible,
  async (value) => {
    if (!value) return unlock();
    previous = document.activeElement;
    overflow = document.body.style.overflow;
    inert = document.getElementById("app").inert;
    document.body.style.overflow = "hidden";
    document.getElementById("app").inert = true;
    locked = true;
    await nextTick();
    panel.value?.querySelector(".primary")?.focus();
  },
  { immediate: true },
);
async function dismiss(configure = false) {
  if (busy.value) return;
  busy.value = true;
  try {
    const result = await mutate("/settings/onboarding", "PUT", {
      status: "dismissed",
    });
    if (result && configure) await router.push("/plan");
  } finally {
    busy.value = false;
  }
}
function keydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    dismiss();
  }
  if (event.key !== "Tab") return;
  const buttons = [...panel.value.querySelectorAll("button:not(:disabled)")];
  if (!buttons.length) return event.preventDefault();
  if (event.shiftKey && document.activeElement === buttons[0]) {
    event.preventDefault();
    buttons.at(-1).focus();
  } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
    event.preventDefault();
    buttons[0].focus();
  }
}
onBeforeUnmount(unlock);
</script>
<template>
  <Teleport to="body">
    <div v-if="visible" class="plan-onboarding-layer" @keydown="keydown">
      <div
        class="plan-onboarding-backdrop"
        @pointerdown.stop
        @pointerup.stop
        @click.stop.prevent="dismiss()"
      ></div>
      <section
        ref="panel"
        class="plan-onboarding-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-welcome-title"
        aria-describedby="plan-welcome-description"
      >
        <Icon name="Sprout" :size="32" />
        <div class="eyebrow">YOUR OWN LEARNING PATH</div>
        <h2 id="plan-welcome-title">先学什么，由你决定。</h2>
        <p id="plan-welcome-description">
          欢迎来到
          KnowForge。你可以选择一条或多条学习主线，再设置每天可用时间。前端、Python、AI
          不必全部学习，重合的知识点也只会安排一次。
        </p>
        <p class="muted tiny">
          现在跳过也可以，随时在“学习计划”中调整；计划与进度会保存到当前账号。
        </p>
        <div class="row wrap">
          <button class="btn primary" :disabled="busy" @click="dismiss(true)">
            配置我的学习计划 <Icon name="ArrowRight" :size="16" />
          </button>
          <button class="btn" :disabled="busy" @click="dismiss()">
            稍后再说
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
<style>
.plan-onboarding-layer {
  position: fixed;
  inset: 0;
  z-index: 180;
  display: grid;
  place-items: center;
  padding: 24px;
}
.plan-onboarding-backdrop {
  position: absolute;
  inset: 0;
  background: #162b2466;
  backdrop-filter: blur(3px);
}
.plan-onboarding-panel {
  position: relative;
  max-width: 530px;
  max-height: 85dvh;
  overflow: auto;
  background: var(--surface, #fff);
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 20px 80px #162b2433;
}
.plan-onboarding-panel > svg {
  color: var(--green);
  margin-bottom: 20px;
}
.plan-onboarding-panel h2 {
  font-size: 26px;
  margin: 10px 0 18px;
}
.plan-onboarding-panel p {
  line-height: 1.9;
}
.plan-onboarding-panel .row {
  margin-top: 26px;
  gap: 10px;
}
@media (max-width: 767px) {
  .plan-onboarding-layer {
    align-items: end;
    padding: 0;
  }
  .plan-onboarding-panel {
    border-radius: 20px 20px 0 0;
    padding: 28px 22px max(24px, env(safe-area-inset-bottom));
    width: 100%;
    max-width: 600px;
  }
  .plan-onboarding-panel .row {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
