<script setup>
import { ref, onMounted } from "vue";
import { request, toast } from "../store.js";
import AppDialog from "./AppDialog.vue";
import AppField from "./AppField.vue";
const section = ref("login"),
  config = ref(null),
  draft = ref(null),
  busy = ref(false),
  error = ref("");
async function load() {
  error.value = "";
  try {
    config.value = await request("/admin/wechat/configuration");
  } catch (e) {
    error.value = e.message;
  }
}
function edit() {
  error.value = "";
  const c = config.value;
  draft.value =
    section.value === "login"
      ? {
          revision: c.revision,
          loginEnabled: c.loginEnabled,
          appId: c.appId,
          appSecret: "",
          frontendUrl: c.frontendUrl,
          apiUrl: c.apiUrl,
        }
      : {
          revision: c.revision,
          payEnabled: c.payEnabled,
          merchantId: c.merchantId,
          merchantSerial: c.merchantSerial,
          platformSerial: c.platformSerial,
          privateKey: "",
          platformPublicKey: "",
          apiV3Key: "",
        };
}
async function save() {
  busy.value = true;
  error.value = "";
  try {
    config.value = await request(
      "/admin/wechat/" + section.value,
      "PUT",
      draft.value,
    );
    draft.value = null;
    toast("微信配置已加密保存并生效");
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>
<template>
  <section class="wechat-admin">
    <div class="section-line">
      <p class="tiny muted">
        配置加密保存在数据库中，保存后生效。密钥留空保留原值。
      </p>
      <button class="btn small" :disabled="busy" @click="load">刷新</button>
    </div>
    <div class="type-tabs" role="group" aria-label="微信接入配置">
      <button
        :class="{ active: section === 'login' }"
        @click="section = 'login'"
      >
        微信登录</button
      ><button
        :class="{ active: section === 'payment' }"
        @click="section = 'payment'"
      >
        微信支付
      </button>
    </div>
    <p v-if="error && !draft" class="ai-error" role="alert">{{ error }}</p>
    <template v-if="config">
      <p v-if="!config.encryptionReady" class="info-banner">
        服务器尚未配置
        AI_ENCRYPTION_KEY，配置好主密钥后才能保存。主密钥需单独备份，不存入数据库。
      </p>
      <section class="ai-detail">
        <div class="section-line">
          <strong
            >{{ section === "login" ? "公众号连接" : "商户连接" }} ·
            {{
              (section === "login" ? config.loginEnabled : config.payEnabled)
                ? "已开放"
                : "已关闭"
            }}</strong
          ><button
            class="btn primary"
            :disabled="!config.encryptionReady"
            @click="edit"
          >
            编辑配置
          </button>
        </div>
        <dl v-if="section === 'login'" class="wechat-summary">
          <div>
            <dt>公众号 AppID</dt>
            <dd>{{ config.appId || "未配置" }}</dd>
          </div>
          <div>
            <dt>AppSecret</dt>
            <dd>{{ config.hasAppSecret ? "已加密保存" : "未配置" }}</dd>
          </div>
          <div>
            <dt>前端地址</dt>
            <dd>{{ config.frontendUrl }}</dd>
          </div>
          <div>
            <dt>授权回调地址</dt>
            <dd>{{ config.oauthCallback }}</dd>
          </div>
        </dl>
        <dl v-else class="wechat-summary">
          <div>
            <dt>公众号 AppID</dt>
            <dd>{{ config.appId || "请先配置微信登录" }}</dd>
          </div>
          <div>
            <dt>商户号</dt>
            <dd>{{ config.merchantId || "未配置" }}</dd>
          </div>
          <div>
            <dt>商户私钥</dt>
            <dd>{{ config.hasPrivateKey ? "已加密保存" : "未配置" }}</dd>
          </div>
          <div>
            <dt>微信支付公钥</dt>
            <dd>{{ config.hasPlatformPublicKey ? "已加密保存" : "未配置" }}</dd>
          </div>
          <div>
            <dt>API v3 密钥</dt>
            <dd>{{ config.hasApiV3Key ? "已加密保存" : "未配置" }}</dd>
          </div>
          <div>
            <dt>支付通知地址</dt>
            <dd>{{ config.paymentNotify }}</dd>
          </div>
        </dl>
        <p class="tiny muted">
          {{
            section === "login"
              ? "公众号后台的网页授权域名填 API 域名；需为具有网页授权权限的公众号。"
              : "支持 Native 扫码与微信内 JSAPI，使用上方公众号 AppID。关闭新购买后，存量订单仍可核对到账。JSAPI 支付授权目录配置前端域名根目录。"
          }}
        </p>
      </section>
    </template>
    <AppDialog
      :open="!!draft"
      mobile-fullscreen
      :title="section === 'login' ? '微信登录配置' : '微信支付配置'"
      description="配置整体加密入库；密钥不会回显，留空保留原值。"
      :width="660"
      :busy="busy"
      @close="draft = null"
    >
      <form
        v-if="draft"
        id="wechat-settings"
        class="wechat-form"
        @submit.prevent="save"
      >
        <p v-if="error" class="ai-error" role="alert">{{ error }}</p>
        <template v-if="section === 'login'">
          <label
            >公众号 AppID<AppField
              v-model="draft.appId"
              required
              maxlength="64"
              autocomplete="off"
          /></label>
          <label
            >AppSecret<AppField
              v-model="draft.appSecret"
              type="password"
              autocomplete="new-password"
              :placeholder="
                config.hasAppSecret
                  ? '已保存，留空保留'
                  : '填写公众号 AppSecret'
              "
              maxlength="128"
          /></label>
          <label
            >前端 HTTPS 地址<AppField
              v-model="draft.frontendUrl"
              required
              placeholder="https://knowforge.ookew.com"
          /></label>
          <label
            >API HTTPS 地址<AppField
              v-model="draft.apiUrl"
              required
              placeholder="https://knowforge-api.ookew.com"
          /></label>
          <label class="wechat-switch"
            ><input
              v-model="draft.loginEnabled"
              type="checkbox"
            />开放微信登录</label
          >
        </template>
        <template v-else>
          <p class="tiny muted">
            公众号 AppID：{{ config.appId || "请先配置微信登录" }}
          </p>
          <label
            >商户号<AppField
              v-model="draft.merchantId"
              autocomplete="off"
              maxlength="32"
          /></label>
          <label
            >商户 API 证书序列号<AppField
              v-model="draft.merchantSerial"
              maxlength="64"
          /></label>
          <label
            >微信支付公钥 ID／平台证书序列号<AppField
              v-model="draft.platformSerial"
              maxlength="128"
          /></label>
          <label
            >商户私钥 PEM<AppField
              v-model="draft.privateKey"
              multiline
              rows="5"
              autocomplete="off"
              :placeholder="
                config.hasPrivateKey ? '已保存，留空保留' : '粘贴商户私钥 PEM'
              "
          /></label>
          <label
            >微信支付公钥／平台证书 PEM<AppField
              v-model="draft.platformPublicKey"
              multiline
              rows="5"
              autocomplete="off"
              :placeholder="
                config.hasPlatformPublicKey
                  ? '已保存，留空保留'
                  : '粘贴微信支付公钥或平台证书 PEM'
              "
          /></label>
          <label
            >API v3 密钥<AppField
              v-model="draft.apiV3Key"
              type="password"
              autocomplete="new-password"
              maxlength="32"
              :placeholder="
                config.hasApiV3Key ? '已保存，留空保留' : '32 字节 API v3 密钥'
              "
          /></label>
          <label class="wechat-switch"
            ><input
              v-model="draft.payEnabled"
              type="checkbox"
            />开放新购买</label
          >
        </template>
      </form>
      <template #footer
        ><button class="btn" :disabled="busy" @click="draft = null">取消</button
        ><button
          class="btn primary"
          type="submit"
          form="wechat-settings"
          :disabled="busy"
        >
          {{ busy ? "保存中…" : "加密保存" }}
        </button></template
      >
    </AppDialog>
  </section>
</template>
<style scoped>
.wechat-summary {
  display: grid;
  gap: 14px;
  margin: 22px 0;
}
.wechat-summary > div {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: 16px;
  font-size: 13px;
}
.wechat-summary dt {
  color: var(--muted);
}
.wechat-summary dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.wechat-form {
  display: grid;
  gap: 18px;
}
.wechat-form label {
  display: grid;
  gap: 8px;
  font-size: 13px;
}
.wechat-form .app-field {
  width: 100%;
  padding: 11px 12px;
  min-height: 44px;
}
.wechat-form .wechat-switch {
  display: flex;
  align-items: center;
  gap: 10px;
}
.wechat-switch input {
  accent-color: var(--green);
  width: 18px;
  height: 18px;
}
@media (max-width: 767px) {
  .wechat-summary > div {
    grid-template-columns: 1fr;
    gap: 5px;
  }
}
</style>
