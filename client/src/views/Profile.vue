<script setup>
import { computed, onMounted, ref } from "vue";
import {
  store,
  refreshProfile,
  updateProfile,
  changePassword,
  toast,
} from "../store.js";
import ThemeDialog from "../components/ThemeDialog.vue";
import { currentTheme } from "../theme.js";
import AppField from "../components/AppField.vue";
import Icon from "../components/Icon.vue";
import AppDialog from "../components/AppDialog.vue";
import { avatars, avatarFor } from "../../../shared/avatars.mjs";
const themeOpen = ref(false);
const editOpen = ref(false),
  passwordOpen = ref(false);
const selectedAvatar = ref(store.user?.avatarId);
function openEditor() {
  name.value = store.user.displayName;
  selectedAvatar.value = store.user.avatarId;
  nameError.value = "";
  editOpen.value = true;
}
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
    const data = await updateProfile(name.value.trim(), selectedAvatar.value);
    if (data) {
      name.value = data.user.displayName;
      editOpen.value = false;
      toast("昵称与头像已更新");
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
    <p v-if="error" class="profile-error" role="alert">
      {{ error }} <button class="text-btn" @click="load">重新加载</button>
    </p>
    <div class="profile-layout" :aria-busy="loading">
      <section
        class="profile-identity"
        aria-labelledby="profile-identity-title"
      >
        <img
          class="profile-avatar"
          :src="avatarFor(store.user?.avatarId).src"
          :alt="avatarFor(store.user?.avatarId).name + '头像'"
          width="80"
          height="80"
        />
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
              <h2 id="profile-name-title">头像与昵称</h2>
              <p>从 16 个内置卡通头像中选择，昵称可随时修改。</p>
            </div>
          </div>
          <div class="profile-summary">
            <span>{{ store.user?.displayName }}</span
            ><button class="btn" :disabled="loading" @click="openEditor">
              修改资料
            </button>
          </div>
        </section>
        <section class="profile-panel" aria-labelledby="profile-theme-title">
          <div class="profile-panel-heading">
            <Icon name="SlidersHorizontal" :size="20" />
            <div>
              <h2 id="profile-theme-title">界面主题</h2>
              <p>选择喜欢的色系，保存在当前浏览器。</p>
            </div>
          </div>
          <div class="profile-summary">
            <span>{{ currentTheme.name }}</span
            ><button class="btn" @click="themeOpen = true">切换主题</button>
          </div>
        </section>
        <section
          v-if="store.user?.hasPassword"
          class="profile-panel"
          aria-labelledby="profile-password-title"
        >
          <div class="profile-panel-heading">
            <Icon name="BadgeCheck" :size="20" />
            <div>
              <h2 id="profile-password-title">修改密码</h2>
              <p>验证当前密码后设置新密码。</p>
            </div>
          </div>
          <button
            class="btn"
            @click="
              passwordOpen = true;
              passwordError = '';
              passwordMessage = '';
            "
          >
            修改密码
          </button>
        </section>
      </div>
    </div>
  </div>
  <ThemeDialog :open="themeOpen" @close="themeOpen = false" />
  <AppDialog
    :open="editOpen"
    title="修改头像与昵称"
    :width="500"
    :busy="nameBusy"
    @close="editOpen = false"
  >
    <form id="profile-editor" @submit.prevent="saveName" novalidate>
      <fieldset class="avatar-fieldset">
        <legend>选择头像</legend>
        <div class="avatar-options" role="group" aria-label="16 个卡通头像">
          <button
            v-for="avatar in avatars"
            :key="avatar.id"
            type="button"
            class="avatar-option"
            :class="{ selected: selectedAvatar === avatar.id }"
            :aria-label="avatar.name"
            :aria-pressed="selectedAvatar === avatar.id"
            :disabled="nameBusy"
            @click="selectedAvatar = avatar.id"
          >
            <img :src="avatar.src" alt="" width="64" height="64" /><Icon
              v-if="selectedAvatar === avatar.id"
              class="avatar-check"
              name="Check"
              :size="14"
            />
          </button>
        </div>
      </fieldset>
      <label for="profile-name">昵称</label
      ><AppField
        id="profile-name"
        v-model="name"
        autocomplete="nickname"
        maxlength="40"
        :disabled="nameBusy"
        :aria-invalid="!!nameError"
        aria-describedby="profile-name-help"
      />
      <p id="profile-name-help" class="profile-help">
        支持中文，最多 40 个字符。修改后不会影响学习记录。
      </p>
      <p v-if="nameError" class="profile-error" role="alert">{{ nameError }}</p>
    </form>
    <template #footer
      ><button class="btn" :disabled="nameBusy" @click="editOpen = false">
        取消</button
      ><button
        class="btn primary"
        form="profile-editor"
        type="submit"
        :disabled="nameBusy"
      >
        {{ nameBusy ? "保存中…" : "保存" }}
      </button></template
    >
  </AppDialog>
  <AppDialog
    :open="passwordOpen"
    title="修改密码"
    :width="500"
    :busy="passwordBusy"
    @close="
      passwordOpen = false;
      currentPassword = '';
      newPassword = '';
      confirmation = '';
      showPassword = false;
    "
  >
    <form id="password-editor" @submit.prevent="savePassword" novalidate>
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
    </form>
    <template #footer>
      <button
        class="btn"
        :disabled="passwordBusy"
        @click="
          passwordOpen = false;
          currentPassword = '';
          newPassword = '';
          confirmation = '';
          showPassword = false;
        "
      >
        取消
      </button>
      <button
        class="btn primary"
        form="password-editor"
        type="submit"
        :disabled="passwordBusy"
      >
        {{ passwordBusy ? "正在修改…" : "更新密码" }}
      </button>
    </template>
  </AppDialog>
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
  background: var(--theme-soft);
}
.profile-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  overflow-wrap: anywhere;
}
.avatar-fieldset {
  border: 0;
  padding: 0;
  margin: 0 0 24px;
}
.avatar-fieldset legend {
  font-weight: 600;
  margin-bottom: 12px;
}
.avatar-options {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.avatar-option {
  position: relative;
  display: grid;
  place-items: center;
  padding: 5px;
  border: 2px solid transparent;
  border-radius: 18px;
}
.avatar-option img {
  width: 100%;
  height: auto;
  border-radius: 12px;
}
.avatar-option.selected {
  border-color: var(--green);
  background: var(--theme-soft);
}
.avatar-option:focus-visible {
  outline: 2px solid var(--green);
  outline-offset: 3px;
}
.avatar-check {
  position: absolute;
  right: 0;
  bottom: 0;
  background: var(--green);
  color: white;
  border-radius: 50%;
  padding: 3px;
  box-sizing: content-box;
}
.profile-avatar {
  display: grid;
  place-items: center;
  width: 80px;
  height: 80px;
  border-radius: 16px;
  background: var(--theme-soft-strong);
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
  border-block: 1px solid var(--theme-border);
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
#profile-editor label,
#password-editor label {
  display: block;
  font-size: 13px;
  margin-bottom: 9px;
}
#profile-editor .app-field,
#password-editor .app-field {
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
  background: var(--theme-soft);
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
  #profile-editor .app-field,
  #password-editor .app-field {
    font-size: 16px;
  }
  .profile-panel .btn {
    width: 100%;
  }
}
</style>
