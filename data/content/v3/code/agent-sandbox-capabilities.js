function authorize(cap, action) {
  // 输入已是规范化 POSIX 路径；不处理真实文件系统链接与竞态。
  const inside =
    action.path === cap.root || action.path.startsWith(cap.root + "/");
  if (!inside) return false;
  if (action.write && !cap.write) return false;
  if (action.host && !cap.hosts.includes(action.host)) return false;
  return true;
}
const cap = { root: "/work", write: false, hosts: ["docs.example.test"] };
console.log(authorize(cap, { path: "/work/readme.txt" }));
console.log(authorize(cap, { path: "/workshop/secret" }));
console.log(authorize(cap, { path: "/work/out", write: true }));
console.log(authorize(cap, { path: "/work/out", host: "evil.example.test" }));
console.log("策略模型不替代操作系统隔离");
