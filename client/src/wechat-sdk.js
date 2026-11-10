const entryUrl = location.href.split("#")[0];
let loading,
  configuring = Promise.resolve();
export const inWechat = () => /MicroMessenger/i.test(navigator.userAgent);
export function wechatSigningUrl() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
    ? entryUrl
    : location.href.split("#")[0];
}
function loadSdk() {
  if (window.wx) return Promise.resolve(window.wx);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(() => finish(true), 12000);
    function finish(failed) {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (failed || !window.wx) {
        script.remove();
        reject(new Error("微信 JSSDK 加载失败，请检查网络后重试"));
      } else resolve(window.wx);
    }
    script.src = "https://res.wx.qq.com/open/js/jweixin-1.6.0.js";
    script.async = true;
    script.referrerPolicy = "no-referrer";
    script.onload = () => finish(false);
    script.onerror = () => finish(true);
    document.head.append(script);
  }).catch((e) => {
    loading = undefined;
    throw e;
  });
  return loading;
}
export async function chooseWechatPay(
  parameters,
  configuration,
  active = () => true,
) {
  if (!inWechat()) throw new Error("请在手机微信中打开支付页面");
  if (configuration.appId !== parameters.appId)
    throw new Error("微信授权与支付的 AppID 不一致");
  const run = configuring.then(async () => {
    const wx = await loadSdk();
    if (!active()) throw new DOMException("页面已关闭", "AbortError");
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("微信 JSSDK 验证超时")),
        10000,
      );
      wx.ready(() => {
        clearTimeout(timer);
        resolve();
      });
      wx.error(() => {
        clearTimeout(timer);
        reject(new Error("微信 JSSDK 验证失败，请检查 JS 接口安全域名"));
      });
      wx.config({ ...configuration, debug: false, jsApiList: ["chooseWXPay"] });
    });
    return wx;
  });
  configuring = run.catch(() => {});
  const wx = await run;
  if (!active()) throw new DOMException("页面已关闭", "AbortError");
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("支付结果暂未确认，请核对订单")),
      120000,
    );
    const finish = (v) => {
      clearTimeout(timer);
      resolve(v);
    };
    const { appId, timeStamp, ...signed } = parameters;
    wx.chooseWXPay({
      ...signed,
      timestamp: Number(timeStamp),
      success: () => finish("ok"),
      cancel: () => finish("cancel"),
      fail: () => finish("fail"),
    });
  });
}
