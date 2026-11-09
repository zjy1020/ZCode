import { registerCustomCSSVariableTheme, type HighlighterTypes } from "@pierre/diffs";
import type { WorkerInitializationRenderOptions } from "@pierre/diffs/react";
import type { BundledTheme } from "shiki";
import { CODE_THEME_VARIABLES_NAME, getCodeThemeVariablesName } from "@/lib/codeThemeBridge.js";

/**
 * @pierre/diffs 默认使用 shiki 的 JavaScript 正则引擎（shiki-js）。该引擎把 TextMate
 * 语法逐条翻译成巨型 RegExp 并在引擎级缓存里永久持有，V8 会把执行过的正则编译成原生代码放进
 * code space；双字节文本（中文注释等）还会再编译一份。主窗口和 4 个 diff worker 共用同一个
 * 256MB code range，长时间运行后会被这些正则占满，触发 renderer 的 V8 OOM
 * （CALL_AND_RETRY_LAST，old-space 仍有大量空闲，code cage "ran out of reservation"）。
 * oniguruma WASM 引擎的正则活在 wasm 线性内存里，不占 V8 代码区，且是 TextMate 语法的参考实现。
 */
export const DIFFS_PREFERRED_HIGHLIGHTER: HighlighterTypes = "shiki-wasm";

export interface DiffsHighlighterThemeSettings {
  lightTheme: BundledTheme;
  darkTheme: BundledTheme;
}

/**
 * 变量主题的兜底值（**裸键**，`@pierre/diffs` 会自己拼成 `--diffs-` + 键名）。
 *
 * 为什么是裸键：`registerCustomCSSVariableTheme` 内部走 shiki 的
 * `createCssVariablesTheme({ variablePrefix: formatCSSVariablePrefix("global") })`，
 * 而 shiki 的 `variable(n)` 生成的是 `var(<prefix><n>, <variableDefaults[n]>)` —— 键不带前缀，
 * 带前缀的键会被静默忽略（写错就等于没有兜底）。
 *
 * 值取 GitHub Dark 的语义中性色：正常情况下这些兜底根本不会生效（扩展层每档都会写满
 * `documentElement` 上的实测值，见 `theme-ext/runtime.ts` 的 `writeCodeThemeVariables`），
 * 只有「名字已生效但变量还没写」的极端窗口才会用到，所以只要求「不难看、能读」。
 */
const CODE_THEME_VARIABLE_DEFAULTS: Readonly<Record<string, string>> = {
  foreground: "#c9d1d9",
  // 代码块底色由 ZCode 自己的 CSS 画（`--diffs-bg: var(--color-background)`），
  // 主题侧保持透明语义，免得兜底值把卡片底色盖成一块深灰。
  background: "transparent",
  "token-comment": "#8b949e",
  "token-string": "#a5d6ff",
  "token-keyword": "#ff7b72",
  "token-constant": "#79c0ff",
  "token-function": "#d2a8ff",
  "token-parameter": "#ffa657",
  "token-punctuation": "#c9d1d9",
  "token-link": "#58a6ff",
  "token-string-expression": "#a5d6ff",
  "token-inserted": "#aff5b4",
  "token-deleted": "#ffdcd7",
  "token-changed": "#ffdfb6",
};

let codeThemeVariablesRegistered = false;

/**
 * 注册「读 CSS 变量」的代码主题（幂等，进程内只注册一次）。
 *
 * 必须在这里（主线程、模块级）注册，原因是 `@pierre/diffs` 的主题解析分工：
 * `resolveTheme` 在 worker 里会直接抛 "cannot be called from a worker context"，
 * 主题只能在主线程解析成对象，再随 `resolvedThemes` 送进 worker（`WorkerPoolManager`
 * 在初始化与 `setRenderOptions` 时都会做这件事）。所以只要注册早于 worker 池的第一次
 * 解析，两个 worker 与主线程兜底渲染就都能拿到它。
 *
 * 注册用恒定名：`registerCustomTheme` 对同名重复注册只打一条 `console.error` 然后返回，
 * 按档位起名会注册一堆近似主题；而变量主题的价值恰恰在于「名字不变、变量变」。
 */
export function ensureCodeThemeVariablesRegistered(): void {
  if (codeThemeVariablesRegistered) return;
  codeThemeVariablesRegistered = true;
  registerCustomCSSVariableTheme(CODE_THEME_VARIABLES_NAME, { ...CODE_THEME_VARIABLE_DEFAULTS });
}

/**
 * 围栏代码块 / diff 面板真正使用的主题名：扩展层接管时用变量主题名，否则用设置页选的主题。
 *
 * 两个槽位（light/dark）返回同一个名字是有意的：变量主题的明暗由 CSS 变量决定，
 * 不受 `theme.light` / `theme.dark` 影响（它的 `type` 恒为 `dark`，那是库内部约定，
 * 只影响阴影里的 `color-scheme`，不参与取色）。见 spec §8.4。
 */
function resolveDiffsThemeName(fallback: BundledTheme): string {
  return getCodeThemeVariablesName() ?? fallback;
}

/** diff worker 池初始化参数；主线程兜底渲染与 worker 必须使用同一个引擎选择。 */
export function createDiffsWorkerHighlighterOptions(
  settings: DiffsHighlighterThemeSettings,
): WorkerInitializationRenderOptions {
  // 先注册再给名字：池初始化（`WorkerPoolContextProvider`）会立刻解析这两个名字，
  // 顺序反了就会命中 `resolveTheme: No valid loader for everforest-tokens`。
  ensureCodeThemeVariablesRegistered();
  return {
    theme: {
      light: resolveDiffsThemeName(settings.lightTheme),
      dark: resolveDiffsThemeName(settings.darkTheme),
    },
    // 不同 patch 的逐词差异计算会额外占用主线程；先沿用库默认阈值，
    // 后续可基于慢日志再单独收紧，避免一次改动引入“高亮信息突然消失”的回归。
    lineDiffType: "word-alt",
    maxLineDiffLength: 1_000,
    tokenizeMaxLineLength: 1_000,
    useTokenTransformer: false,
    preferredHighlighter: DIFFS_PREFERRED_HIGHLIGHTER,
  };
}
