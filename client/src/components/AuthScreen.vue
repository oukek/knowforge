<script setup>
import AppField from "./AppField.vue";
import AppDialog from "./AppDialog.vue";
import { ref, onMounted, onBeforeUnmount } from "vue";
import { signIn, request, acceptSession } from "../store";
import Icon from "./Icon.vue";
const username = ref(""),
  password = ref(""),
  busy = ref(false),
  error = ref(""),
  legacy = ref(false),
  flow = ref(null),
  enabled = ref(null),
  waiting = ref(false);
const storageKey = "knowforge.wechat.login";
let timer,
  disposed = false;
function clearFlow() {
  clearTimeout(timer);
  flow.value = null;
  waiting.value = false;
  sessionStorage.removeItem(storageKey);
}
async function poll() {
  if (!flow.value || disposed) return;
  if (Date.parse(flow.value.expiresAt) <= Date.now()) {
    clearFlow();
    error.value = "二维码已过期，请重新登录";
    return;
  }
  try {
    const data = await request("/auth/wechat/poll", "POST", {
      id: flow.value.id,
      secret: flow.value.secret,
    });
    if (disposed) return;
    if (data.status === "complete") {
      clearFlow();
      await acceptSession(data);
      return;
    }
  } catch (e) {
    error.value = e.message;
    if (e.status === 400) {
      clearFlow();
      return;
    }
  }
  if (!disposed) timer = setTimeout(poll, 2000);
}
async function startWechat() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  clearFlow();
  try {
    const result = await request("/auth/wechat/start", "POST", {});
    if (disposed) return;
    flow.value = result;
    sessionStorage.setItem(storageKey, JSON.stringify(result));
    waiting.value = true;
    if (/MicroMessenger/i.test(navigator.userAgent))
      location.assign(result.url);
    else poll();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
async function submit() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  clearFlow();
  try {
    await signIn("login", {
      username: username.value,
      password: password.value,
    });
  } catch (e) {
    error.value = e.message;
  } finally {
    password.value = "";
    busy.value = false;
  }
}
onMounted(async () => {
  const url = new URL(location.href);
  if (url.searchParams.has("wechatReturn")) {
    url.searchParams.delete("wechatReturn");
    history.replaceState(null, "", url);
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    if (saved?.id && Date.parse(saved.expiresAt) > Date.now()) {
      flow.value = saved;
      waiting.value = true;
      poll();
    } else clearFlow();
  } catch {
    clearFlow();
  }
  try {
    enabled.value = (await request("/auth/wechat/configuration")).enabled;
  } catch (e) {
    error.value = e.message;
  }
});
onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(timer);
});
</script>

<template>
  <main class="auth-page">
    <section class="auth-intro">
      <a href="/" class="brand"
        ><span class="brand-mark"><span></span><span></span><span></span></span>
        <div>
          <strong>KnowForge<span class="brand-dot">.</span></strong
          ><small>知行实验室</small>
        </div></a
      >
      <div class="auth-copy">
        <span class="auth-eyebrow">LEARN. PRACTICE. BUILD.</span>
        <h1>让每一次练习，<br />都成为自己的积累。</h1>
        <p>读懂知识，动手验证。<br />用一个账号，接续你的学习进度。</p>
        <div class="auth-points">
          <span><Icon name="BookOpen" :size="18" />系统学习资料</span
          ><span><Icon name="SquareTerminal" :size="18" />代码随写随试</span
          ><span><Icon name="Activity" :size="18" />个人进度与复习</span>
        </div>
      </div>
      <small>KnowForge · 知行实验室</small>
    </section>
    <section class="auth-panel" aria-label="微信登录">
      <div class="auth-card">
        <h2>欢迎来到学习空间</h2>
        <p class="muted">微信登录，接续你的学习与练习。</p>
        <p v-if="enabled === false" class="auth-error" role="status">
          微信登录尚未开通，请联系管理员。
        </p>
        <template v-if="flow">
          <div class="wechat-qr">
            <img
              :src="flow.qr"
              alt="请使用微信扫描登录二维码"
              width="240"
              height="240"
            />
          </div>
          <p class="auth-footnote" aria-live="polite">
            请使用微信扫码，并在手机上确认登录。<br />二维码五分钟内有效。
          </p>
        </template>
        <button
          class="btn primary auth-submit"
          :disabled="busy || enabled !== true"
          @click="startWechat"
        >
          {{ busy ? "正在连接微信…" : waiting ? "刷新登录二维码" : "微信登录"
          }}<Icon name="ArrowRight" :size="18" />
        </button>
        <p v-if="error && !legacy" class="auth-error" role="alert">
          {{ error }}
        </p>
        <p class="auth-footnote">
          首次微信登录将自动创建学习账号。<br />每个账号独立保存笔记、作答和学习进度。
        </p>
        <button
          class="text-btn legacy-login"
          @click="
            legacy = true;
            error = '';
          "
        >
          已有账号登录
        </button>
      </div>
      <AppDialog
        :open="legacy"
        title="已有账号登录"
        description="使用原账号继续访问已有的学习记录。"
        :width="420"
        :busy="busy"
        @close="legacy = false"
      >
        <form class="auth-card" @submit.prevent="submit">
          <label for="auth-username">账号</label
          ><AppField
            id="auth-username"
            v-model="username"
            autocomplete="username"
            required
            :disabled="busy"
          />
          <label for="auth-password">密码</label
          ><AppField
            id="auth-password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            :disabled="busy"
          />
          <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
          <button class="btn primary auth-submit" :disabled="busy">
            {{ busy ? "正在登录…" : "登录学习空间" }}
          </button>
        </form>
      </AppDialog>
    </section>
  </main>
</template>

<style scoped>
.wechat-qr {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}
.legacy-login {
  display: block;
  margin: 20px auto 0;
}
.auth-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: #fcfdfc;
}
.auth-intro {
  padding: 52px clamp(28px, 6vw, 100px);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: #eaf1ec;
  min-height: 100vh;
}
.auth-copy {
  padding: 65px 0;
}
.auth-eyebrow {
  color: var(--green);
  font-size: 11px;
  letter-spacing: 2px;
  font-weight: 600;
}
.auth-copy h1 {
  font-size: clamp(29px, 3vw, 44px);
  line-height: 1.55;
  margin: 22px 0;
  color: #204c3e;
}
.auth-copy p {
  color: #658073;
  font-size: 15px;
}
.auth-points {
  display: grid;
  gap: 16px;
  margin-top: 38px;
  color: #416957;
}
.auth-points span {
  display: flex;
  align-items: center;
  gap: 12px;
}
.auth-intro > small {
  color: #718b7e;
}
.auth-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 30px;
}
.auth-card {
  width: 100%;
  max-width: 360px;
}
.auth-tabs {
  display: flex;
  border-bottom: 1px solid var(--line);
  gap: 28px;
  margin-bottom: 32px;
}
.auth-tabs button {
  padding: 12px 0;
  border-bottom: 2px solid transparent;
  color: var(--muted);
}
.auth-tabs .selected {
  color: var(--green);
  border-color: var(--green);
  font-weight: 600;
}
.auth-card h2 {
  font-size: 25px;
  margin-bottom: 8px;
}
.auth-card label {
  display: block;
  margin: 22px 0 7px;
  font-weight: 500;
}
.auth-card input {
  width: 100%;
  min-height: 46px;
}
.auth-card small {
  display: block;
  margin-top: 5px;
}
.auth-submit {
  width: 100%;
  margin-top: 28px;
  justify-content: center;
  min-height: 46px;
  gap: 12px;
}
.auth-error {
  margin-top: 18px;
  color: #b43d3d;
  font-size: 13px;
}
.auth-footnote {
  text-align: center;
  font-size: 12px;
  color: var(--muted);
  margin-top: 22px;
}
.account-name {
  font-size: 13px;
}
@media (max-width: 760px) {
  .auth-page {
    display: block;
  }
  .auth-intro {
    min-height: auto;
    padding: 24px;
  }
  .auth-copy {
    padding: 28px 0 0;
  }
  .auth-copy h1 {
    font-size: 28px;
    margin: 12px 0;
  }
  .auth-copy p,
  .auth-points,
  .auth-intro > small {
    display: none;
  }
  .auth-panel {
    padding: 30px 24px 50px;
    align-items: flex-start;
  }
  .auth-tabs {
    margin-bottom: 24px;
  }
}
</style>
