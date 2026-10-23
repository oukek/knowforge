<script setup>
import AppFileUpload from "../components/AppFileUpload.vue";
import { apiUrl } from "../api-config.js";
import { ref } from "vue";
import { store, mutate, toast } from "../store";
import Icon from "../components/Icon.vue";
const importing = ref(false),
  pending = ref(null),
  pendingName = ref(""),
  error = ref("");
async function readBackup(file) {
  if (!file) return;
  error.value = "";
  pending.value = null;
  pendingName.value = "";
  try {
    if (file.size > 12 * 1024 * 1024) throw new Error("备份超过 12MB");
    const parsed = JSON.parse(await file.text());
    if (parsed.schemaVersion !== 1 || !parsed.state)
      throw new Error("不是兼容的学习备份文件");
    pending.value = parsed;
    pendingName.value = file.name;
  } catch (err) {
    error.value = err.message;
  }
}
async function importBackup() {
  importing.value = true;
  const data = await mutate("/import", "POST", pending.value);
  importing.value = false;
  if (data) {
    pending.value = null;
    toast(data.message);
  }
}
</script>
<template>
  <div class="page-enter">
    <div class="page-heading">
      <div>
        <div class="eyebrow">SOURCES & DATA</div>
        <h1>资料有出处，判断有边界。</h1>
        <p>
          保留原始材料，公开校正与适用范围。你可以完整导出知识库和自己的学习记录。
        </p>
      </div>
      <span class="badge">整理于 {{ store.catalog.updatedAt }}</span>
    </div>
    <div class="info-banner">
      <Icon name="BadgeInfo" :size="21" />
      <p>
        {{
          store.catalog.disclaimer
        }}题目与解释由材料扩展编写；“已核对”仅表示列明范围核对过，不表示逐字审计整站官方文档。
      </p>
    </div>
    <section class="data-actions">
      <a :href="apiUrl('/export/catalog')" class="data-action"
        ><Icon name="Database" :size="25" />
        <h3>完整结构化题库</h3>
        <p>专题、知识点、题目、答案、实验、用例、校正和引用。</p>
        <span>下载 JSON <Icon name="Download" :size="16" /></span></a
      ><a :href="apiUrl('/export/handbook')" class="data-action"
        ><Icon name="BookOpenText" :size="25" />
        <h3>完整学习手册</h3>
        <p>全部讲解、问答、客观题解析与参考实现，便于离线阅读。</p>
        <span>下载 Markdown <Icon name="Download" :size="16" /></span></a
      ><a :href="apiUrl('/export/backup')" class="data-action"
        ><Icon name="HardDriveDownload" :size="25" />
        <h3>我的学习备份</h3>
        <p>进度、收藏、笔记、答题、复习计划和模拟记录。</p>
        <span>导出个人数据 <Icon name="Download" :size="16" /></span
      ></a>
    </section>
    <p class="muted">
      <a :href="apiUrl('/export/python-demo')" class="text-link"
        >下载 Python 全链路练习项目</a
      >
      · 标准库采集、SQLite、REST API 与确定性检索；Python 3.11+。
    </p>
    <section class="backup-import">
      <div>
        <h3>从备份恢复学习记录</h3>
        <p>
          采用合并导入：保留现有记录，同 ID
          的进度、笔记和复习状态使用备份值，作答按题目与时间去重。
        </p>
      </div>
      <AppFileUpload
        :disabled="importing"
        @select="readBackup"
        @error="error = $event"
      />
      <p v-if="error" class="error-text">{{ error }}</p>
      <div v-if="pending" class="import-preview">
        <strong>已读取：{{ pendingName }}</strong>
        <p>
          笔记 {{ Object.keys(pending.state.notes || {}).length }} 条 · 进度
          {{ Object.keys(pending.state.progress || {}).length }} 条 · 作答
          {{ pending.state.attempts?.length || 0 }} 次 · 随堂验证
          {{ pending.state.exerciseAttempts?.length || 0 }} 次。确认合并后同 ID
          内容会采用备份值。
        </p>
        <div class="row">
          <button
            class="btn primary small"
            :disabled="importing"
            @click="importBackup"
          >
            {{ importing ? "导入中…" : "确认合并备份" }}</button
          ><button class="btn small" @click="pending = null">取消</button>
        </div>
      </div>
    </section>
    <section class="corrections-section">
      <div class="section-line">
        <div>
          <h2>原材料校正记录</h2>
          <p class="muted">区分已确认机制、经验判断与缺少依据的说法。</p>
        </div>
        <span class="badge subtle"
          >{{ store.catalog.corrections.length }} 项</span
        >
      </div>
      <article
        v-for="(c, i) in store.catalog.corrections"
        :key="c.id"
        class="correction-item"
      >
        <span class="correction-index">{{
          String(i + 1).padStart(2, "0")
        }}</span>
        <div>
          <div class="row wrap">
            <h3>{{ c.title }}</h3>
            <span class="badge subtle">{{
              c.severity === "technical"
                ? "技术校正"
                : c.severity === "unverified"
                  ? "待核实"
                  : "证据边界"
            }}</span>
          </div>
          <p class="original-claim">原说法：{{ c.original }}</p>
          <p>{{ c.correction }}</p>
          <div class="row wrap">
            <a
              v-for="s in store.catalog.sources.filter((s) =>
                c.sourceIds.includes(s.id),
              )"
              :key="s.id"
              :href="s.url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-link tiny"
              >{{ s.title }}<Icon name="ExternalLink" :size="12"
            /></a>
          </div>
        </div>
      </article>
    </section>
    <section class="source-catalog">
      <div class="section-line">
        <div>
          <h2>官方与一手参考资料</h2>
          <p class="muted">
            已核对来源标注日期；其余作为拓展入口，使用前按目标版本复核。
          </p>
        </div>
      </div>
      <a
        v-for="s in store.catalog.sources"
        :key="s.id"
        :href="s.url"
        target="_blank"
        rel="noopener noreferrer"
        class="source-row"
        ><Icon
          :name="s.status === 'verified' ? 'BadgeCheck' : 'BookOpen'"
          :size="21" />
        <div>
          <strong>{{ s.title }}</strong>
          <p>{{ s.scope }}</p>
          <small>{{
            s.kind === "interview-report"
              ? "公开内容已读 · " + s.checkedAt + " · 未经公司确认"
              : s.status === "verified"
                ? "范围已核对 · " + s.checkedAt
                : "拓展参考 · 未逐项在线核对"
          }}</small>
        </div>
        <Icon name="ArrowUpRight" :size="18"
      /></a>
    </section>
    <section class="scope-note">
      <h3>评分与运行范围</h3>
      <p>
        选择题按标准选项判分；开放题仅保存自评；代码实验在受限网络的浏览器
        Worker
        中运行并设超时，属于本地自学工具，不能作为安全在线评测或招聘评分平台。
      </p>
      <p>
        {{
          store.database === "mysql"
            ? "学习数据保存在服务器配置的 MySQL 数据库。"
            : "学习数据保存在服务端 SQLite 数据库。"
        }}代码编辑草稿保存在当前浏览器
        localStorage，个人数据导出不包含这些未提交草稿，重要代码请复制保存。本项目不接入大模型，不产生模型费用。
      </p>
    </section>
  </div>
</template>
