<script setup>
import { ref } from "vue";
import { signIn } from "../store";
import Icon from "./Icon.vue";
const mode = ref("login"),
  username = ref(""),
  password = ref(""),
  confirmation = ref(""),
  busy = ref(false),
  error = ref("");
function switchMode(value) {
  mode.value = value;
  password.value = "";
  confirmation.value = "";
  error.value = "";
}
async function submit() {
  if (busy.value) return;
  error.value = "";
  if (mode.value === "register" && password.value !== confirmation.value) {
    error.value = "两次输入的密码不一致";
    return;
  }
  busy.value = true;
  try {
    await signIn(mode.value, {
      username: username.value,
      password: password.value,
    });
  } catch (e) {
    error.value = e.message;
  } finally {
    password.value = "";
    confirmation.value = "";
    busy.value = false;
  }
}
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
    <section class="auth-panel" aria-label="账号登录与注册">
      <form class="auth-card" @submit.prevent="submit">
        <div class="auth-tabs" role="group" aria-label="选择登录或注册">
          <button
            type="button"
            :class="{ selected: mode === 'login' }"
            :aria-pressed="mode === 'login'"
            :disabled="busy"
            @click="switchMode('login')"
          >
            登录</button
          ><button
            type="button"
            :class="{ selected: mode === 'register' }"
            :aria-pressed="mode === 'register'"
            :disabled="busy"
            @click="switchMode('register')"
          >
            注册账号
          </button>
        </div>
        <h2>{{ mode === "login" ? "欢迎回来" : "开启你的学习空间" }}</h2>
        <p class="muted">
          {{
            mode === "login"
              ? "登录后继续上次的学习与练习。"
              : "只需要账号和密码，无需验证码。"
          }}
        </p>
        <label for="auth-username">账号</label
        ><input
          id="auth-username"
          v-model="username"
          name="username"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          minlength="3"
          maxlength="32"
          pattern="[A-Za-z0-9_\-]+"
          placeholder="3–32 位字母、数字、_ 或 -"
          required
          :disabled="busy"
          aria-describedby="username-help"
        /><small id="username-help" class="muted">账号不区分大小写。</small>
        <label for="auth-password">密码</label
        ><input
          id="auth-password"
          v-model="password"
          name="password"
          type="password"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          minlength="8"
          maxlength="128"
          placeholder="至少 8 位，支持长密码"
          required
          :disabled="busy"
        />
        <template v-if="mode === 'register'"
          ><label for="auth-confirmation">确认密码</label
          ><input
            id="auth-confirmation"
            v-model="confirmation"
            name="confirmation"
            type="password"
            autocomplete="new-password"
            minlength="8"
            maxlength="128"
            placeholder="再次输入密码"
            required
            :disabled="busy"
        /></template>
        <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
        <button type="submit" class="btn primary auth-submit" :disabled="busy">
          {{
            busy
              ? "正在处理…"
              : mode === "login"
                ? "登录学习空间"
                : "注册并开始学习"
          }}<Icon v-if="!busy" name="ArrowRight" :size="18" />
        </button>
        <p class="auth-footnote">
          每个账号独立保存笔记、作答和学习进度。<br />请妥善保管密码，目前不提供自助找回。
        </p>
      </form>
    </section>
  </main>
</template>

<style scoped>
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
    grid-template-columns: 1fr;
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
