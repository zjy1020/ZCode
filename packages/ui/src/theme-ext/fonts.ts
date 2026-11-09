/**
 * 主题扩展层 —— 字体族规范化与组合。
 *
 * 逻辑移植自 `dsh-everforest@1.4.0` 的字体处理：把用户输入按逗号切成族名列表，
 * 逐个清洗后重新拼装，再**前置**到上游自带的兜底栈之前。
 *
 * 为什么必须清洗：
 * - 用户输入会作为内联样式值写进 DOM，未清洗的 `;` / `}` 可以越出声明边界，
 *   构造出额外的 CSS 规则；
 * - 含空格或非 ASCII 的族名不加引号在 CSS 里是无效值，浏览器会整条 `font-family`
 *   丢弃，表现为「设了字体但没生效」——这类问题很难从界面上看出来。
 */

/** 通用族名不加引号。 */
const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "emoji",
  "math",
  "fangsong",
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);

/** 可以原样透传的 CSS 值（主题变量引用）。 */
const PASSTHROUGH_RE = /^var\(\s*--[A-Za-z0-9_-]+\s*\)$/;

/** 可以不加引号的族名：CSS 标识符的保守子集。 */
const BARE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** 去掉控制字符（含 U+2028/U+2029，它们会截断 CSS 字符串）。 */
function stripControlCharacters(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, "");
}

/** 清洗单个族名；非法返回空字符串。 */
function normalizeSingleFamily(token: string): string {
  let name = token.trim();
  // 去掉用户可能自己加的引号，统一由这里决定要不要加。
  while (
    name.length >= 2 &&
    ((name.startsWith('"') && name.endsWith('"')) || (name.startsWith("'") && name.endsWith("'")))
  ) {
    name = name.slice(1, -1).trim();
  }
  if (name.length === 0) return "";

  if (PASSTHROUGH_RE.test(name)) return name;

  // 越界构造与引号转义字符一律拒掉，不做"尽量修补"。
  if (/[\\<>{};:!]/.test(name)) return "";
  if (name.includes("(") || name.includes(")")) return "";

  if (GENERIC_FAMILIES.has(name.toLowerCase())) return name.toLowerCase();

  if (BARE_NAME_RE.test(name)) return name;

  // 含空格、中文、数字开头等一律加双引号（引号内已经不含引号与反斜杠）。
  if (/^[\p{L}\p{N} _.\-+]+$/u.test(name)) return `"${name}"`;

  return "";
}

/**
 * 把用户输入规范化成一段合法的 CSS `font-family` 值。
 *
 * @returns 逗号分隔的族名列表；输入为空或全部非法时返回空字符串。
 */
export function normalizeFontFamilyInput(raw: string): string {
  if (typeof raw !== "string" || raw.length === 0) return "";
  const families = stripControlCharacters(raw)
    .split(",")
    .map(normalizeSingleFamily)
    .filter((name) => name.length > 0);
  // 去重但保留用户顺序。
  const seen = new Set<string>();
  const unique = families.filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.join(", ");
}

/**
 * 组合出最终的字体栈：用户族名在前，上游兜底栈在后。
 * 用户没设或全部非法时直接返回兜底栈。
 */
export function composeFontFamily(raw: string, fallbackStack: string): string {
  const normalized = normalizeFontFamilyInput(raw);
  const fallback = fallbackStack.trim();
  if (normalized.length === 0) return fallback;
  if (fallback.length === 0) return normalized;
  return `${normalized}, ${fallback}`;
}

/** ZCode `styles.css` 没定义 `--font-sans` 时的兜底栈（与 Tailwind v4 默认一致）。 */
const FALLBACK_SANS_STACK =
  'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';

/**
 * ZCode `styles.css:148-150` 定义的 `--font-mono`；读不到时用它兜底。
 *
 * 末尾的中文族名不能省：Windows 的 Consolas 没有中文字形，缺了这几项中文会落到
 * 宋体（上游在 `styles.css:147` 的注释里专门写了这条）。
 */
const FALLBACK_MONO_STACK =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", monospace';

export function fallbackSansStack(): string {
  return FALLBACK_SANS_STACK;
}

export function fallbackMonoStack(): string {
  return FALLBACK_MONO_STACK;
}
