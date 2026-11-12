export const DEFAULT_THEME = "graphite";
export const themes = [
  {
    id: "graphite",
    name: "黑白石墨",
    description: "简洁、克制",
    primary: "#27272A",
    hover: "#18181B",
    ink: "#27272A",
    text: "#3F3F46",
    muted: "#71717A",
    faint: "#94949E",
    canvas: "#FAFAFA",
    soft: "#F4F4F5",
    softStrong: "#EDEDEF",
    border: "#E4E4E7",
    focus: "#A1A1AA",
    accent: "#A1A1AA",
  },
  {
    id: "blue",
    name: "石墨蓝",
    description: "清爽、专业",
    primary: "#3659A2",
    hover: "#263D68",
    ink: "#253044",
    text: "#41516C",
    muted: "#69768A",
    faint: "#8C97A8",
    canvas: "#F6F8FC",
    soft: "#EDF2FA",
    softStrong: "#E1E9F7",
    border: "#DFE5EF",
    focus: "#A6BBE1",
    accent: "#9EB4DC",
  },
  {
    id: "purple",
    name: "灰紫色",
    description: "柔和、有辨识度",
    primary: "#6554AF",
    hover: "#473971",
    ink: "#332D45",
    text: "#5D5274",
    muted: "#7C738B",
    faint: "#9B93A7",
    canvas: "#F8F7FC",
    soft: "#F1EDF8",
    softStrong: "#E8E1F3",
    border: "#E6E0F0",
    focus: "#B7A5D8",
    accent: "#B5A8D8",
  },
  {
    id: "amber",
    name: "暖灰琥珀",
    description: "安静、适合阅读",
    primary: "#A85E32",
    hover: "#7D4323",
    ink: "#40332B",
    text: "#6B5343",
    muted: "#8B7B6D",
    faint: "#AC9A89",
    canvas: "#FAF7F2",
    soft: "#F8EFE5",
    softStrong: "#F0E1D0",
    border: "#E9DFD3",
    focus: "#D5AF87",
    accent: "#D8B898",
  },
];
export const normalizeTheme = (id) =>
  themes.some((theme) => theme.id === id) ? id : DEFAULT_THEME;
export const themeById = (id) =>
  themes.find((theme) => theme.id === normalizeTheme(id));
export function themeVariables(id) {
  const theme = themeById(id);
  const variables = Object.fromEntries(
    [
      "primary",
      "hover",
      "ink",
      "text",
      "muted",
      "faint",
      "canvas",
      "soft",
      "softStrong",
      "border",
      "focus",
      "accent",
    ].map((key) => [
      "--theme-" + key.replace(/[A-Z]/g, (char) => "-" + char.toLowerCase()),
      theme[key],
    ]),
  );
  return {
    ...variables,
    "--theme-surface": "#FFFFFF",
    "--theme-focus-soft": theme.primary + "12",
    "--theme-shadow": theme.ink + "26",
    "--theme-shadow-soft": theme.ink + "0A",
    "--theme-backdrop": theme.ink + "66",
  };
}
export const themeCss = (id) =>
  Object.entries(themeVariables(id))
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
