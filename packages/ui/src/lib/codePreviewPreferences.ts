import type { BundledTheme } from "shiki";
import { CODE_THEME_VARIABLES_NAME, getCodeThemeVariablesName } from "@/lib/codeThemeBridge.js";
import type { CodePreviewSettings } from "@/store/index.js";

interface CodePreviewThemeOption {
  value: BundledTheme;
  label: string;
}

export const CODE_PREVIEW_THEME_OPTIONS: CodePreviewThemeOption[] = [
  { value: "github-light", label: "GitHub Light" },
  { value: "github-dark", label: "GitHub Dark" },
  { value: "vitesse-light", label: "Vitesse Light" },
  { value: "vitesse-dark", label: "Vitesse Dark" },
  { value: "min-light", label: "Minimal Light" },
  { value: "min-dark", label: "Minimal Dark" },
  { value: "github-light-high-contrast", label: "GitHub HC Light" },
  { value: "github-dark-high-contrast", label: "GitHub HC Dark" },
  { value: "catppuccin-latte", label: "Catppuccin Latte" },
  { value: "catppuccin-mocha", label: "Catppuccin Mocha" },
];

const DARK_CODE_PREVIEW_THEMES: readonly BundledTheme[] = [
  "github-dark",
  "vitesse-dark",
  "min-dark",
  "github-dark-high-contrast",
  "catppuccin-mocha",
];

export function isDarkCodePreviewTheme(theme: BundledTheme): boolean {
  // 代码主题的明暗语义必须跟随设置页支持的显式选项，不能用主题名正则猜测。
  return DARK_CODE_PREVIEW_THEMES.includes(theme);
}

export const SETTINGS_PREVIEW_CODE = `const themePreview: ThemeConfig = {
  surface: "sidebar",
  accent: "#339CFF",
  contrast: 45,
};`;

export function getCodePreviewTheme(
  mode: "light" | "dark",
  settings: CodePreviewThemeSource,
): BundledTheme {
  return mode === "dark" ? settings.darkTheme : settings.lightTheme;
}

/**
 * 只要两个槽位主题名的调用方就够用：`CodePreviewSettings` 的完整形状（含字号、行号等）
 * 是设置页的事，`PatchDiffSettings` 这类精简设置只带这两个字段。
 */
export type CodePreviewThemeSource = Pick<CodePreviewSettings, "lightTheme" | "darkTheme">;

/**
 * 实际下发给高亮引擎的主题名：设置页能选的 10 个自带主题，或者扩展层的变量主题名。
 *
 * `@pierre/diffs` 那边只认「名字」（它自己拿名字去解析主题对象），所以扩展层接管时不能
 * 传主题对象，只能传这个恒定名字 —— 颜色全部由 `documentElement` 上的 `--diffs-*` 变量决定。
 */
export type CodePreviewThemeName = BundledTheme | typeof CODE_THEME_VARIABLES_NAME;

/**
 * 解析单槽主题名：扩展层接管时返回变量主题名（扩展层优先级高于设置页下拉）。
 *
 * 之所以和 `getCodePreviewTheme` 分成两个函数，是因为后者是**纯函数**，设置页的预览卡片
 * 要靠它如实显示「用户选的主题长什么样」；接管与否是运行期状态，不该混进设置值的语义里。
 */
export function resolveCodePreviewTheme(
  mode: "light" | "dark",
  settings: CodePreviewThemeSource,
): CodePreviewThemeName {
  const variablesName = getCodeThemeVariablesName();
  if (variablesName !== null) return variablesName;
  return getCodePreviewTheme(mode, settings);
}

/** 解析给 `@pierre/diffs` 的双槽主题名。 */
export function resolveCodePreviewThemePair(settings: CodePreviewThemeSource): {
  light: CodePreviewThemeName;
  dark: CodePreviewThemeName;
} {
  return {
    light: resolveCodePreviewTheme("light", settings),
    dark: resolveCodePreviewTheme("dark", settings),
  };
}
