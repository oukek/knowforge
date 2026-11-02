// Relevant primary references identified when auditing courses without a source.
const additions = [
  {
    id: "review-refactoring",
    title: "Martin Fowler · 重构定义与方法",
    url: "https://refactoring.com/",
    scope: "重构的定义和内部结构改进；具体项目迁移方案需自行验证。",
    status: "verified",
    checkedAt: "2026-11-02",
  },
  {
    id: "review-react-native",
    title: "React Native · 官方入门",
    url: "https://reactnative.dev/docs/getting-started",
    scope: "React Native 入门和平台边界；不代表与其他跨端方案的性能比较结论。",
    status: "verified",
    checkedAt: "2026-11-02",
  },
  {
    id: "review-flutter-architecture",
    title: "Flutter · 架构概览",
    url: "https://docs.flutter.dev/resources/architectural-overview",
    scope: "Flutter 跨平台架构和渲染层次；具体选型应基于目标设备实测。",
    status: "verified",
    checkedAt: "2026-11-02",
  },
  {
    id: "review-platform-engineering",
    title: "CNCF · 平台工程成熟度模型",
    url: "https://tag-app-delivery.cncf.io/whitepapers/platform-eng-maturity-model/",
    scope: "平台工程的团队、流程、技术与业务目标；不代表项目必须使用特定平台架构。",
    status: "verified",
    checkedAt: "2026-11-02",
  },
  {
    id: "review-retrieval-study",
    title: "Karpicke & Blunt · Retrieval practice experiment",
    url: "https://pubmed.ncbi.nlm.nih.gov/21252317/",
    scope: "科学概念学习中检索练习的实验研究；研究情境与个人学习效果可能不同。",
    status: "verified",
    checkedAt: "2026-11-02",
  },
  {
    id: "review-architecture-tradeoffs",
    title: "AWS · 评估架构权衡",
    url: "https://docs.aws.amazon.com/wellarchitected/latest/framework/perf_architecture_evaluate_trade_offs.html",
    scope: "以客户影响与工作负载约束评估架构性能权衡；具体项目需自行验证。",
    status: "verified",
    checkedAt: "2026-11-02",
  },
  {
    id: "review-harvard-interview",
    title: "Harvard MCS · 面试准备与经历表达",
    url: "https://careerservices.fas.harvard.edu/resources/interviewing/",
    scope: "面试准备与通过情境、行动和结果描述经历的参考，不代表特定公司面试流程。",
    status: "verified",
    checkedAt: "2026-11-02",
  },
];
const lessonSources = {
  "project-story": ["review-harvard-interview"],
  "project-depth": ["review-harvard-interview"],
  "study-answer": ["review-harvard-interview"],
  "project-metrics": ["vitals"],
  "project-incident": ["ie-sre-troubleshoot"],
  "arch-tradeoff": ["review-architecture-tradeoffs"],
  "arch-scale": ["ie-sre-monitor"],
  "study-review": ["review-retrieval-study"],
  "project-refactor": ["review-refactoring"],
  "arch-crossplatform": ["wx-runtime", "review-react-native", "review-flutter-architecture"],
  "arch-platform": ["review-platform-engineering"],
  "arch-future": ["owasp-llm", "sse"],
  "study-priority": ["review-harvard-interview"],
  "study-plan": ["review-retrieval-study"],
};
export function attachReviewedSources(lessons, sources) {
  const known = new Set(sources.map((source) => source.id));
  for (const source of additions) {
    if (known.has(source.id)) throw new Error(`参考来源 ID 重复：${source.id}`);
    sources.push(source);
    known.add(source.id);
  }
  const seen = new Set();
  for (const lesson of lessons) {
    const ids = lessonSources[lesson.id];
    if (!ids) continue;
    for (const id of ids) if (!known.has(id)) throw new Error(`来源不存在：${id}`);
    lesson.sourceIds = [...new Set([...(lesson.sourceIds || []), ...ids])];
    seen.add(lesson.id);
  }
  for (const id of Object.keys(lessonSources))
    if (!seen.has(id)) throw new Error(`来源关联课程不存在：${id}`);
}
