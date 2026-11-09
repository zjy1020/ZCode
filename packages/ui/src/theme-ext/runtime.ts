/**
 * 主题扩展层 —— 应用与装配。
 *
 * 这一层是扩展层与 ZCode 之间的唯一边界，全部效果通过两条路径达成：
 *
 * 1. **配色**：把主题包产出的 token 表写成 `document.documentElement` 上的内联
 *    CSS 自定义属性。`styles.css` 里 `.theme-zai-light` / `.theme-zai-dark`
 *    都是普通选择器声明、且没有任何 `!important`，因此根元素的内联声明必定胜出
 *    （仓库里 `lib/uiFontSize.ts:26` 用同一手法覆盖 `--ui-font-size`，已被
 *    571 个文件的 `--text-ui-*` 派生链验证过）。
 * 2. **字体**：直接写内联 `font-family` + `--font-sans` / `--font-mono`。
 *    - `--font-mono` 是代码的**唯一**收敛点：`@theme` 是普通 `@theme`
 *      （非 inline），所以 `.font-mono` 生成 `font-family: var(--font-mono)`，
 *      改这一个变量，约 447 处类用法 + `@pierre/diffs` Shadow DOM 一起跟随；
 *    - `--font-sans` 只覆盖桌面端：Web 端正文来自 `packages/web/index.html`
 *      常驻 head 里的 `body { font-family: Inter, … }`，所以界面字体同时写
 *      `documentElement` 与 `document.body` 的内联 `font-family`，两条路径都盖上。
 *
 * 明暗切换靠 `MutationObserver` 监听根元素 class 变化——`useTheme.ts:58-70` 的
 * `applyTheme` 必然 toggle `dark` / `theme-zai-light` / `theme-zai-dark`，
 * 因此不需要在任何上游文件里插入调用。
 *
 * 3. **代码高亮**：把「当前配色包 + 明暗 + 对比强度 → shiki 主题对象」的 provider 交给
 *    中立桥 `lib/codeThemeBridge.ts`（见本文件 `resolveCodeThemeOverride`）。叶子库
 *    `lib/shikiHighlighter.ts` 解析主题时问桥一句，因此两个方向都没有依赖：
 *    叶子库不认识扩展层，扩展层也只认识一个不依赖任何东西的桥。
 */

import {
  notifyCodeThemeChanged,
  setCodeThemeProvider,
  type CodeThemeProvider,
} from "../lib/codeThemeBridge.js";
import {
  everforestCodeTheme,
  everforestCodeThemeVariables,
  supportsEverforestCodeTheme,
} from "./codeTheme.js";
import { composeFontFamily, fallbackMonoStack, fallbackSansStack, normalizeFontFamilyInput } from "./fonts.js";
import { resolveEverforestStrength } from "./packs/everforest/index.js";
import { getColorPack, resolveColorPackVariantId } from "./registry.js";
import {
  emitThemeExtChange,
  loadThemeExtSettings,
  mergeThemeExtSettings,
  persistThemeExtSettings,
  subscribeThemeExtChange,
  subscribeThemeExtStorage,
} from "./settings.js";
import type {
  AppliedThemeSnapshot,
  ColorScheme,
  ThemeExtSettings,
  ThemeExtSettingsPatch,
} from "./types.js";
import {
  buildMarkdownStylesheet,
  MARKDOWN_ROLE_KEYS,
  MARKDOWN_STYLESHEET_ID,
  markdownRoleTokens,
  providedMarkdownRoles,
  type MarkdownRoles,
} from "./markdown.js";

/** 装机后写在根元素上的标记，方便在 DevTools 里确认扩展层是否生效。 */
export const THEME_EXT_ROOT_ATTRIBUTE = "data-zcode-theme-ext";

/** ZCode 给普通浏览器根元素打的标记；有它就说明需要同步 meta theme-color。 */
const BROWSER_THEME_SURFACE_ATTRIBUTE = "data-zcode-browser-theme-surface";

type SnapshotListener = (snapshot: AppliedThemeSnapshot) => void;

let installed = false;
let currentSettings: ThemeExtSettings | null = null;
let currentSnapshot: AppliedThemeSnapshot | null = null;
/** 上一次写进根元素内联样式的 token key，用于摘掉这次不再出现的 key。 */
let appliedTokenKeys: ReadonlySet<string> = new Set();
/** 上一轮写进根元素的 Markdown 角色变量，用于卸载时精确摘除。 */
let appliedMarkdownTokenKeys: ReadonlySet<string> = new Set();
/**
 * 上一轮写进根元素的代码高亮变量（`--diffs-*`）。
 *
 * 与 token 变量分开记账：`native` 包不提供代码主题，这时必须先摘掉上一轮的 `--diffs-*`
 * 再回到自带主题，否则代码块会带着上一个配色包的变量值（而 `@pierre/diffs` 主题名已经
 * 不再是我们的名字，变量不会被读，留着只会误导 DevTools 排查）。
 */
let appliedCodeThemeVariableKeys: ReadonlySet<string> = new Set();

/** 上游原本的字体栈，在第一次覆盖之前抓取，用作「用户族名之后的兜底」。 */
let nativeSansStack: string | null = null;
let nativeMonoStack: string | null = null;

const snapshotListeners = new Set<SnapshotListener>();
let disposers: Array<() => void> = [];

/** 从根元素 class 推导当前明暗；与 `useTheme.ts` 的 `resolveTheme` 语义一致。 */
export function readColorScheme(): ColorScheme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function readComputedVariable(name: string): string {
  if (typeof window === "undefined" || typeof document === "undefined") return "";
  try {
    return window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  } catch {
    return "";
  }
}

/**
 * 抓取上游原生字体栈。
 *
 * 必须在第一次写入覆盖**之前**调用：一旦我们把 `--font-mono` 写成内联值，
 * `getComputedStyle` 读回来的就是自己的值，「用户族名 + 原生栈」的组合会自我嵌套。
 */
function captureNativeFontStacks(): void {
  // 只在读到真实值时才落缓存：样式表可能还没加载完，此时读回来是空串，
  // 记成 null 可以让下一次写入时再试一次，避免永久塌到硬编码兜底栈。
  if (nativeSansStack === null) {
    const native = readComputedVariable("--font-sans");
    if (native) nativeSansStack = native;
  }
  if (nativeMonoStack === null) {
    const native = readComputedVariable("--font-mono");
    if (native) nativeMonoStack = native;
  }
}

/** 把 token 表写进根元素内联样式；顺带摘掉上一轮遗留、这一轮不再出现的 key。 */
function writeTokens(tokens: Readonly<Record<string, string>>): void {
  const root = document.documentElement;
  for (const key of appliedTokenKeys) {
    if (!(key in tokens)) {
      root.style.removeProperty(key);
    }
  }
  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(name, value);
  }
  appliedTokenKeys = new Set(Object.keys(tokens));
}

/**
 * 写 Markdown 角色变量；与 `writeTokens` 同构，但用的是独立的前缀与账本。
 *
 * 独立账本是必要的：Markdown 变量和 token 变量的生命周期不同——切到不提供
 * Markdown 角色的主题包时，要先摘掉上一轮的 `--zcode-md-*` 再摘样式表。
 */
function writeMarkdownTokens(roles: MarkdownRoles): void {
  const root = document.documentElement;
  const tokens = markdownRoleTokens(roles);
  for (const key of appliedMarkdownTokenKeys) {
    if (!(key in tokens)) {
      root.style.removeProperty(key);
    }
  }
  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(name, value);
  }
  appliedMarkdownTokenKeys = new Set(Object.keys(tokens));
}

/**
 * 写代码高亮变量（`--diffs-*`）；与 `writeTokens` 同构，独立账本。
 *
 * 这些变量由**两个**高亮引擎读：`@pierre/diffs`（围栏代码块、diff 面板，走它自己的
 * CSS 变量主题）与 shiki（`lib/shikiHighlighter.ts`，token 颜色写成 `var(…)`）。
 * 所以变量只在根元素写一份，两处配色天然一致；切档只改变量值，不需要重新注册主题。
 *
 * 空表也要走一遍：那是「切回 native 包」的清理路径。
 */
function writeCodeThemeVariables(variables: Readonly<Record<string, string>>): void {
  const root = document.documentElement;
  for (const key of appliedCodeThemeVariableKeys) {
    if (!(key in variables)) {
      root.style.removeProperty(key);
    }
  }
  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }
  appliedCodeThemeVariableKeys = new Set(Object.keys(variables));
}

/**
 * 注入 Markdown 样式表（幂等）。
 *
 * 之所以必须跟着主题包一起进出：样式表里的 `color: var(--zcode-md-h1)` 在变量
 * 未定义时会被判为非法并回退成 `inherit`，常驻会把原生主题的 Markdown 一起改坏，
 * 而且不会报任何错。
 */
function ensureMarkdownStylesheet(): void {
  const head = document.head;
  if (!head) return;
  if (document.getElementById(MARKDOWN_STYLESHEET_ID)) return;
  const style = document.createElement("style");
  style.id = MARKDOWN_STYLESHEET_ID;
  style.textContent = buildMarkdownStylesheet();
  head.appendChild(style);
}

/** 摘掉 Markdown 样式表（未注入时是 no-op）。 */
function removeMarkdownStylesheet(): void {
  const style = document.getElementById(MARKDOWN_STYLESHEET_ID);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
  }
}

/**
 * 同步普通浏览器下的 `<meta name="theme-color">`。
 *
 * `useTheme.ts:52` 在 `applyTheme` 里读一次 `--color-background` 写 meta，那时我们的
 * 内联覆盖还没写入（`MutationObserver` 是异步回调），所以这里补一次。
 * 桌面端 Electron 为 vibrancy 保持透明根背景，没有这个属性，什么也不做。
 */
function syncThemeColorMeta(): void {
  const root = document.documentElement;
  if (typeof root.hasAttribute !== "function") return;
  if (!root.hasAttribute(BROWSER_THEME_SURFACE_ATTRIBUTE)) return;
  const background = readComputedVariable("--color-background");
  if (!background) return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    meta.content = background;
  }
}

/** 应用字体设置。空设置一律走 removeProperty，把控制权还给上游样式。 */
function writeFonts(fonts: ThemeExtSettings["fonts"]): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const body = document.body;

  const uiFamily = normalizeFontFamilyInput(fonts.uiFontFamily);
  if (uiFamily.length > 0) {
    const stack = composeFontFamily(uiFamily, nativeSansStack ?? fallbackSansStack());
    root.style.setProperty("--font-sans", stack);
    // 双写：桌面端正文继承自 html（Tailwind preflight），Web 端 body 有自己的
    // font-family 声明，只写变量盖不住它。
    root.style.fontFamily = stack;
    if (body) body.style.fontFamily = stack;
  } else {
    root.style.removeProperty("--font-sans");
    root.style.removeProperty("font-family");
    if (body) body.style.removeProperty("font-family");
  }

  const codeFamily = normalizeFontFamilyInput(fonts.codeFontFamily);
  if (codeFamily.length > 0) {
    root.style.setProperty("--font-mono", composeFontFamily(codeFamily, nativeMonoStack ?? fallbackMonoStack()));
  } else {
    root.style.removeProperty("--font-mono");
  }
}

/**
 * 应用一份设置；返回本次生效的快照。
 *
 * 幂等且无副作用：可以随时重放（明暗切换、其它窗口改了设置、界面重新挂载）。
 */
export function applyThemeExt(settings: ThemeExtSettings): AppliedThemeSnapshot {
  captureNativeFontStacks();
  const scheme = readColorScheme();
  const pack = getColorPack(settings.colorPackId);
  const variantId = resolveColorPackVariantId(pack, settings.colorPackVariantId);
  const tokens = pack.tokens(scheme, variantId);

  writeTokens(tokens);
  writeFonts(settings.fonts);

  // Markdown 角色是可选的：不提供（或只提供一部分）就整张样式表都不注入，
  // 因为样式表里引用了全部 20 个角色变量，缺一个就会让那一条声明在计算值阶段
  // 变成 `inherit` / `initial`，属于「悄悄半生效」——不如干脆保持原生外观。
  const roles: MarkdownRoles = pack.markdownRoles?.(scheme, variantId) ?? {};
  writeMarkdownTokens(roles);
  if (providedMarkdownRoles(roles).length === MARKDOWN_ROLE_KEYS.length) {
    ensureMarkdownStylesheet();
  } else {
    removeMarkdownStylesheet();
  }

  const root = document.documentElement;
  if (typeof root.setAttribute === "function") {
    root.setAttribute(THEME_EXT_ROOT_ATTRIBUTE, `${pack.id}:${scheme}:${variantId || "default"}`);
  }
  // 代码高亮变量：只有提供专属代码主题的包才写，其它包传空表（顺带清掉上一轮的残留）。
  writeCodeThemeVariables(
    supportsEverforestCodeTheme(pack.id)
      ? everforestCodeThemeVariables(scheme, resolveEverforestStrength(scheme, variantId))
      : {},
  );
  syncThemeColorMeta();

  const snapshot: AppliedThemeSnapshot = {
    colorPackId: pack.id,
    colorPackVariantId: variantId,
    scheme,
    tokenCount: Object.keys(tokens).length,
    uiFontFamily: composeFontFamily(settings.fonts.uiFontFamily, nativeSansStack ?? fallbackSansStack()),
    codeFontFamily: composeFontFamily(settings.fonts.codeFontFamily, nativeMonoStack ?? fallbackMonoStack()),
  };
  currentSnapshot = snapshot;
  for (const listener of snapshotListeners) {
    listener(snapshot);
  }
  // 代码高亮覆盖（名字 + 变量）可能都变了：通知订阅者，让已挂载的代码块重画。
  // 必须放在快照更新之后，`resolveCodeThemeOverride` 读的就是 `currentSnapshot` 的明暗。
  notifyCodeThemeChanged();
  return snapshot;
}

/** 用当前内存中的设置重放一次；未安装时用持久化设置。 */
export function reapplyThemeExt(): AppliedThemeSnapshot {
  const settings = currentSettings ?? loadThemeExtSettings();
  currentSettings = settings;
  return applyThemeExt(settings);
}

/** 读取当前生效的快照；未应用过时为 null。 */
export function getThemeExtSnapshot(): AppliedThemeSnapshot | null {
  return currentSnapshot;
}

export function subscribeThemeExtSnapshot(listener: SnapshotListener): () => void {
  snapshotListeners.add(listener);
  return () => {
    snapshotListeners.delete(listener);
  };
}

/**
 * 更新设置：合并 → 落盘 → 应用 → 广播同文档变更事件。
 *
 * 落盘在前是为了让「设置页刚改完就刷新」也能拿到新值；应用是同步的，
 * 所以调用方拿到的返回值就是已经生效的快照。
 */
export function setThemeExtSettings(
  patch: ThemeExtSettingsPatch,
): AppliedThemeSnapshot {
  const base = currentSettings ?? loadThemeExtSettings();
  const next = mergeThemeExtSettings(base, patch);
  currentSettings = next;
  persistThemeExtSettings(next);
  const snapshot = applyThemeExt(next);
  emitThemeExtChange(next);
  return snapshot;
}

/**
 * 供设置页预览用：不落盘、不写 DOM，直接拿到某个配色包在某个明暗下的 token 表。
 */
export function previewColorPackTokens(
  packId: string,
  variantId: string,
  scheme: ColorScheme,
): Readonly<Record<string, string>> {
  const pack = getColorPack(packId);
  return pack.tokens(scheme, resolveColorPackVariantId(pack, variantId));
}

/**
 * 代码高亮覆盖：**每次调用现算**，所以切明暗、切档位、换配色包之后的下一次高亮
 * 就是新配色，不需要任何主动刷新动作。
 *
 * 只有提供专属代码主题的配色包（当前是 Everforest）返回覆盖；`native` 返回 `null`，
 * 叶子库于是回到 shiki 自带主题——这正是「关掉扩展层 = 完全回到原生」。
 *
 * 档位用 `resolveEverforestStrength`：用户选「跟随默认」时它按 scheme 展开成
 * `DEFAULT_STATE`，与 `everforestColorPack.tokens` 走的是同一个解析，所以代码块与界面
 * 永远在同一档上。
 */
const resolveCodeThemeOverride: CodeThemeProvider = () => {
  if (!installed || currentSettings === null) return null;
  const pack = getColorPack(currentSettings.colorPackId);
  if (!supportsEverforestCodeTheme(pack.id)) return null;
  const scheme = currentSnapshot?.scheme ?? readColorScheme();
  const strength = resolveEverforestStrength(scheme, currentSettings.colorPackVariantId);
  // 修订号 = 配色包 + 明暗 + 生效档位。三者任一变化都会产出不同的高亮，调用方据此
  // 重新画已经渲染过的代码块（`@pierre/diffs` 按 `file.cacheKey` 复用 token）。
  return {
    ...everforestCodeTheme(scheme, strength),
    revision: `${pack.id}:${scheme}:${strength}`,
  };
};

/**
 * 装上扩展层：立即应用一次，然后长期跟随根元素 class 变化与跨文档 storage 变化。
 *
 * 幂等：重复调用只返回已有的卸载函数。
 */
export function installThemeExt(): () => void {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return () => {};
  }
  if (installed) {
    return uninstallThemeExt;
  }
  installed = true;

  currentSettings = loadThemeExtSettings();
  applyThemeExt(currentSettings);

  // 代码高亮主题：交给中立桥，叶子库解析主题时会问它一句。
  setCodeThemeProvider(resolveCodeThemeOverride);

  // 装配时机可能早于 <body> 存在或早于样式表就绪：此时 Web 端 body 的字体盖不上、
  // 原生 `--font-*` 也读不到。DOMContentLoaded 后再重放一次即可补上（重放是幂等的）。
  if (!document.body || document.readyState === "loading") {
    const onReady = () => {
      reapplyThemeExt();
    };
    document.addEventListener("DOMContentLoaded", onReady, { once: true });
    disposers.push(() => document.removeEventListener("DOMContentLoaded", onReady));
  }

  // 明暗切换：useTheme 的 applyTheme 必然 toggle 根元素 class，这里跟着重放。
  const observer = new MutationObserver(() => {
    reapplyThemeExt();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  disposers.push(() => observer.disconnect());

  // 同文档内其它代码改了扩展层设置。
  disposers.push(
    subscribeThemeExtChange(() => {
      reapplyThemeExt();
    }),
  );

  // 其它同源文档（另一个窗口 / 另一个标签）改了设置，或本窗口重新获得焦点。
  const reloadFromStorage = () => {
    const stored = loadThemeExtSettings();
    currentSettings = stored;
    applyThemeExt(stored);
  };
  disposers.push(subscribeThemeExtStorage(reloadFromStorage));
  const onFocus = () => reloadFromStorage();
  window.addEventListener("focus", onFocus);
  disposers.push(() => window.removeEventListener("focus", onFocus));

  return uninstallThemeExt;
}

/** 卸载：摘掉全部内联覆盖，回到 ZCode 原生外观。 */
export function uninstallThemeExt(): void {
  if (!installed) return;
  installed = false;
  // 先注销代码主题覆盖：叶子库从此回到 shiki 自带主题。
  setCodeThemeProvider(null);
  for (const dispose of disposers) {
    dispose();
  }
  disposers = [];
  for (const key of appliedTokenKeys) {
    document.documentElement.style.removeProperty(key);
  }
  appliedTokenKeys = new Set();
  removeMarkdownStylesheet();
  for (const key of appliedMarkdownTokenKeys) {
    document.documentElement.style.removeProperty(key);
  }
  appliedMarkdownTokenKeys = new Set();
  for (const key of appliedCodeThemeVariableKeys) {
    document.documentElement.style.removeProperty(key);
  }
  appliedCodeThemeVariableKeys = new Set();
  document.documentElement.style.removeProperty("--font-sans");
  document.documentElement.style.removeProperty("--font-mono");
  document.documentElement.style.removeProperty("font-family");
  document.body?.style.removeProperty("font-family");
  if (typeof document.documentElement.removeAttribute === "function") {
    document.documentElement.removeAttribute(THEME_EXT_ROOT_ATTRIBUTE);
  }
}

export function isThemeExtInstalled(): boolean {
  return installed;
}
