import { themeCss, themeById, normalizeTheme } from "../shared/themes.mjs";
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );

export function wechatLoginPage({
  id,
  ticket,
  confirmed = false,
  theme = "graphite",
}) {
  const icon = confirmed
    ? '<path d="m17 25 6 6 13-14"/><circle cx="26" cy="25" r="20"/>'
    : '<rect x="7" y="9" width="38" height="27" rx="4"/><path d="M18 44h16m-8-8v8m-8-22 5 5 11-11"/>';
  return `<!doctype html>
<html lang="zh-CN" data-theme="${normalizeTheme(theme)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light">
<meta name="theme-color" content="${themeById(theme).primary}">
<title>${confirmed ? "登录已确认" : "确认微信登录"} · KnowForge</title>
<style>
:root{${themeCss(theme)};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:var(--theme-ink);background:var(--theme-canvas);font-synthesis:none}
*{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100svh;display:flex;flex-direction:column;padding:max(28px,env(safe-area-inset-top)) 20px max(24px,env(safe-area-inset-bottom))}
.brand{display:flex;align-items:center;gap:10px;justify-content:center;color:var(--theme-hover);font-size:20px;font-weight:700;letter-spacing:-.5px}.brand-mark{display:grid;grid-template-columns:repeat(2,9px);gap:3px;transform:rotate(-12deg)}.brand-mark i{width:9px;height:9px;background:var(--theme-primary);border-radius:2px}.brand-mark i:last-child{background:var(--theme-accent)}.brand small{display:block;font-size:10px;font-weight:400;letter-spacing:2px;color:var(--theme-muted);margin-top:3px}
main{width:100%;max-width:420px;margin:auto; padding:36px 0}.card{padding:36px 28px 28px;border:1px solid var(--theme-border);border-radius:18px;background:#fff;box-shadow:0 12px 40px var(--theme-shadow-soft);text-align:center}.icon{display:grid;place-items:center;width:80px;height:80px;margin:0 auto 25px;border-radius:24px;background:var(--theme-soft);color:var(--theme-primary)}.icon svg{width:52px;height:52px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.status{font-size:12px;color:var(--theme-text);margin:0 0 12px}h1{font-size:25px;line-height:1.4;letter-spacing:-.5px;margin:0 0 14px;font-weight:650}.description{font-size:14px;line-height:1.9;color:var(--theme-muted);margin:0}.device{display:flex;align-items:center;gap:12px;text-align:left;padding:16px;margin:25px 0;background:var(--theme-canvas);border:1px solid var(--theme-border);border-radius:10px}.device svg{width:24px;height:24px;fill:none;stroke:var(--theme-muted);stroke-width:1.6;flex-shrink:0}.device strong{display:block;font-size:14px;font-weight:600}.device span{display:block;font-size:12px;color:var(--theme-muted);margin-top:5px}form{margin:0}button{width:100%;min-height:48px;border:0;border-radius:9px;background:var(--theme-primary);color:#fff;font:inherit;font-size:15px;font-weight:600;cursor:pointer}button:hover{background:var(--theme-hover)}button:focus-visible{outline:3px solid var(--theme-focus);outline-offset:4px}.hint{font-size:12px;line-height:1.8;color:var(--theme-faint);margin:17px 0 0}.complete{padding:14px;border-radius:9px;background:var(--theme-soft);color:var(--theme-primary);font-size:14px;margin-top:26px}footer{text-align:center;font-size:11px;letter-spacing:1px;color:var(--theme-faint)}@media(max-width:350px){body{padding-inline:16px}.card{padding:30px 22px}h1{font-size:23px}}
</style>
</head>
<body>
<header class="brand" aria-label="KnowForge 知行实验室"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>KnowForge.<small>知行实验室</small></span></header>
<main><section class="card" aria-labelledby="title">
<div class="icon" aria-hidden="true"><svg viewBox="0 0 52 52">${icon}</svg></div>
<p class="status">${confirmed ? "微信登录 · 确认成功" : "微信身份已验证"}</p>
<h1 id="title">${confirmed ? "登录已确认" : "登录 KnowForge"}</h1>
<p class="description">${confirmed ? "请回到刚才扫码的设备，<br>页面将自动进入你的学习空间。" : "确认后，刚才展示二维码的设备<br>将登录你的学习账号。"}</p>
${confirmed ? '<div class="complete" role="status">已完成确认，可以关闭此页面</div>' : `<div class="device"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></svg><div><strong>发起扫码的设备</strong><span>请确认这是你本人正在使用的设备</span></div></div><form method="post" action="/api/auth/wechat/confirm"><input type="hidden" name="id" value="${escapeHtml(id)}"><input type="hidden" name="ticket" value="${escapeHtml(ticket)}"><input type="hidden" name="theme" value="${normalizeTheme(theme)}"><button type="submit">确认登录</button></form><p class="hint">如果不是本人操作，请关闭此页面，不要确认。</p>`}
</section></main>
<footer>理解之后，再向前一步</footer>
</body></html>`;
}
