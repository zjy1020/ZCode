/**
 * Everforest 代码主题 —— 由上游调色板**现算**的 shiki 主题对象。
 *
 * 为什么是纯函数而不是一份写死的 JSON：上游 Everforest 的颜色是「明暗 × 对比强度」
 * 六档的函数（`packs/everforest/palette.ts`）。代码块要跟随档位，就必须跟着算；
 * 写死六份 JSON 等于把调色板的推导链复制六遍，改一处要改六处，而且会绕过
 * `color.ts` 的对比度守卫。
 *
 * 两条硬约束：
 *
 * 1. **`name` 是 shiki 缓存键的一部分**。`lib/shikiHighlighter.ts` 用它拼 highlighter
 *    缓存键（`` `${name}:${language}` ``）与 token 缓存键
 *    （`` `${name}:${language}:${长度}:${首100字符}:${末100字符}` ``）。所以它必须包含
 *    scheme + strength，否则切档之后会命中上一档的高亮结果。
 * 2. **`colors.background` 必须透明**（`#00000000`）。代码块的底色一直由 CSS 画
 *    （`components/ai-elements/code-block.tsx` 设 `--diffs-bg: var(--color-card)`），
 *    主题自带的不透明背景会盖住卡片底色。但对比度守卫得按**真实底色**算，
 *    所以下面用 `--color-card` 与 `--color-background` 两个 token 当判定面。
 *
 * 色相来源（不是拍脑袋编的）：本移植的上游插件 `dsh-everforest@1.4.0` 的 `--shiki-*`
 * 映射（`src/tokens.js:779-789`）就是权威色相表 —— comment / punctuation → grey1、
 * keyword → blue、string / string-expression → yellow、constant → purple、
 * function → green、parameter → orange、link → headerBlue、diff 增删改 → green / red / orange。
 * 本表逐条沿用；上游 shiki 槽没单列的 type/class、variable/property、tag、regexp 按
 * 「共用同一个 `@pierre/diffs` 变量就必须共用色相」收拢（见 `CodeScopeRole.slot` 的注释），
 * 而不是另外编一套颜色。`operator` 用该档位的主文字色：上游没有它的独立槽，运算符贴着
 * 正文墨色是最不喧宾夺主的近似。
 *
 * 注意：上游 `--shiki-*` 是一条**CSS 变量**路径（只对使用 shiki 的 `css-variables`
 * 主题的宿主生效），本文件同时提供两条路径，且共用同一套语义槽与同一个对比度守卫：
 *
 * 1. **shiki 主题对象**（`everforestCodeTheme`）：交给 `lib/shikiHighlighter.ts`。
 *    每条 scope 的颜色写成 `var(--diffs-token-<槽>, <守卫后的 hex>)`——变量优先、
 *    hex 兜底。这样 shiki 侧的 token 也随内联变量走，切档不需要重新注册主题
 *    （实测 shiki 3.23 会把 `var(...)` 原样放进 token 的 color，见 spec §8.2）。
 * 2. **@pierre/diffs 的 CSS 变量表**（`everforestCodeThemeVariables`）：交给
 *    `theme-ext/runtime.ts` 写进 `documentElement` 的内联变量。围栏代码块由
 *    `@pierre/diffs` 渲染，它只认主题**名字** + CSS 变量（见 spec §8）。
 *
 * 两条路径的变量前缀都是 `--diffs-`：`@pierre/diffs` 自己注册的 CSS 变量主题用的就是
 * 这个前缀（`dist/utils/formatCSSVariablePrefix.js`），我们只是把值填进去。
 */

import { guardTo } from "./color.js";
import {
  foregroundFor,
  rampFor,
  type Foreground,
  type Strength,
} from "./packs/everforest/palette.js";
import { everforestColorPack } from "./packs/everforest/index.js";
import { everforestZCodeTokens } from "./packs/everforest/tokens.js";
import type { ColorScheme } from "./types.js";

/** 承载文字的代码颜色最低对比度。代码是小字号文本，不降到 Markdown 角色表那种 3:1。 */
const CODE_CONTRAST_TARGET = 4.5;

/** 主题里的透明背景；代码块底色由 CSS 的 `--diffs-bg` 画（见文件头注释）。 */
const TRANSPARENT_BACKGROUND = "#00000000";

/** 一个语义槽：`role` 只用于自检与文档，真正生效的是 `scopes`。 */
interface CodeScopeRole {
  /** 角色名（冒烟脚本与文档用它核对覆盖清单）。 */
  readonly role: string;
  /** TextMate scope 列表。 */
  readonly scopes: readonly string[];
  /**
   * 取上调色板的哪个槽；`ink` 表示「该档位的主文字色」。
   *
   * **同一个 `diffsVariable` 的角色必须写同一个 `slot`**：`@pierre/diffs` 的一个变量
   * 只能有一个值，而 shiki 侧的 `var(--diffs-<槽>, hex)` 在变量生效时读的就是那个值，
   * 兜底 hex 只在变量缺失时才露面。两处不一致就会出现「看着是紫的、实际渲染成红的」
   * 这类只能靠肉眼发现的问题，所以收拢后的色相以变量为准（冒烟脚本 7 会逐个核对）。
   */
  readonly slot: keyof Foreground | "ink";
  /**
   * `@pierre/diffs` 的 CSS 变量名（去掉 `--diffs-` 前缀的裸名），形如 `token-keyword`。
   *
   * 为什么必须收拢：`@pierre/diffs` 只暴露 12 个 token 槽 + `foreground`/`background`
   * （`dist/worker/worker.js` 的 CSS 变量主题），比本表的语义槽少。多个角色共用一个
   * 变量是必然的（例如 `type` 与 `function` 都落到 `token-function`，`regexp` 与 `tag`
   * 都落到 `token-string-expression`）。缺省表示该角色在这条路径上没有对应槽
   * （`invalid` 就是这种），此时 shiki 侧仍用守卫后的 hex。
   */
  readonly diffsVariable?: string;
  /** 额外字体样式（目前只有注释用斜体）。 */
  readonly fontStyle?: string;
}

/**
 * scope → 调色板语义槽。
 *
 * 顺序有讲究：TextMate 按 scope **具体度**匹配，越具体的条目胜出，所以
 * `punctuation`（灰色）在前、`punctuation.definition.tag`（标签色）在后不会互相打架；
 * 反过来 `variable`（红）不会吃掉 `variable.other.property`（属性色）。
 */
const CODE_SCOPE_ROLES: readonly CodeScopeRole[] = [
  {
    role: "comment",
    slot: "grey1",
    diffsVariable: "token-comment",
    fontStyle: "italic",
    scopes: ["comment", "punctuation.definition.comment", "string.comment"],
  },
  {
    role: "keyword",
    slot: "blue",
    diffsVariable: "token-keyword",
    scopes: [
      "keyword",
      "keyword.control",
      "keyword.other",
      "storage",
      "storage.type",
      "storage.modifier",
    ],
  },
  {
    role: "string",
    slot: "yellow",
    diffsVariable: "token-string",
    scopes: [
      "string",
      "string.quoted",
      "string.template",
      "string.interpolated",
      "punctuation.definition.string",
    ],
  },
  {
    role: "number",
    slot: "purple",
    diffsVariable: "token-constant",
    scopes: [
      "constant.numeric",
      "constant.language",
      "constant.character",
      "constant.other",
      "support.constant",
      "keyword.other.unit",
      // 裸 `constant` 是上面几条的父 scope：TextMate 选择器按点分前缀匹配，
      // 放一条兜底可以接住语法里没细分的常量（例如 `constant.color`）。
      "constant",
    ],
  },
  {
    role: "function",
    slot: "green",
    diffsVariable: "token-function",
    scopes: [
      "entity.name.function",
      "entity.name.function.member",
      "support.function",
      "variable.function",
      "meta.function-call.generic",
    ],
  },
  {
    role: "type",
    // 与 `function` 共用 `--diffs-token-function`，所以色相必须一致（上游把
    // `entity.name.type` / `entity.other.inherited-class` 也映射到同一个变量）。
    slot: "green",
    diffsVariable: "token-function",
    scopes: [
      "entity.name.type",
      "entity.name.class",
      "entity.name.struct",
      "entity.name.type.class",
      "entity.name.type.interface",
      "entity.other.inherited-class",
      "support.type",
      "support.class",
      "storage.type.primitive",
    ],
  },
  {
    role: "variable",
    // 与 `number` / `property` 共用 `--diffs-token-constant`：上游 shiki 槽把
    // `variable.other.object` / `variable.other.class` / `meta.property-name` 与
    // 数字字面量归在同一个变量下，色相只能取一个。
    slot: "purple",
    diffsVariable: "token-constant",
    scopes: [
      "variable",
      "variable.other",
      "variable.other.readwrite",
      "variable.language",
      "variable.parameter",
    ],
  },
  {
    role: "property",
    slot: "purple",
    diffsVariable: "token-constant",
    scopes: [
      "variable.other.property",
      "variable.other.object.property",
      "support.variable.property",
      "meta.object-literal.key",
      "variable.other.enummember",
    ],
  },
  {
    role: "operator",
    slot: "ink",
    diffsVariable: "foreground",
    scopes: [
      "keyword.operator",
      "keyword.operator.assignment",
      "keyword.operator.arithmetic",
      "keyword.operator.logical",
    ],
  },
  {
    role: "punctuation",
    slot: "grey1",
    diffsVariable: "token-punctuation",
    scopes: [
      "punctuation",
      "punctuation.separator",
      "punctuation.terminator",
      "punctuation.section",
      "meta.brace",
    ],
  },
  {
    role: "tag",
    // 与 `regexp` 共用 `--diffs-token-string-expression`（上游把 `entity.name.tag`、
    // `string.quoted`、`string.regexp` 都收在它下面，色相同样只能取一个）。
    slot: "yellow",
    diffsVariable: "token-string-expression",
    scopes: ["entity.name.tag", "meta.tag", "support.class.component", "punctuation.definition.tag"],
  },
  {
    role: "attribute",
    slot: "orange",
    diffsVariable: "token-parameter",
    scopes: ["entity.other.attribute-name", "meta.attribute", "support.type.property-name"],
  },
  {
    role: "regexp",
    slot: "yellow",
    diffsVariable: "token-string-expression",
    scopes: ["string.regexp", "constant.regexp", "string.regexp.character-class"],
  },
  {
    role: "link",
    slot: "headerBlue",
    diffsVariable: "token-link",
    scopes: ["markup.underline.link", "string.other.link", "meta.link", "markup.underline"],
  },
  {
    role: "diffInserted",
    slot: "green",
    diffsVariable: "token-inserted",
    scopes: ["markup.inserted", "markup.inserted.diff", "meta.diff.header.to-file"],
  },
  {
    role: "diffDeleted",
    slot: "red",
    diffsVariable: "token-deleted",
    scopes: ["markup.deleted", "markup.deleted.diff", "meta.diff.header.from-file"],
  },
  {
    role: "diffChanged",
    slot: "orange",
    diffsVariable: "token-changed",
    scopes: ["markup.changed", "markup.changed.diff", "meta.diff.range"],
  },
  // `@pierre/diffs` 没有 invalid 槽（它的 CSS 变量主题里没有对应条目），这条只在
  // shiki 侧生效，颜色仍走守卫后的 hex。
  { role: "invalid", slot: "headerRed", scopes: ["invalid", "invalid.illegal"] },
];

export interface EverforestCodeTheme {
  /**
   * shiki 主题名，形如 `everforest-dark-soft`。
   *
   * 同时是缓存键的一部分（见文件头注释），所以必须随明暗与档位变化。
   */
  readonly name: string;
  /** shiki 的主题注册对象（`name` / `type` / `colors` / `settings`）。 */
  readonly theme: Record<string, unknown>;
}

/**
 * 该配色包是否提供专属代码主题。
 *
 * 设置页用它决定是否显示「代码配色跟随主题」说明，`runtime.ts` 用它决定 provider
 * 是否返回覆盖——两处共用同一个判断，避免出现「说明显示了但代码块没跟随」。
 */
export function supportsEverforestCodeTheme(packId: string): boolean {
  return packId === everforestColorPack.id;
}

/** 该档位下逐个语义槽的可用颜色：`ink` 是主文字色，`colorFor` 按槽取守卫后的 hex。 */
interface CodeThemeColors {
  readonly ink: string;
  readonly colorFor: (slot: CodeScopeRole["slot"]) => string;
}

/**
 * 算出该「明暗 + 档位」下每个语义槽的**实际 hex**（已过对比度守卫）。
 *
 * 两条路径共用它：shiki 主题把它当 `var(...)` 的兜底值，`@pierre/diffs` 的变量表把它
 * 当变量值本身。守卫目标 4.5:1，判定面是代码块可能落到的全部底面。
 */
function resolveCodeColors(scheme: ColorScheme, strength: Strength): CodeThemeColors {
  const fg = foregroundFor(scheme);
  const ramp = rampFor(scheme, strength);
  const tokens = everforestZCodeTokens(scheme, strength);

  // 代码块可能落到的**全部**面：卡片（`--diffs-bg`）与画布。`meetsContrast` 的语义
  // 就是「每一个背景都达标」，所以这里给两个面，而不是只给最坏的那个。
  const surfaces = [tokens["--color-card"] ?? ramp.bg2, tokens["--color-background"] ?? ramp.bg0];

  // 朝纯黑/纯白混合：保住色相，只压亮度。浅色主题下 Everforest 的黄（#DFA000）与紫在
  // 奶油色画布上到不了 4.5:1，硬上会糊成一片；深色主题下则是灰阶不够亮。
  const extreme = scheme === "light" ? "#000000" : "#FFFFFF";
  const colorFor = (slot: CodeScopeRole["slot"]): string =>
    guardTo(slot === "ink" ? fg.fg : fg[slot], surfaces, CODE_CONTRAST_TARGET, extreme);

  return { ink: colorFor("ink"), colorFor };
}

/**
 * 生成指定「明暗 + 对比强度」的 Everforest 代码主题（shiki 主题对象）。
 *
 * 每个 scope 的颜色是 `var(--diffs-token-<槽>, <守卫后的 hex>)`：变量优先，hex 兜底。
 * shiki 3.23 会把这类取值原样放进 token 的 `color`（实测见 spec §8.2），于是 shiki 这条
 * 路径与 `@pierre/diffs` 那条路径读的是**同一批 CSS 变量**，配色只有一处来源。
 *
 * @param scheme 明暗；会写进主题的 `type` 与 `name`。
 * @param strength 对比强度；会写进 `name`（缓存键）并决定背景阶。
 */
export function everforestCodeTheme(
  scheme: ColorScheme,
  strength: Strength,
): EverforestCodeTheme {
  const { ink, colorFor } = resolveCodeColors(scheme, strength);
  const name = `everforest-${scheme}-${strength}`;

  return {
    name,
    theme: {
      name,
      type: scheme,
      colors: {
        background: TRANSPARENT_BACKGROUND,
        foreground: ink,
        "editor.background": TRANSPARENT_BACKGROUND,
        "editor.foreground": ink,
      },
      settings: [
        // 第一条无 scope 的条目是整棵语法树的兜底墨色/底色（shiki 的约定）。
        { settings: { background: TRANSPARENT_BACKGROUND, foreground: ink } },
        ...CODE_SCOPE_ROLES.map((entry) => {
          const fallback = colorFor(entry.slot);
          return {
            scope: [...entry.scopes],
            settings: {
              foreground:
                entry.diffsVariable === undefined
                  ? fallback
                  : `var(--diffs-${entry.diffsVariable}, ${fallback})`,
              ...(entry.fontStyle === undefined ? {} : { fontStyle: entry.fontStyle }),
            },
          };
        }),
      ],
    },
  };
}

/**
 * 生成该「明暗 + 对比强度」下的 `--diffs-*` 内联变量表。
 *
 * 变量命名与取值都受 `@pierre/diffs` 约束（不要凭直觉加名字，加了也不会有人读）：
 *
 * - token 槽只有 12 个 + `foreground` / `background`（`dist/worker/worker.js` 里的
 *   CSS 变量主题），本表把 18 个语义槽**收拢**映射上去（见 `diffsVariable`）。
 * - diff 行底纹必须写 `-color-override` 变量：`@pierre/diffs` 的链是
 *   `--diffs-addition-base: var(--diffs-addition-color-override, light-dark(...))`，
 *   而主题自己给的 `--diffs-*addition-color` 对 CSS 变量主题来说是占位色（`#00000011`
 *   这类 sentinel），只有 override 变量能既保住绿/红/蓝、又跟着档位走（spec §8.4）。
 *
 * 值全部是守卫后的 hex（底纹三项除外：它们是背景混合的原料，不承载文字，用上游原色）。
 */
export function everforestCodeThemeVariables(
  scheme: ColorScheme,
  strength: Strength,
): Readonly<Record<string, string>> {
  const fg = foregroundFor(scheme);
  const { ink, colorFor } = resolveCodeColors(scheme, strength);
  const variables: Record<string, string> = {
    "--diffs-foreground": ink,
    // 代码块底色由 ZCode 自己的 CSS 画（`--diffs-bg: var(--color-background)`），
    // 主题侧保持透明语义，免得阴影里的 `light-dark()` 派生色把卡片底色盖掉。
    "--diffs-background": TRANSPARENT_BACKGROUND,
  };

  for (const entry of CODE_SCOPE_ROLES) {
    if (entry.diffsVariable === undefined) continue;
    variables[`--diffs-${entry.diffsVariable}`] = colorFor(entry.slot);
  }

  variables["--diffs-addition-color-override"] = fg.green;
  variables["--diffs-deletion-color-override"] = fg.red;
  variables["--diffs-modified-color-override"] = fg.blue;

  return variables;
}
