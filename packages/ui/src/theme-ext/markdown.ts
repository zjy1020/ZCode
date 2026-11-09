/**
 * 主题扩展层 —— Markdown 富文本着色。
 *
 * 为什么需要单独一层：
 * ZCode 的 `--color-*` token 表里没有「标题色 / 强调色 / 行内代码色」这类角色，
 * Markdown 正文的标题、粗体、行内代码、链接全部继承 `--color-foreground`，所以
 * 只覆盖 token 的话，换主题后正文是一片同色的灰绿——这正是上游 dsh-everforest
 * 单独做一套 Markdown 角色的原因。
 *
 * 工作方式（与 token 覆盖同构，但要额外注入一张静态样式表）：
 * 1. 主题包按 `markdownRoles(scheme, variantId)` 产出「角色键 → 颜色」；
 * 2. `runtime.ts` 把这些颜色写成 `document.documentElement` 上的内联自定义属性
 *    （`--zcode-md-*`）；
 * 3. 本模块提供一张**静态**样式表，里面所有颜色值都写成 `var(--zcode-md-*)`；
 * 4. 只有当主题包提供 roles 时才把这张样式表注入 `<head>`。
 *
 * 为什么样式表不能常驻：CSS 自定义属性未定义时，`color: var(--x)` 会在
 * **计算值阶段**判定为非法并回退成 `inherit`（而不是留空）。常驻会让原生主题下的
 * Markdown 全部塌成正文色，而且没有任何报错——所以注入/移除必须与主题包同生命周期。
 *
 * 作用域：样式表以 `.zcode-md` 为前缀。这个 class 由上层加到 Streamdown 的容器上
 * （见 `components/ai-elements/message.tsx` 的 `responseClassName`），
 * 因此不会影响设置页、插件 UI 等其他地方的 Markdown。
 */

/** 加到 Markdown 容器上的作用域 class。 */
export const MARKDOWN_SCOPE_CLASS = "zcode-md";

/** Markdown 角色自定义属性的前缀。 */
export const MARKDOWN_TOKEN_PREFIX = "--zcode-md-";

/** 注入的 `<style>` 元素的 id，用于幂等注入与卸载。 */
export const MARKDOWN_STYLESHEET_ID = "zcode-theme-ext-markdown";

/**
 * 全部角色键。
 *
 * 顺序即样式表里的书写顺序，也是自检时比对的顺序。
 * 新增角色时**必须**同步 `buildMarkdownStylesheet()`，否则自检会报「有键没被用到」。
 */
export const MARKDOWN_ROLE_KEYS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "emphasis",
  "faint",
  "inlineCode",
  "link",
  "marker",
  "quote",
  "quoteBg",
  "hr",
  "band",
  "zebra",
  "tableHover",
  "check",
  "checkInk",
  "selection",
] as const;

export type MarkdownRoleKey = (typeof MARKDOWN_ROLE_KEYS)[number];

/** 「角色键 → 颜色」表。主题包只要覆盖其中的一部分，缺的角色就沿用原生表现。 */
export type MarkdownRoles = Readonly<Partial<Record<MarkdownRoleKey, string>>>;

/** `inlineCode` → `--zcode-md-inline-code`。 */
export function markdownRoleVariableKey(role: string): string {
  const kebab = role.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return `${MARKDOWN_TOKEN_PREFIX}${kebab}`;
}

/** `var(--zcode-md-inline-code)`，供样式表拼字符串。 */
function roleVariable(role: MarkdownRoleKey): string {
  return `var(${markdownRoleVariableKey(role)})`;
}

/**
 * 把角色表展开成「CSS 自定义属性名 → 值」，交给 `runtime.ts` 写成内联样式。
 *
 * 只会输出 `MARKDOWN_ROLE_KEYS` 里认识的键：主题包是外部数据，多出来的键写进
 * 内联样式只会污染根元素，而且卸载时还得额外清理。
 */
export function markdownRoleTokens(roles: MarkdownRoles): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const role of MARKDOWN_ROLE_KEYS) {
    const value = roles[role];
    if (typeof value === "string" && value.length > 0) {
      tokens[markdownRoleVariableKey(role)] = value;
    }
  }
  return tokens;
}

/** 角色表里实际提供了哪些键（自检用：样式表用到的角色是否有值）。 */
export function providedMarkdownRoles(roles: MarkdownRoles): MarkdownRoleKey[] {
  return MARKDOWN_ROLE_KEYS.filter((role) => {
    const value = roles[role];
    return typeof value === "string" && value.length > 0;
  });
}

/**
 * 静态样式表。
 *
 * 选择器用「作用域 class + 元素/属性」两级，特异性 (0,1,1) 以上，
 * 足以压过 ZCode 自己的单类名工具类（如标题上的 `text-2xl`、行内代码上的
 * `bg-markdown-inline-code/50`）。刻意**不用** `:where()` 包外层，否则特异性归零。
 */
export function buildMarkdownStylesheet(): string {
  return `/* 主题扩展层：Markdown 富文本着色（由主题包提供角色色，卸载时整张移除） */
.${MARKDOWN_SCOPE_CLASS} h1,
.${MARKDOWN_SCOPE_CLASS} [data-streamdown="heading-1"] { color: ${roleVariable("h1")}; }
.${MARKDOWN_SCOPE_CLASS} h2,
.${MARKDOWN_SCOPE_CLASS} [data-streamdown="heading-2"] { color: ${roleVariable("h2")}; }
.${MARKDOWN_SCOPE_CLASS} h3,
.${MARKDOWN_SCOPE_CLASS} [data-streamdown="heading-3"] { color: ${roleVariable("h3")}; }
.${MARKDOWN_SCOPE_CLASS} h4,
.${MARKDOWN_SCOPE_CLASS} [data-streamdown="heading-4"] { color: ${roleVariable("h4")}; }
.${MARKDOWN_SCOPE_CLASS} h5,
.${MARKDOWN_SCOPE_CLASS} [data-streamdown="heading-5"] { color: ${roleVariable("h5")}; }
.${MARKDOWN_SCOPE_CLASS} h6,
.${MARKDOWN_SCOPE_CLASS} [data-streamdown="heading-6"] { color: ${roleVariable("h6")}; }
.${MARKDOWN_SCOPE_CLASS} strong,
.${MARKDOWN_SCOPE_CLASS} [data-streamdown="strong"] { color: ${roleVariable("emphasis")}; }
.${MARKDOWN_SCOPE_CLASS} em { color: ${roleVariable("emphasis")}; }
.${MARKDOWN_SCOPE_CLASS} del { color: ${roleVariable("faint")}; }
/* 行内代码：:not(pre) > code 把围栏代码块排除在外（它的父节点是 pre），
   围栏代码的前景由 shiki 主题负责，不能被这里覆盖。 */
.${MARKDOWN_SCOPE_CLASS} :not(pre) > code,
.${MARKDOWN_SCOPE_CLASS} [data-streamdown="inline-code"] { color: ${roleVariable("inlineCode")}; }
.${MARKDOWN_SCOPE_CLASS} a,
.${MARKDOWN_SCOPE_CLASS} [data-streamdown="link"] { color: ${roleVariable("link")}; }
.${MARKDOWN_SCOPE_CLASS} li::marker { color: ${roleVariable("marker")}; }
.${MARKDOWN_SCOPE_CLASS} hr,
.${MARKDOWN_SCOPE_CLASS} [data-streamdown="horizontal-rule"] {
  background-color: ${roleVariable("hr")};
  border-color: ${roleVariable("hr")};
}
.${MARKDOWN_SCOPE_CLASS} [data-markdown-blockquote] {
  border-left-color: ${roleVariable("quote")};
  background-color: ${roleVariable("quoteBg")};
}
.${MARKDOWN_SCOPE_CLASS} [data-streamdown="table"] thead th { background-color: ${roleVariable("band")}; }
.${MARKDOWN_SCOPE_CLASS} [data-streamdown="table"] tbody tr:nth-child(even) > td {
  background-color: ${roleVariable("zebra")};
}
.${MARKDOWN_SCOPE_CLASS} [data-streamdown="table"] tbody tr:hover > td {
  background-color: ${roleVariable("tableHover")};
}
/* 任务列表：去掉多余的项目符号，并把复选框重绘成强调色。 */
.${MARKDOWN_SCOPE_CLASS} li:has(> input[type="checkbox"]) { list-style: none; }
.${MARKDOWN_SCOPE_CLASS} li:has(> input[type="checkbox"]:checked) { color: ${roleVariable("faint")}; }
.${MARKDOWN_SCOPE_CLASS} input[type="checkbox"] {
  appearance: none;
  -webkit-appearance: none;
  box-sizing: border-box;
  position: relative;
  width: 14px;
  height: 14px;
  margin: 0 8px 0 0;
  vertical-align: -2px;
  border-radius: 3px;
  border: 1px solid color-mix(in srgb, ${roleVariable("check")} 68%, transparent);
  background-color: color-mix(in srgb, ${roleVariable("check")} 10%, transparent);
}
.${MARKDOWN_SCOPE_CLASS} input[type="checkbox"]:checked {
  border-color: ${roleVariable("check")};
  background-color: ${roleVariable("check")};
}
.${MARKDOWN_SCOPE_CLASS} input[type="checkbox"]:checked::after {
  content: "";
  position: absolute;
  left: 3px;
  top: 0.5px;
  width: 4px;
  height: 8px;
  border: solid ${roleVariable("checkInk")};
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(42deg);
}
.${MARKDOWN_SCOPE_CLASS} ::selection { background-color: ${roleVariable("selection")}; }
/* 标题里的粗斜体要继承标题色，否则 h1 里的 strong 会变成紫色。
   这条必须写在 strong/em 规则之后：两者特异性相同，靠源码顺序决定胜负。 */
.${MARKDOWN_SCOPE_CLASS} :where(h1, h2, h3, h4, h5, h6) :is(strong, em) { color: inherit; }
`;
}
