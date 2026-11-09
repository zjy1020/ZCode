/**
 * 主题扩展层（theme extension layer）对外入口。
 *
 * 这一层是**自包含**的：只依赖 DOM 与自身的纯函数，不 import 任何 `@zcode/*`
 * 运行时模块。它挂到 ZCode 上的方式只有两处，都记在同目录的 `UPGRADE.md`：
 *
 * 1. `packages/ui/src/index.ts` 里的 `installThemeExt()` —— 装运行时（走本文件）；
 * 2. `settingsCodePreview.tsx` 里的设置项 —— 提供界面。
 *
 * 只要这两处的调用签名不变，上游升级后把整个 `theme-ext/` 目录原样拷回即可。
 *
 * 本文件只暴露「纯 & DOM」的那部分 API（本目录不引入 React）。两个 React 绑定模块
 * —— `useThemeExt.ts`（订阅 hook）与 `FontFamilyPicker.tsx`（字体选择器）—— 由唯一的
 * 设置界面 `settingsCodePreview.tsx` 直接引用；它们不进这里，是为了让本入口保持
 * 无 React 依赖，任何窗口/宿主都能安全导入。
 */

export type {
  AppliedThemeSnapshot,
  ColorPack,
  ColorPackVariant,
  ColorScheme,
  ThemeExtFontSettings,
  ThemeExtSettings,
} from "./types.js";

export {
  COLOR_PACKS,
  EXTERNAL_COLOR_PACKS,
  NATIVE_COLOR_PACK_ID,
  getColorPack,
  listColorPacks,
  nativeColorPack,
  resolveColorPackVariantId,
} from "./registry.js";

export {
  DEFAULT_THEME_EXT_SETTINGS,
  THEME_EXT_CHANGE_EVENT,
  THEME_EXT_STORAGE_KEY,
  loadThemeExtSettings,
  normalizeThemeExtSettings,
} from "./settings.js";

export {
  applyThemeExt,
  getThemeExtSnapshot,
  installThemeExt,
  isThemeExtInstalled,
  previewColorPackTokens,
  readColorScheme,
  reapplyThemeExt,
  setThemeExtSettings,
  subscribeThemeExtSnapshot,
  THEME_EXT_ROOT_ATTRIBUTE,
  uninstallThemeExt,
} from "./runtime.js";

export { composeFontFamily, normalizeFontFamilyInput } from "./fonts.js";

export {
  buildMarkdownStylesheet,
  MARKDOWN_ROLE_KEYS,
  MARKDOWN_SCOPE_CLASS,
  MARKDOWN_STYLESHEET_ID,
  MARKDOWN_TOKEN_PREFIX,
  markdownRoleTokens,
  markdownRoleVariableKey,
  providedMarkdownRoles,
  type MarkdownRoleKey,
  type MarkdownRoles,
} from "./markdown.js";

export { everforestColorPack } from "./packs/everforest/index.js";
export {
  assertSameTokenKeys,
  everforestMarkdownRoles,
  everforestTokenCount,
} from "./packs/everforest/tokens.js";
