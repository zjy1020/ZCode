import { useSyncExternalStore } from "react";
import { getCodeThemeRevision, subscribeCodeTheme } from "@/lib/codeThemeBridge.js";

/**
 * 订阅「代码主题覆盖修订号」。
 *
 * 返回 `everforest:dark:soft` 这类字符串（未接管时为 `null`），值变即代表配色变了。
 * 用途是两件事，缺一不可：
 *
 * 1. 把修订号拼进高亮缓存键：`@pierre/diffs` 按 `file.cacheKey` 复用已渲染结果，
 *    key 不含修订号时切档会继续显示旧高亮；
 * 2. 让已挂载的代码块重渲染：主题名与变量都是外部状态，React 不知道它们变了。
 *
 * 第三个参数是服务端快照：ZCode 桌面端 SSR 不渲染代码块，给 `null` 即可。
 */
export function useCodeThemeRevision(): string | null {
  return useSyncExternalStore(subscribeCodeTheme, getCodeThemeRevision, () => null);
}
