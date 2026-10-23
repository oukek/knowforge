<script setup>
import { computed, onMounted, ref } from "vue";
import {
  store,
  refreshProfile,
  updateProfile,
  changePassword,
  toast,
} from "../store.js";
import AppField from "../components/AppField.vue";
import Icon from "../components/Icon.vue";
const name = ref(store.user?.displayName || store.user?.username || "");
const loading = ref(false),
  nameBusy = ref(false),
  passwordBusy = ref(false);
const error = ref(""),
  nameError = ref(""),
  passwordError = ref(""),
  passwordMessage = ref("");
const currentPassword = ref(""),
  newPassword = ref(""),
  confirmation = ref("");
const showPassword = ref(false),
  copyBusy = ref(false);
const joined = computed(() =>
  store.user?.createdAt
    ? new Date(store.user.createdAt).toLocaleDateString("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—",
);
const initial = computed(() =>
  Array.from(
    store.user?.displayName || store.user?.username || "K",
  )[0].toUpperCase(),
);
async function load() {
  loading.value = true;
  error.value = "";
  try {
    const data = await refreshProfile();
    if (data) name.value = data.user.displayName;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
async function saveName() {
  if (nameBusy.value) return;
  nameError.value = "";
  if (!name.value.trim() || name.value.trim().length > 40) {
    nameError.value = "名称需为 1–40 个字符";
    return;
  }
  nameBusy.value = true;
  try {
    const data = await updateProfile(name.value.trim());
    if (data) {
      name.value = data.user.displayName;
      toast("显示名称已更新");
    }
  } catch (e) {
    nameError.value = e.message;
  } finally {
    nameBusy.value = false;
  }
}
async function savePassword() {
  if (passwordBusy.value) return;
  passwordError.value = "";
  passwordMessage.value = "";
  if (!currentPassword.value) {
    passwordError.value = "请填写当前密码";
    return;
  }
  if (newPassword.value.length < 8 || newPassword.value.length > 128) {
    passwordError.value = "新密码需为 8–128 位";
    return;
  }
  if (newPassword.value !== confirmation.value) {
    passwordError.value = "两次新密码输入不一致";
    return;
  }
  if (newPassword.value === currentPassword.value) {
    passwordError.value = "新密码不能与当前密码相同";
    return;
  }
  passwordBusy.value = true;
  try {
    const data = await changePassword(currentPassword.value, newPassword.value);
    if (data) {
      currentPassword.value = "";
      newPassword.value = "";
      confirmation.value = "";
      showPassword.value = false;
      passwordMessage.value =
        "密码已修改，当前设备保持登录，其他设备需要重新登录。";
      toast("密码已修改");
    }
  } catch (e) {
    passwordError.value = e.message;
  } finally {
    passwordBusy.value = false;
  }
}
async function copyId() {
  if (!store.user?.publicId || copyBusy.value) return;
  copyBusy.value = true;
  try {
    await navigator.clipboard.writeText(store.user.publicId);
    toast("用户 ID 已复制");
  } catch {
    toast("复制失败，请选中用户 ID 手动复制");
  } finally {
    copyBusy.value = false;
  }
}
onMounted(load);
</script>
<template>
  <div class="page-enter profile-page">
    <div class="page-heading">
      <div>
        <div class="eyebrow">YOUR KNOWFORGE</div>
        <h1>个人中心</h1>
        <p>查看账号身份，管理显示名称与登录密码。</p>
      </div>
    </div>
    <p v-if="error" class="profile-error" role="alert">
      {{ error }} <button class="text-btn" @click="load">重新加载</button>
    </p>
    <div class="profile-layout" :aria-busy="loading">
      <section
        class="profile-identity"
        aria-labelledby="profile-identity-title"
      >
        <div class="profile-avatar" aria-hidden="true">{{ initial }}</div>
        <span class="profile-role">{{
          store.user?.role === "admin" ? "管理员" : "学习者"
        }}</span>
        <h2 id="profile-identity-title">
          {{ store.user?.displayName || store.user?.username }}
        </h2>
        <p class="profile-account">登录账号 · {{ store.user?.username }}</p>
        <div class="profile-id-card">
          <span>用户 ID</span>
          <div class="profile-id-row">
            <strong data-testid="public-user-id">{{
              store.user?.publicId || "分配中…"
            }}</strong
            ><button
              class="icon-btn"
              type="button"
              :disabled="!store.user?.publicId || copyBusy"
              aria-label="复制用户 ID"
              @click="copyId"
            >
              <Icon name="Copy" :size="18" />
            </button>
          </div>
          <small>由系统随机分配，固定不变。</small>
        </div>
        <dl class="profile-facts">
          <div>
            <dt>注册时间</dt>
            <dd>{{ joined }}</dd>
          </div>
          <div>
            <dt>登录账号</dt>
            <dd>{{ store.user?.username }}</dd>
          </div>
        </dl>
        <p class="profile-identity-note">
          需要管理员协助时，可以提供用户
          ID。修改显示名称不会改变登录账号和学习记录。
        </p>
      </section>
      <div class="profile-forms">
        <section class="profile-panel" aria-labelledby="profile-name-title">
          <div class="profile-panel-heading">
            <Icon name="UserRound" :size="20" />
            <div>
              <h2 id="profile-name-title">显示名称</h2>
              <p>这个名称会显示在页面右上角，可随时修改。</p>
            </div>
          </div>
          <form @submit.prevent="saveName" novalidate>
            <label for="profile-name">显示名称</label
            ><AppField
              id="profile-name"
              v-model="name"
              autocomplete="nickname"
              maxlength="40"
              :disabled="loading || nameBusy"
              :aria-invalid="!!nameError"
              :aria-describedby="
                nameError ? 'profile-name-error' : 'profile-name-help'
              "
            />
            <p id="profile-name-help" class="profile-help">
              支持中文，最多 40 个字符。登录时仍使用原账号。
            </p>
            <p
              v-if="nameError"
              id="profile-name-error"
              class="profile-error"
              role="alert"
            >
              {{ nameError }}
            </p>
            <button class="btn primary" :disabled="loading || nameBusy">
              {{ nameBusy ? "保存中…" : "保存名称" }}
            </button>
          </form>
        </section>
        <section class="profile-panel" aria-labelledby="profile-password-title">
          <div class="profile-panel-heading">
            <Icon name="BadgeCheck" :size="20" />
            <div>
              <h2 id="profile-password-title">修改密码</h2>
              <p>验证当前密码后设置新密码。</p>
            </div>
          </div>
          <form @submit.prevent="savePassword" novalidate>
            <input
              class="profile-username-field"
              type="text"
              name="username"
              :value="store.user?.username"
              autocomplete="username"
              readonly
              tabindex="-1"
              aria-hidden="true"
            />
            <label for="profile-current-password">当前密码</label
            ><AppField
              id="profile-current-password"
              v-model="currentPassword"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              maxlength="128"
              :disabled="passwordBusy"
            />
            <div class="profile-password-grid">
              <div>
                <label for="profile-new-password">新密码</label
                ><AppField
                  id="profile-new-password"
                  v-model="newPassword"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="new-password"
                  minlength="8"
                  maxlength="128"
                  :disabled="passwordBusy"
                  placeholder="8–128 位"
                />
              </div>
              <div>
                <label for="profile-confirm-password">确认新密码</label
                ><AppField
                  id="profile-confirm-password"
                  v-model="confirmation"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="new-password"
                  minlength="8"
                  maxlength="128"
                  :disabled="passwordBusy"
                  placeholder="再次输入新密码"
                />
              </div>
            </div>
            <button
              class="text-btn profile-password-toggle"
              type="button"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              <Icon :name="showPassword ? 'EyeOff' : 'Eye'" :size="17" />{{
                showPassword ? "隐藏密码" : "显示密码"
              }}
            </button>
            <p class="profile-help">
              修改后，当前设备保持登录，其他设备的登录会失效。
            </p>
            <p v-if="passwordError" class="profile-error" role="alert">
              {{ passwordError }}
            </p>
            <p v-if="passwordMessage" class="profile-success" role="status">
              {{ passwordMessage }}
            </p>
            <button class="btn primary" :disabled="passwordBusy">
              {{ passwordBusy ? "正在修改…" : "更新密码" }}
            </button>
          </form>
        </section>
      </div>
    </div>
  </div>
</template>
<style>
.profile-page {
  max-width: 1120px;
  margin-inline: auto;
}
.profile-layout {
  display: grid;
  grid-template-columns: minmax(250px, 0.8fr) minmax(0, 1.4fr);
  gap: 24px;
  align-items: start;
}
.profile-identity,
.profile-panel {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: white;
  min-width: 0;
}
.profile-identity {
  padding: 30px;
  background: #f3f8f5;
}
.profile-avatar {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  border-radius: 16px;
  background: #deece4;
  color: var(--green-dark);
  font-size: 26px;
  font-weight: 600;
  margin-bottom: 20px;
}
.profile-role {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--green);
}
.profile-identity h2 {
  font-size: 23px;
  margin: 10px 0 6px;
  overflow-wrap: anywhere;
  line-height: 1.5;
}
.profile-account {
  font-size: 12px;
  color: var(--muted);
  overflow-wrap: anywhere;
}
.profile-id-card {
  margin-top: 28px;
  padding: 18px 0;
  border-block: 1px solid #d5e3d9;
}
.profile-id-card > span {
  font-size: 12px;
  color: var(--muted);
}
.profile-id-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-block: 8px;
}
.profile-id-row strong {
  font-family: var(--font-mono, "SFMono-Regular", Consolas, monospace);
  font-size: 30px;
  letter-spacing: 0.09em;
  user-select: text;
  font-variant-numeric: tabular-nums;
}
.profile-id-card small {
  font-size: 11px;
  color: var(--muted);
}
.profile-facts {
  margin-top: 24px;
  font-size: 12px;
}
.profile-facts > div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding-block: 8px;
}
.profile-facts dt {
  color: var(--muted);
  flex-shrink: 0;
}
.profile-facts dd {
  margin: 0;
  text-align: right;
  overflow-wrap: anywhere;
}
.profile-identity-note {
  font-size: 12px;
  line-height: 1.9;
  color: var(--muted);
  margin-top: 22px;
}
.profile-forms {
  display: grid;
  gap: 20px;
  min-width: 0;
}
.profile-panel {
  padding: 26px;
}
.profile-panel-heading {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 24px;
}
.profile-panel-heading > svg {
  color: var(--green);
  margin-top: 4px;
  flex-shrink: 0;
}
.profile-panel-heading h2 {
  font-size: 18px;
  margin: 0 0 6px;
}
.profile-panel-heading p {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.8;
  margin: 0;
}
.profile-panel label {
  display: block;
  font-size: 13px;
  margin-bottom: 9px;
}
.profile-panel .app-field {
  width: 100%;
  padding: 12px 13px;
  font-size: 14px;
  min-height: 44px;
}
.profile-help {
  font-size: 12px;
  line-height: 1.8;
  color: var(--muted);
  margin: 10px 0 20px;
}
.profile-error {
  font-size: 13px;
  color: #a64235;
  background: #fff3ef;
  padding: 12px;
  border-radius: 7px;
  line-height: 1.8;
  margin-block: 14px;
}
.profile-success {
  font-size: 13px;
  color: var(--green-dark);
  background: #edf6ef;
  padding: 12px;
  border-radius: 7px;
  line-height: 1.8;
  margin-block: 14px;
}
.profile-password-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 18px;
}
.profile-password-grid > div {
  min-width: 0;
}
.profile-password-toggle {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 13px;
  min-height: 36px;
}
.profile-username-field {
  position: absolute;
  width: 1px;
  height: 1px;
  clip-path: inset(50%);
  overflow: hidden;
}
@media (max-width: 1100px) {
  .profile-layout {
    grid-template-columns: minmax(225px, 0.75fr) minmax(0, 1.25fr);
    gap: 18px;
  }
  .profile-panel,
  .profile-identity {
    padding: 22px;
  }
  .profile-password-grid {
    grid-template-columns: 1fr;
    gap: 18px;
  }
}
@media (max-width: 767px) {
  .profile-layout {
    grid-template-columns: 1fr;
  }
  .profile-identity,
  .profile-panel {
    padding: 22px;
  }
  .profile-id-row strong {
    font-size: 32px;
  }
  .profile-identity h2 {
    font-size: 22px;
  }
  .profile-panel .app-field {
    font-size: 16px;
  }
  .profile-panel .btn {
    width: 100%;
  }
}
</style>
