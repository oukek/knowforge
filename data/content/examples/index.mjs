import { examples, fills } from "./helpers.mjs";
import "./foundations.mjs";
import "./platform.mjs";
import "./applied.mjs";
import "./fills.mjs";
export function attachExamples(lessons) {
  for (const lesson of lessons) {
    const example = examples.get(lesson.id);
    if (!example) throw new Error("知识点缺少可运行示例：" + lesson.id);
    lesson.playground = example;
    lesson.language = example.language ?? "javascript";
    lesson.exercises = [
      {
        id: "output-" + lesson.id,
        type: "output",
        title: "预测输出",
        prompt:
          lesson.language === "python"
            ? "先阅读原始 Python 代码，按顺序填写每次 show() 的输出，一次调用占一行。字符串可用单引号或双引号；接受 JSON 写法及 Python 的 True/False/None。"
            : "不运行原始代码，按顺序填写每次 console 输出。每次调用占一行，多个参数以空格分隔；对象/数组接受 JSON 或单引号字面量，对象键可不加引号。",
        code: example.code,
        expectedLogs: example.expectedLogs,
        explanation: example.explanation,
      },
    ];
    if (fills.has(lesson.id)) lesson.exercises.push(fills.get(lesson.id));
  }
  const unknown = [...examples.keys(), ...fills.keys()].filter(
    (id) => !lessons.some((l) => l.id === id),
  );
  if (unknown.length)
    throw new Error("示例引用未知知识点：" + unknown.join(","));
}
