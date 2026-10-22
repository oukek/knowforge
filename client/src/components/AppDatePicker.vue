<script setup>
import { computed, nextTick, ref } from "vue";
import AdaptivePopup from "./AdaptivePopup.vue";
import Icon from "./Icon.vue";
import { parseDate, dateValue, monthDays, shiftMonth } from "../calendar.js";
defineOptions({ inheritAttrs: false });
const props = defineProps({
  modelValue: { type: String, default: "" },
  label: { type: String, default: "选择日期" },
  disabled: Boolean,
});
const emit = defineEmits(["update:modelValue", "change"]);
const trigger = ref(null),
  calendar = ref(null),
  open = ref(false),
  view = ref("days");
const current = ref(parseDate(props.modelValue) || new Date()),
  focused = ref(dateValue(current.value));
const days = computed(() => monthDays(current.value));
const year = computed(() => current.value.getFullYear());
const firstYear = computed(() => Math.floor(year.value / 12) * 12);
const years = computed(() =>
  Array.from({ length: 12 }, (_, i) => firstYear.value + i).filter(
    (y) => y >= 1000 && y <= 9999,
  ),
);
const heading = computed(() =>
  view.value === "days"
    ? `${year.value} 年 ${current.value.getMonth() + 1} 月`
    : view.value === "months"
      ? `${year.value} 年`
      : `${firstYear.value} — ${firstYear.value + 11}`,
);
function show() {
  if (props.disabled) return;
  current.value = parseDate(props.modelValue) || new Date();
  focused.value = dateValue(current.value);
  view.value = "days";
  open.value = true;
}
function choose(date) {
  const value = dateValue(date);
  emit("update:modelValue", value);
  emit("change", value);
  open.value = false;
}
function navigate(amount) {
  const next = shiftMonth(
    current.value,
    amount * (view.value === "days" ? 1 : view.value === "months" ? 12 : 144),
  );
  if (next.getFullYear() < 1000 || next.getFullYear() > 9999) return;
  current.value = next;
  focused.value = dateValue(next);
}
function month(value) {
  current.value = new Date(year.value, value, 1, 12);
  focused.value = dateValue(current.value);
  view.value = "days";
}
function selectYear(value) {
  current.value = new Date(value, current.value.getMonth(), 1, 12);
  view.value = "months";
}
async function dayKey(event, date) {
  let next = new Date(date);
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[
    event.key
  ];
  if (delta) next.setDate(next.getDate() + delta);
  else if (event.key === "Home")
    next.setDate(next.getDate() - ((next.getDay() + 6) % 7));
  else if (event.key === "End")
    next.setDate(next.getDate() + 6 - ((next.getDay() + 6) % 7));
  else if (event.key === "PageUp" || event.key === "PageDown")
    next = shiftMonth(date, event.key === "PageUp" ? -1 : 1);
  else return;
  event.preventDefault();
  if (next.getFullYear() < 1000 || next.getFullYear() > 9999) return;
  current.value = next;
  focused.value = dateValue(next);
  await nextTick();
  calendar.value?.querySelector(`[data-date="${focused.value}"]`)?.focus();
}
</script>
<template>
  <span class="app-date">
    <button
      ref="trigger"
      v-bind="$attrs"
      class="app-date-trigger"
      type="button"
      :disabled="disabled"
      :aria-label="label"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="show"
    >
      <span>{{ modelValue || "请选择日期" }}</span
      ><Icon name="CalendarDays" :size="18" />
    </button>
    <AdaptivePopup
      :open="open"
      :anchor="trigger"
      :title="label"
      @close="open = false"
    >
      <div ref="calendar" class="app-calendar">
        <div class="calendar-heading">
          <button
            type="button"
            class="icon-btn"
            :aria-label="view === 'days' ? '上个月' : '上一组'"
            @click="navigate(-1)"
          >
            <Icon name="ChevronRight" class="calendar-prev" :size="19" />
          </button>
          <button
            type="button"
            class="calendar-title"
            :disabled="view === 'years'"
            @click="view = view === 'days' ? 'months' : 'years'"
          >
            {{ heading
            }}<Icon v-if="view !== 'years'" name="ChevronDown" :size="15" />
          </button>
          <button
            type="button"
            class="icon-btn"
            :aria-label="view === 'days' ? '下个月' : '下一组'"
            @click="navigate(1)"
          >
            <Icon name="ChevronRight" :size="19" />
          </button>
        </div>
        <template v-if="view === 'days'">
          <div class="calendar-week" aria-hidden="true">
            <span
              v-for="day in ['一', '二', '三', '四', '五', '六', '日']"
              :key="day"
              >{{ day }}</span
            >
          </div>
          <div class="calendar-days" role="group" aria-label="选择日期">
            <button
              v-for="day in days"
              :key="dateValue(day)"
              type="button"
              :data-date="dateValue(day)"
              :data-autofocus="dateValue(day) === focused ? '' : undefined"
              :tabindex="dateValue(day) === focused ? 0 : -1"
              :aria-label="dateValue(day)"
              :aria-pressed="dateValue(day) === modelValue"
              :aria-current="
                dateValue(day) === dateValue(new Date()) ? 'date' : undefined
              "
              :class="{
                'other-month': day.getMonth() !== current.getMonth(),
                selected: dateValue(day) === modelValue,
              }"
              @click="choose(day)"
              @keydown="dayKey($event, day)"
            >
              {{ day.getDate() }}
            </button>
          </div>
        </template>
        <div v-else-if="view === 'months'" class="calendar-periods">
          <button v-for="(_, i) in 12" :key="i" type="button" @click="month(i)">
            {{ i + 1 }} 月
          </button>
        </div>
        <div v-else class="calendar-periods">
          <button
            v-for="y in years"
            :key="y"
            type="button"
            @click="selectYear(y)"
          >
            {{ y }} 年
          </button>
        </div>
        <footer class="calendar-footer">
          <span>{{ modelValue ? `已选 ${modelValue}` : "请选择开始日期" }}</span
          ><button type="button" class="text-btn" @click="choose(new Date())">
            今天
          </button>
        </footer>
      </div>
    </AdaptivePopup>
  </span>
</template>
<style>
.app-date {
  display: inline-block;
  width: 100%;
  min-width: 0;
}
.app-date-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 42px;
  border: 1px solid #dce4df;
  border-radius: 7px;
  background: #fff;
  padding: 9px 12px;
  font-size: 13px;
}
.app-date-trigger svg {
  color: var(--green);
  flex-shrink: 0;
}
.calendar-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.calendar-heading .icon-btn {
  min-width: 36px;
  min-height: 40px;
}
.calendar-prev {
  transform: rotate(180deg);
}
.calendar-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  font-weight: 600;
  font-size: 14px;
}
.calendar-week,
.calendar-days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  text-align: center;
  gap: 2px;
}
.calendar-week {
  color: var(--muted);
  font-size: 12px;
  margin: 6px 0;
}
.calendar-week span {
  padding: 6px 0;
}
.calendar-days button {
  min-height: 38px;
  border-radius: 7px;
  padding: 0;
  font-size: 14px;
}
.calendar-days button.other-month {
  color: #9aa9a1;
}
.calendar-days button[aria-current="date"] {
  box-shadow: inset 0 0 0 1px #8aaf9d;
}
.calendar-days button.selected {
  color: #fff;
  background: var(--green);
}
.calendar-days button:hover:not(.selected),
.calendar-periods button:hover {
  background: var(--green-light);
}
.calendar-periods {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding: 12px 0;
}
.calendar-periods button {
  min-height: 48px;
  border-radius: 7px;
}
.calendar-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-top: 1px solid var(--line);
  margin-top: 10px;
  padding-top: 10px;
}
.calendar-footer > span {
  color: var(--muted);
  font-size: 12px;
}
.calendar-footer button {
  min-height: 40px;
}
.is-sheet .calendar-days button {
  min-height: 44px;
  font-size: 16px;
}
.is-sheet .calendar-heading .icon-btn,
.is-sheet .calendar-title {
  min-height: 44px;
}
</style>
