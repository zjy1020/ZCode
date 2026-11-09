/**
 * 代码高亮主题桥 —— 中立层，唯一目的是让叶子库不认识上层。
 *
 * 依赖方向在 ZCode 里是硬约束：`theme-ext/` 是上层，`lib/` 是叶子库；叶子库一旦
 * import 扩展层，「摘掉扩展层」就会变成编译错误。但「代码块用哪套配色」必须由扩展层
 * 决定，于是双方各持一半：
 *
 * - 扩展层在 `theme-ext/runtime.ts` 的 `installThemeExt()` 里装一个 provider，
 *   按当前「配色包 + 明暗 + 对比强度」**现算**主题对象；卸装时注销；
 * - 叶子库解析主题时问一句 `getCodeThemeOverride()`：有覆盖就用覆盖，没有就回到
 *   自带主题（`lib/shikiHighlighter.ts` 走 shiki 自带主题，`lib/diffsHighlighterEngine.ts`
 *   走 `@pierre/diffs` 的自带主题）。
 *
 * 本文件刻意不引 DOM、不引 shiki、不引 @pierre/diffs、不引扩展层：它只存一个函数引用，
 * 所以两边都能安全 import，而不会互相拖出依赖。provider 是每次调用现算的（不是缓存值），
 * 所以切明暗、切档位之后的下一次解析就是新配色。
 *
 * 颜色本身走 **CSS 自定义属性**：扩展层把 `--diffs-*` 写进 `documentElement` 的内联变量，
 * 两个高亮引擎都按变量取值，切档只要改变量值即可，不需要重新注册主题、也不需要重挂组件。
 */

/**
 * 扩展层使用的 CSS 变量主题名（`@pierre/diffs` 侧注册的名字）。
 *
 * 它**恒定**，不带明暗/档位：明暗与档位只体现在变量值上。这样做的两个原因：
 *
 * 1. `@pierre/diffs` 的 `registerCustomTheme` 对同名注册只打一条 `console.error` 后直接
 *    返回（`dist/highlighter/themes/registerCustomTheme.js`），按档位起名会注册六个；
 * 2. 主题名参与 worker 池的 `renderOptions`，名字稳定时切换档位不需要重新初始化 worker。
 */
export const CODE_THEME_VARIABLES_NAME = "everforest-tokens";

/**
 * 扩展层给出的主题覆盖。
 *
 * `theme` 故意是 `unknown`：本文件是两边共用的中立层，一旦在这里写 shiki 的主题类型，
 * 扩展层的 `codeTheme.ts` 就得依赖 shiki 的类型声明。结构由
 * `theme-ext/codeTheme.ts` 保证（`name` / `type` / `colors` / `settings` 齐全），
 * 叶子库在唯一的使用点上收敛成 shiki 的类型。
 */
export interface ShikiThemeOverride {
  /**
   * shiki 自己的主题名，形如 `everforest-dark-soft`。
   *
   * 它同时是 shiki 的主题名与**两层缓存的键前缀**（highlighter 缓存、token 缓存），
   * 所以必须随明暗与档位变化，绝不能是一个固定串。
   */
  readonly name: string;
  /** shiki 主题对象（`ThemeRegistration` 形状）。 */
  readonly theme: unknown;
  /**
   * 覆盖的修订号，形如 `everforest:dark:soft`。
   *
   * 切配色包 / 切档位 / 切明暗都会变，用于让调用方把「已渲染的代码块」重新画一遍
   * （`@pierre/diffs` 按 `file.cacheKey` 复用 token，key 不含修订号就会一直用旧高亮）。
   */
  readonly revision: string;
}

/** 每次调用现算的 provider；返回 `null` 表示「本次不使用覆盖，走自带主题」。 */
export type CodeThemeProvider = () => ShikiThemeOverride | null;

let codeThemeProvider: CodeThemeProvider | null = null;
const codeThemeListeners = new Set<() => void>();

/**
 * 注册/注销覆盖 provider。
 *
 * 传 `null` 表示注销（扩展层卸装时走这条），此后叶子库回到自带主题，
 * 行为与本移植前完全一致。
 */
export function setCodeThemeProvider(provider: CodeThemeProvider | null): void {
  codeThemeProvider = provider;
  notifyCodeThemeChanged();
}

/**
 * 通知订阅者「覆盖可能变了」。
 *
 * 扩展层每次把变量写进 `documentElement` 之后调一次。订阅方是
 * `hooks/useCodeThemeRevision.ts`（`useSyncExternalStore`），它让「切包 / 切档」能触发
 * 已挂载组件的重渲染，而不是等下一次组件重挂。
 */
export function notifyCodeThemeChanged(): void {
  for (const listener of codeThemeListeners) {
    listener();
  }
}

/** 订阅覆盖变化；返回退订函数。 */
export function subscribeCodeTheme(listener: () => void): () => void {
  codeThemeListeners.add(listener);
  return () => {
    codeThemeListeners.delete(listener);
  };
}

/**
 * 取当前生效的主题覆盖；没有 provider（或 provider 主动返回 `null`）时为 `null`。
 */
export function getCodeThemeOverride(): ShikiThemeOverride | null {
  if (codeThemeProvider === null) return null;
  return codeThemeProvider();
}

/**
 * 取当前生效的修订号；未接管时为 `null`。它同时是 `useSyncExternalStore` 的快照，
 * 所以必须是「值比较即可」的原始类型。
 */
export function getCodeThemeRevision(): string | null {
  return getCodeThemeOverride()?.revision ?? null;
}

/**
 * 取 `@pierre/diffs` 侧要使用的主题名；未接管时为 `null`（调用方回落到设置页选的主题）。
 *
 * 与 `getCodeThemeOverride()` 分开，是为了让「围栏代码块的渲染路径」只依赖名字 + CSS 变量，
 * 不需要把 shiki 主题对象传来传去。
 */
export function getCodeThemeVariablesName(): typeof CODE_THEME_VARIABLES_NAME | null {
  return getCodeThemeOverride() === null ? null : CODE_THEME_VARIABLES_NAME;
}
