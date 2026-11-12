import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_THEME,
  themes,
  normalizeTheme,
  themeVariables,
} from "../shared/themes.mjs";
import { wechatLoginPage } from "../server/wechat-login-page.mjs";
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
test("内置主题默认石墨，非法偏好回退，主按钮白字达到 4.5:1 对比度", () => {
  assert.equal(DEFAULT_THEME, "graphite");
  assert.equal(new Set(themes.map((t) => t.id)).size, themes.length);
  for (const theme of themes) {
    assert.equal(normalizeTheme(theme.id), theme.id);
    assert(
      1.05 / (luminance(theme.primary) + 0.05) >= 4.5,
      theme.name + " contrast",
    );
    for (const value of Object.values(themeVariables(theme.id)))
      assert.match(value, /^#[\da-f]{6}([\da-f]{2})?$/i);
  }
  for (const id of [null, undefined, "unknown", "<script>alert(1)</script>"])
    assert.equal(normalizeTheme(id), "graphite");
});
test("扫码页复用内置主题并保留确认后的配色，不将外部主题内容注入 HTML", () => {
  for (const theme of themes) {
    const page = wechatLoginPage({
      id: "fixture",
      ticket: "fixture",
      theme: theme.id,
    });
    assert(page.includes('data-theme="' + theme.id + '"'));
    assert(page.includes('name="theme" value="' + theme.id + '"'));
    assert(page.includes("--theme-primary:" + theme.primary));
    assert(
      wechatLoginPage({ confirmed: true, theme: theme.id }).includes(
        'data-theme="' + theme.id + '"',
      ),
    );
  }
  const page = wechatLoginPage({ theme: '"><script>alert(1)</script>' });
  assert(page.includes('data-theme="graphite"'));
  assert(!page.includes("<script>"));
});
