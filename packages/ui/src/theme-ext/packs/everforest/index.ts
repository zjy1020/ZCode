/**
 * 主题扩展层 —— Everforest 主题包定义。
 *
 * 移植自 DeepSeek Harness 主题插件 `dsh-everforest@1.4.0`
 * （MIT，作者 FormalistBlue）。上游的 `src/tokens.js` 是给 DSH 的 `--dsw-*`
 * 命名空间做的映射，本目录把它换成了 ZCode 的 `--color-*` 命名空间，
 * 并去掉了上游依赖宿主服务（settings 服务 / webserver 注入 / plugin context）的部分，
 * 只保留「调色板 → CSS 变量表」这段纯函数。
 */

import type { ColorPack, ColorScheme } from "../../types.js";
import { DEFAULT_STATE, foregroundFor, rampFor, STRENGTHS, type Strength } from "./palette.js";
import { everforestMarkdownRoles, everforestZCodeTokens } from "./tokens.js";

/** 变体 id 与 Everforest 的对比强度一一对应；`auto` 表示按上游默认配对。 */
const AUTO_VARIANT_ID = "auto";

/** 上游默认配对：浅色用 hard、深色用 soft（对齐 Everforest Enchanted）。 */
const AUTO_LABEL = "跟随默认";

const VARIANTS = [
  { id: AUTO_VARIANT_ID, label: AUTO_LABEL },
  { id: "soft", label: "柔和" },
  { id: "medium", label: "中等" },
  { id: "hard", label: "强烈" },
] as const;

/** 把变体 id 解析成真正的对比强度；未知 id 一律回退到上游默认配对。 */
export function resolveEverforestStrength(scheme: ColorScheme, variantId: string): Strength {
  const matched = STRENGTHS.find((strength) => strength === variantId);
  return matched ?? DEFAULT_STATE[scheme];
}

/** 某个变体在某个明暗方案下最终生效的强度（`auto` 会解析成 hard/soft）。 */
export function everforestEffectiveStrength(
  scheme: ColorScheme,
  variantId: string,
): Strength {
  return resolveEverforestStrength(scheme, variantId);
}

export const everforestColorPack: ColorPack = {
  id: "everforest",
  label: "Everforest",
  description: "暖调灰绿配色，六档背景强度（浅色 / 深色 × 柔和 / 中等 / 强烈）。",
  variants: VARIANTS,
  defaultVariantId: AUTO_VARIANT_ID,
  effectiveVariantId: (scheme, variantId) => resolveEverforestStrength(scheme, variantId),
  tokens: (scheme, variantId) => everforestZCodeTokens(scheme, resolveEverforestStrength(scheme, variantId)),
  previewColors: (scheme, variantId) => {
    const strength = resolveEverforestStrength(scheme, variantId);
    const ramp = rampFor(scheme, strength);
    const fg = foregroundFor(scheme);
    return [ramp.bg0, ramp.bg1, ramp.bg2, fg.fg, fg.aqua, fg.blue, fg.yellow, fg.red, fg.purple];
  },
  markdownRoles: (scheme, variantId) =>
    everforestMarkdownRoles(scheme, resolveEverforestStrength(scheme, variantId)),
  /**
   * 「对比强度」选择器的预览条。
   *
   * 必须是**整条中性色阶**（bg0 → bg5），不能只挑几格：四档真正的差别是整条
   * 色阶一起变深变暖，单看某两格几乎一样。也别把强调色混进来——强调色在同一
   * 明暗方案下四档完全相同（`FOREGROUNDS` 按 scheme 共享），混进来只会让四张卡
   * 看起来更像，正好把要传达的差别掩盖掉。
   */
  variantPreview: (scheme, variantId) => {
    const strength = resolveEverforestStrength(scheme, variantId);
    const ramp = rampFor(scheme, strength);
    return [ramp.bg0, ramp.bg1, ramp.bg2, ramp.bg3, ramp.bg4, ramp.bg5];
  },
};
