<script setup>
import { ref, watch } from "vue";
import { store, mutate, toast } from "../store";
import Icon from "./Icon.vue";
const props = defineProps({ targetId: String });
const content = ref(""),
  saving = ref(false),
  dirty = ref(false);
watch(
  () => props.targetId,
  () => {
    content.value = store.state.notes[props.targetId]?.content || "";
    dirty.value = false;
  },
  { immediate: true },
);
async function save() {
  saving.value = true;
  const result = await mutate("/notes/" + props.targetId, "PUT", {
    content: content.value,
  });
  saving.value = false;
  if (result) {
    dirty.value = false;
    toast("笔记已保存");
  }
}
</script>
<template>
  <section class="note-editor">
    <div class="section-line">
      <h3><Icon name="NotebookPen" :size="18" /> 我的学习笔记</h3>
      <span class="muted tiny">{{
        dirty ? "有未保存修改" : "保存在本地数据库"
      }}</span>
    </div>
    <textarea
      v-model="content"
      @input="dirty = true"
      maxlength="30000"
      rows="5"
      aria-label="学习笔记"
      placeholder="记录你自己的理解、项目关联和容易混淆的边界…"
    ></textarea>
    <div class="row end">
      <button class="btn small" :disabled="saving || !dirty" @click="save">
        {{ saving ? "保存中…" : "保存笔记" }}
      </button>
    </div>
  </section>
</template>
