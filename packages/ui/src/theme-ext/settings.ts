/**
 * 主题扩展层 —— 设置的持久化。
 *
 * 存储键与 ZCode 自己的 `zcode-theme` / `zcode-ui-font-size-px` **刻意分开**：
 * 扩展层被移除或上游升级时，只需删掉 `zcode-theme-ext/v1` 这一个键就能完全还原，
 * 不会污染上游已有的用户设置。
 *
 * 容错策略照搬上游 `dsh-everforest` 的 `src/state.js`：读到的任何异常值都回退到
 * 默认值，绝不向上抛错——设置文件损坏不应该让整个界面打不开。
 */

import { NATIVE_COLOR_PACK_ID } from "./registry.js";
import type { ThemeExtFontSettings, ThemeExtSettings, ThemeExtSettingsPatch } from "./types.js";

export const THEME_EXT_STORAGE_KEY = "zcode-theme-ext/v1";
export const THEME_EXT_SETTINGS_VERSION = 1;

export const DEFAULT_THEME_EXT_FONTS: ThemeExtFontSettings = Object.freeze({
  uiFontFamily: "",
  codeFontFamily: "",
});

export const DEFAULT_THEME_EXT_SETTINGS: ThemeExtSettings = Object.freeze({
  colorPackId: NATIVE_COLOR_PACK_ID,
  colorPackVariantId: "",
  fonts: DEFAULT_THEME_EXT_FONTS,
});

/** 扩展层设置变更时派发的同文档事件名（跨窗口另走 storage 事件）。 */
export const THEME_EXT_CHANGE_EVENT = "zcode-theme-ext:change";

type PersistedShape = ThemeExtSettings & { version: number };

function readStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // 隐私模式 / 被策略禁用时会直接抛错。
    return null;
  }
}

function normalizeFontSettings(raw: unknown): ThemeExtFontSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_THEME_EXT_FONTS;
  const record = raw as Record<string, unknown>;
  return {
    uiFontFamily: typeof record.uiFontFamily === "string" ? record.uiFontFamily : "",
    codeFontFamily: typeof record.codeFontFamily === "string" ? record.codeFontFamily : "",
  };
}

/** 归一化任意输入；未知字段被丢弃，缺失字段取默认值。 */
export function normalizeThemeExtSettings(raw: unknown): ThemeExtSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_THEME_EXT_SETTINGS;
  const record = raw as Record<string, unknown>;
  return {
    colorPackId:
      typeof record.colorPackId === "string" && record.colorPackId.length > 0
        ? record.colorPackId
        : DEFAULT_THEME_EXT_SETTINGS.colorPackId,
    colorPackVariantId:
      typeof record.colorPackVariantId === "string" ? record.colorPackVariantId : "",
    fonts: normalizeFontSettings(record.fonts),
  };
}

/** 读取扩展层设置；任何异常都返回默认值。 */
export function loadThemeExtSettings(): ThemeExtSettings {
  const storage = readStorage();
  if (!storage) return DEFAULT_THEME_EXT_SETTINGS;
  try {
    const raw = storage.getItem(THEME_EXT_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME_EXT_SETTINGS;
    return normalizeThemeExtSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_THEME_EXT_SETTINGS;
  }
}

/** 写入扩展层设置；写失败时静默忽略（不影响当前会话的显示）。 */
export function persistThemeExtSettings(settings: ThemeExtSettings): void {
  const storage = readStorage();
  if (!storage) return;
  const payload: PersistedShape = { version: THEME_EXT_SETTINGS_VERSION, ...settings };
  try {
    storage.setItem(THEME_EXT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 配额满或被禁用：保留内存中的状态即可。
  }
}

/** 合并式更新：只覆盖传入的字段。 */
export function mergeThemeExtSettings(
  current: ThemeExtSettings,
  patch: ThemeExtSettingsPatch,
): ThemeExtSettings {
  return normalizeThemeExtSettings({
    ...current,
    ...patch,
    fonts: { ...current.fonts, ...patch.fonts },
  });
}

/** 同文档内的变更通知。 */
export function emitThemeExtChange(settings: ThemeExtSettings): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  try {
    window.dispatchEvent(new CustomEvent(THEME_EXT_CHANGE_EVENT, { detail: settings }));
  } catch {
    // 非浏览器环境（如 SSR / 测试）忽略。
  }
}

/** 订阅同文档变更事件；返回取消订阅函数。 */
export function subscribeThemeExtChange(listener: (settings: ThemeExtSettings) => void): () => void {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
    return () => {};
  }
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<ThemeExtSettings>).detail;
    listener(normalizeThemeExtSettings(detail));
  };
  window.addEventListener(THEME_EXT_CHANGE_EVENT, handler);
  return () => window.removeEventListener(THEME_EXT_CHANGE_EVENT, handler);
}

/**
 * 订阅跨文档变更。
 *
 * 说明：`storage` 事件只在**其它**同源文档写同一个键时触发，本窗口自己写不会触发；
 * 因此本窗口的刷新走 `subscribeThemeExtChange`。Electron 里不同 BrowserWindow 是否
 * 共享同源 localStorage 取决于分区策略，不共享时由宿主通过
 * `setThemeExtSettings()` 显式下发（见 `UPGRADE.md` 的「跨窗口同步」一节）。
 */
export function subscribeThemeExtStorage(listener: () => void): () => void {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
    return () => {};
  }
  const handler = (event: StorageEvent) => {
    if (event.key !== null && event.key !== THEME_EXT_STORAGE_KEY) return;
    listener();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
