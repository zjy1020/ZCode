/**
 * 主题扩展层 —— Everforest 调色板数据。
 *
 * 移植自 DeepSeek Harness 主题插件 `dsh-everforest@1.4.0` 的 `src/palette.js`
 * （MIT，作者 FormalistBlue）。数据来源（上游注释记录）：
 * - sainnhe/everforest `palette.md` @ 85a86eb：6 套背景色阶 + 两套前景/强调色；
 * - Everforest Enchanted `theme.css` @ bdd7ac7：默认配对、`header-*` 颜色、
 *   浅色文档选区修正。
 *
 * 有效值说明：官方浅色 `bg_visual` 三个强度不同，但这里三个浅色强度统一取
 * `#DED8DB`（Enchanted 可见性修正），与上游保持一致。
 *
 * 上游 `scripts/palette.mjs` 是这份数据的生成器；本仓库不引入该脚本，只把
 * 数据搬过来，因此这里是手写维护的常量表——上游改版时按 `UPGRADE.md` 重放。
 */

export const SCHEMES = ["light", "dark"] as const;
export type Scheme = (typeof SCHEMES)[number];

/** 对比强度，从最硬到最软。 */
export const STRENGTHS = ["hard", "medium", "soft"] as const;
export type Strength = (typeof STRENGTHS)[number];

/** 默认配对对齐 Everforest Enchanted：深色用 soft，浅色用 hard。 */
export const DEFAULT_STATE: Readonly<Record<Scheme, Strength>> = Object.freeze({
  light: "hard",
  dark: "soft",
});

/** 全部六个变体，命名 `<scheme>-<strength>`（三个深色在前，与上游顺序一致）。 */
export const VARIANT_NAMES = [
  "dark-hard",
  "dark-medium",
  "dark-soft",
  "light-hard",
  "light-medium",
  "light-soft",
] as const;
export type VariantName = (typeof VARIANT_NAMES)[number];

export type BackgroundRamp = Readonly<{
  bgDim: string;
  bg0: string;
  bg1: string;
  bg2: string;
  bg3: string;
  bg4: string;
  bg5: string;
  bgVisual: string;
  bgRed: string;
  bgYellow: string;
  bgGreen: string;
  bgBlue: string;
  bgPurple: string;
}>;

export type Foreground = Readonly<{
  fg: string;
  red: string;
  orange: string;
  yellow: string;
  green: string;
  aqua: string;
  blue: string;
  purple: string;
  grey0: string;
  grey1: string;
  grey2: string;
  headerRed: string;
  headerOrange: string;
  headerYellow: string;
  headerGreen: string;
  headerAqua: string;
  headerBlue: string;
  headerPurple: string;
}>;

/**
 * 背景色阶 `RAMPS[scheme][strength]`，每套 13 色。
 * `bgDim` 更深一档的代码面，`bg0` 主背景，`bg1`/`bg2`/`bg3` 分层表面，
 * `bg4` hover，`bg5` 边框，`bgVisual`/`bgRed`/`bgYellow`/`bgGreen`/`bgBlue`/`bgPurple`
 * 分别是选区、diff 与高亮底色。
 */
export const RAMPS: Readonly<Record<Scheme, Readonly<Record<Strength, BackgroundRamp>>>> =
  Object.freeze({
    dark: Object.freeze({
      hard: Object.freeze({
        bgDim: "#1E2326",
        bg0: "#272E33",
        bg1: "#2E383C",
        bg2: "#374145",
        bg3: "#414B50",
        bg4: "#495156",
        bg5: "#4F5B58",
        bgVisual: "#4C3743",
        bgRed: "#493B40",
        bgYellow: "#45443C",
        bgGreen: "#3C4841",
        bgBlue: "#384B55",
        bgPurple: "#463F48",
      }),
      medium: Object.freeze({
        bgDim: "#232A2E",
        bg0: "#2D353B",
        bg1: "#343F44",
        bg2: "#3D484D",
        bg3: "#475258",
        bg4: "#4F585E",
        bg5: "#56635F",
        bgVisual: "#543A48",
        bgRed: "#514045",
        bgYellow: "#4D4C43",
        bgGreen: "#425047",
        bgBlue: "#3A515D",
        bgPurple: "#4A444E",
      }),
      soft: Object.freeze({
        bgDim: "#293136",
        bg0: "#333C43",
        bg1: "#3A464C",
        bg2: "#434F55",
        bg3: "#4D5960",
        bg4: "#555F66",
        bg5: "#5D6B66",
        bgVisual: "#5C3F4F",
        bgRed: "#59464C",
        bgYellow: "#55544A",
        bgGreen: "#48584E",
        bgBlue: "#3F5865",
        bgPurple: "#4E4953",
      }),
    }),
    light: Object.freeze({
      hard: Object.freeze({
        bgDim: "#F2EFDF",
        bg0: "#FFFBEF",
        bg1: "#F8F5E4",
        bg2: "#F2EFDF",
        bg3: "#EDEADA",
        bg4: "#E8E5D5",
        bg5: "#BEC5B2",
        bgVisual: "#DED8DB",
        bgRed: "#FFE7DE",
        bgYellow: "#FEF2D5",
        bgGreen: "#F3F5D9",
        bgBlue: "#ECF5ED",
        bgPurple: "#FCECED",
      }),
      medium: Object.freeze({
        bgDim: "#EFEBD4",
        bg0: "#FDF6E3",
        bg1: "#F4F0D9",
        bg2: "#EFEBD4",
        bg3: "#E6E2CC",
        bg4: "#E0DCC7",
        bg5: "#BDC3AF",
        bgVisual: "#DED8DB",
        bgRed: "#FDE3DA",
        bgYellow: "#FAEDCD",
        bgGreen: "#F0F1D2",
        bgBlue: "#E9F0E9",
        bgPurple: "#FAE8E2",
      }),
      soft: Object.freeze({
        bgDim: "#E5DFC5",
        bg0: "#F3EAD3",
        bg1: "#EAE4CA",
        bg2: "#E5DFC5",
        bg3: "#DDD8BE",
        bg4: "#D8D3BA",
        bg5: "#B9C0AB",
        bgVisual: "#DED8DB",
        bgRed: "#FADBD0",
        bgYellow: "#F1E4C5",
        bgGreen: "#E5E6C5",
        bgBlue: "#E1E7DD",
        bgPurple: "#F1DDD4",
      }),
    }),
  });

/** 前景 / 强调 / header 颜色，同一 scheme 的三个强度共用。 */
export const FOREGROUNDS: Readonly<Record<Scheme, Foreground>> = Object.freeze({
  dark: Object.freeze({
    fg: "#D3C6AA",
    red: "#E67E80",
    orange: "#E69875",
    yellow: "#DBBC7F",
    green: "#A7C080",
    aqua: "#83C092",
    blue: "#7FBBB3",
    purple: "#D699B6",
    grey0: "#7A8478",
    grey1: "#859289",
    grey2: "#9DA9A0",
    headerRed: "#DA6362",
    headerOrange: "#D77F48",
    headerYellow: "#BF983D",
    headerGreen: "#899C40",
    headerAqua: "#569D79",
    headerBlue: "#5A93A2",
    headerPurple: "#B87B9D",
  }),
  light: Object.freeze({
    fg: "#5C6A72",
    red: "#F85552",
    orange: "#F57D26",
    yellow: "#DFA000",
    green: "#8DA101",
    aqua: "#35A77C",
    blue: "#3A94C5",
    purple: "#DF69BA",
    grey0: "#A6B0A0",
    grey1: "#939F91",
    grey2: "#829181",
    headerRed: "#F85552",
    headerOrange: "#F88F44",
    headerYellow: "#F3B931",
    headerGreen: "#ABD113",
    headerAqua: "#569D79",
    headerBlue: "#5A93A2",
    headerPurple: "#DD2B8D",
  }),
});

/** 取某个 scheme + strength 的背景色阶。 */
export function rampFor(scheme: Scheme, strength: Strength): BackgroundRamp {
  const schemeRamps = RAMPS[scheme];
  if (!schemeRamps) {
    throw new TypeError(`rampFor: unknown scheme '${scheme}' (expected ${SCHEMES.join(" | ")})`);
  }
  const ramp = schemeRamps[strength];
  if (!ramp) {
    throw new TypeError(
      `rampFor: unknown strength '${strength}' for scheme '${scheme}' (expected ${STRENGTHS.join(" | ")})`,
    );
  }
  return ramp;
}

/** 取某个 scheme 的前景 / 强调 / header 颜色。 */
export function foregroundFor(scheme: Scheme): Foreground {
  const foreground = FOREGROUNDS[scheme];
  if (!foreground) {
    throw new TypeError(`foregroundFor: unknown scheme '${scheme}' (expected ${SCHEMES.join(" | ")})`);
  }
  return foreground;
}

/** 由用户状态解析两个 scheme 的调色板。 */
export type ResolvedPaletteEntry = {
  scheme: Scheme;
  strength: Strength;
  ramp: BackgroundRamp;
  fg: Foreground;
};

export function resolvePalette(
  state: Record<Scheme, Strength> = { ...DEFAULT_STATE },
): Record<Scheme, ResolvedPaletteEntry> {
  return {
    light: {
      scheme: "light",
      strength: state.light,
      ramp: rampFor("light", state.light),
      fg: foregroundFor("light"),
    },
    dark: {
      scheme: "dark",
      strength: state.dark,
      ramp: rampFor("dark", state.dark),
      fg: foregroundFor("dark"),
    },
  };
}
