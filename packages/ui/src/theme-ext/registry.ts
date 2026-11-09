/**
 * 主题扩展层 —— 配色包注册表。
 *
 * 新增一个主题只需三件事：
 * 1. 在 `packs/<id>/` 下建目录，导出 `ColorPack`；
 * 2. 在这里 import 并加进 `EXTERNAL_COLOR_PACKS`；
 * 3. 在 `packages/ui/src/i18n/locales/{zh-CN,en-US}.ts` 补展示名与描述的 key
 *    （可选，缺 key 时会退回 `ColorPack.label` / `ColorPack.description`）。
 *
 * 注册表本身是纯数据 + 纯函数，不碰 DOM，方便在测试里直接断言两个明暗方案的
 * key 集合是否一致。
 */

import type { ColorPack } from "./types.js";
import { everforestColorPack } from "./packs/everforest/index.js";

/** 「不覆盖上游样式」的哨兵 id。 */
export const NATIVE_COLOR_PACK_ID = "native";

const EMPTY_TOKENS: Readonly<Record<string, string>> = Object.freeze({});

/**
 * 上游原生配色。`tokens()` 返回空表——`applyThemePack` 会据此把扩展层
 * 之前写进去的内联变量全部摘掉，从而完整回到 ZCode 自己的 `.theme-zai-*`。
 */
export const nativeColorPack: ColorPack = {
  id: NATIVE_COLOR_PACK_ID,
  label: "Z.ai 原生",
  description: "ZCode 自带的中性黑白配色。",
  variants: [],
  defaultVariantId: "",
  tokens: () => EMPTY_TOKENS,
  previewColors: (scheme) =>
    scheme === "light"
      ? ["#f8f8f8", "#ffffff", "#f0f0f0", "#0d0d0d", "#0b7fff", "#1e8a3e"]
      : ["#161616", "#202020", "#2b2b2b", "#d4d4d4", "#4099ff", "#46bf72"],
};

/** 除原生配色外，随包提供的主题。 */
export const EXTERNAL_COLOR_PACKS: readonly ColorPack[] = [everforestColorPack];

/** 设置页下拉框用的完整列表：原生在前，其余按注册顺序。 */
export const COLOR_PACKS: readonly ColorPack[] = [nativeColorPack, ...EXTERNAL_COLOR_PACKS];

export function listColorPacks(): readonly ColorPack[] {
  return COLOR_PACKS;
}

/**
 * 按 id 取包。未知 id 回退到原生配色而不是抛错——用户可能从旧版本带过来一个
 * 已经被删掉的主题 id，此时让界面回到原生配色比白屏好。
 */
export function getColorPack(id: string): ColorPack {
  return COLOR_PACKS.find((pack) => pack.id === id) ?? nativeColorPack;
}

/** 变体 id 的归一：包没定义这个变体就回退到包的默认变体。 */
export function resolveColorPackVariantId(pack: ColorPack, variantId: string): string {
  if (pack.variants.some((variant) => variant.id === variantId)) {
    return variantId;
  }
  return pack.defaultVariantId;
}
