/**
 * 主题扩展层 —— Everforest 主题包：把 Everforest 调色板映射成 ZCode 的
 * `--color-*` 语义 token。
 *
 * 设计要点：
 * 1. **零改动上游 CSS**。这里只产出一张「CSS 自定义属性名 → 值」的表，
 *    由 `applyThemePack` 写成 `document.documentElement` 上的内联样式；
 *    内联样式优先级高于 `.theme-zai-light` / `.theme-zai-dark` 这两个 class 块，
 *    所以 ZCode 自身的 `styles.css` 一行都不用改。
 * 2. **两个 scheme 必须产出完全相同的 key 集合**。内联变量在切主题时不会自动清空，
 *    若某个 token 只在浅色里有值，切到深色后它会残留浅色的值。
 *    `assertSameTokenKeys()` 在开发期会断言这一点。
 * 3. **分层策略**（照搬上游 dsh-everforest 的思路，但适配 ZCode 的 token 语义）：
 *    - 表面/文字/状态色走**显式语义映射**，不依赖自动跟随；
 *    - 中性覆盖层（hover/selected/surface）用 `bg5` 墨色 + 透明度，与 ZCode 原本
 *      `rgba(13,13,13,.05)` 这种「半透明墨色叠加」的写法保持同构；
 *    - 任何**承载文字的浅色面**都过一遍 `readableSurface()` 对比度守卫，
 *      保证 `--color-foreground` 在它上面至少达到 4.5:1（WCAG AA）。
 *
 * 上游对应关系：`dsh-everforest@1.4.0` 的 `src/tokens.js`。上游是给 DSH 的
 * `--dsw-*` 命名空间做的映射，这里换成了 ZCode 的 `--color-*` 命名空间。
 */

import { alpha, contrastRatio, guardTo, mix, safeTint } from "../../color.js";
import {
  foregroundFor,
  rampFor,
  type BackgroundRamp,
  type Foreground,
  type Scheme,
  type Strength,
} from "./palette.js";

/** 主题包算法版本：语义映射规则变更时递增，便于排查「升级后颜色变了」。 */
export const EVERFOREST_TOKENS_REVISION = 1;

/** WCAG AA 正文对比度门槛，与上游 `SURFACE_CONTRAST_TARGET` 一致。 */
const SURFACE_CONTRAST_TARGET = 4.5;

/** 浅色模式下向上抬升的表面只朝 bg 阶混 25%，避免层次过重。 */
const LIGHT_SURFACE_MIX = 0.25;

/** 中性覆盖层的不透明度：浅色模式用更小的值，因为浅底上叠加更显眼。 */
const BORDER_ALPHAS: Readonly<Record<Scheme, Readonly<Record<"l1" | "l2" | "l3" | "l4", number>>>> =
  Object.freeze({
    light: Object.freeze({ l1: 0.16, l2: 0.24, l3: 0.34, l4: 0.5 }),
    dark: Object.freeze({ l1: 0.18, l2: 0.26, l3: 0.36, l4: 0.5 }),
  });

const OVERLAY_ALPHAS: Readonly<
  Record<Scheme, Readonly<Record<"surface" | "hover" | "selected", number>>>
> = Object.freeze({
  light: Object.freeze({ surface: 0.04, hover: 0.06, selected: 0.08 }),
  dark: Object.freeze({ surface: 0.06, hover: 0.08, selected: 0.12 }),
});

/** 由调色板算出的派生工具集合。 */
type PaletteContext = Readonly<{
  scheme: Scheme;
  isLight: boolean;
  ramp: BackgroundRamp;
  fg: Foreground;
  /** 叠加用墨色：两种 scheme 下都是中间调的灰绿，叠加后分别变暗/变亮。 */
  ink: string;
  /** 抬升的表面：浅色下朝 bg1/bg2 混 25%，深色下直接用 bgN。 */
  surface: (step: 1 | 2 | 3 | 4) => string;
  /** 承载文字的表面：过对比度守卫。 */
  readable: (color: string, target?: number) => string;
  /** 无彩色注释：把色相朝锚点混合。 */
  lift: (color: string, ratio: number) => string;
  deepen: (color: string, ratio: number) => string;
  tint: (color: string, ratio: number) => string;
  /** 在某个实色底上选一个对比度够高的文字色。 */
  inkOn: (color: string) => string;
  border: (level: "l1" | "l2" | "l3" | "l4") => string;
  overlay: (level: "surface" | "hover" | "selected") => string;
}>;

function createContext(scheme: Scheme, strength: Strength): PaletteContext {
  const ramp = rampFor(scheme, strength);
  const fg = foregroundFor(scheme);
  const isLight = scheme === "light";
  /** 向亮端混合的锚点。 */
  const lightAnchor = isLight ? ramp.bg0 : fg.fg;
  /** 向暗端混合的锚点。 */
  const darkAnchor = isLight ? fg.fg : ramp.bgDim;

  const bgStep = (step: 1 | 2 | 3 | 4): string => {
    switch (step) {
      case 1:
        return ramp.bg1;
      case 2:
        return ramp.bg2;
      case 3:
        return ramp.bg3;
      default:
        return ramp.bg4;
    }
  };

  const lift = (color: string, ratio: number): string => mix(color, lightAnchor, ratio);
  const deepen = (color: string, ratio: number): string => mix(color, darkAnchor, ratio);
  const tint = (color: string, ratio: number): string => mix(color, ramp.bg0, ratio);

  const readable = (color: string, target = SURFACE_CONTRAST_TARGET): string => {
    if (contrastRatio(fg.fg, color) >= target) {
      return color;
    }
    for (let step = 0.02; step <= 1.0001; step += 0.02) {
      const candidate = mix(color, ramp.bg0, step);
      if (contrastRatio(fg.fg, candidate) >= target) {
        return candidate;
      }
    }
    return mix(color, ramp.bg0, 1);
  };

  const inkOn = (color: string): string => {
    // 白字还是近底色字，取决于哪个对比度更高（浅色主题的近底色本来就更接近白）。
    const white = "#FFFFFF";
    return contrastRatio(white, color) >= contrastRatio(ramp.bg0, color) ? white : ramp.bg0;
  };

  return {
    scheme,
    isLight,
    ramp,
    fg,
    // 深色下 bg5 已是中间调，再和 grey1 混一点避免边框偏绿。
    ink: isLight ? ramp.bg5 : mix(ramp.bg5, fg.grey1, 0.2),
    surface: (step) => (isLight ? mix(ramp.bg0, bgStep(step), LIGHT_SURFACE_MIX) : bgStep(step)),
    readable,
    lift,
    deepen,
    tint,
    inkOn,
    border: (level) => alpha(isLight ? ramp.bg5 : mix(ramp.bg5, fg.grey1, 0.2), BORDER_ALPHAS[scheme][level]),
    overlay: (level) => alpha(isLight ? ramp.bg5 : mix(ramp.bg5, fg.grey1, 0.2), OVERLAY_ALPHAS[scheme][level]),
  };
}

/**
 * 生成 ZCode 的 `--color-*` 覆盖表。
 *
 * @param scheme 当前生效的明暗；由根元素上的 class 推导。
 * @param strength 对比强度；`hard` 背景对比最强，`soft` 最弱。
 */
export function everforestZCodeTokens(
  scheme: Scheme,
  strength: Strength,
): Readonly<Record<string, string>> {
  const c = createContext(scheme, strength);
  const { ramp, fg } = c;

  const tokens: Record<string, string> = {
    // ── 画布与表面 ────────────────────────────────────────────────────────
    // ZCode 自身把 header/panel/card/popover/input/menu 归成「抬升」层，
    // 把 sidebar/tab/tooltip 归成「下沉」层。Everforest 的 bg 阶是单向的：
    // 深色下 index 越大越亮，浅色下 index 越大越暗。这里沿用上游做法，
    // 浅色下只朝暗端混 25%，靠边框与阴影表达层次。
    "--color-background": ramp.bg0,
    "--color-background-win-alt": c.surface(2),
    "--color-background-alt": c.isLight
      ? "color-mix(in oklab, var(--color-background) 70%, transparent)"
      : "color-mix(in oklab, var(--color-background-win-alt) 60%, transparent)",
    "--color-header": c.surface(1),
    "--color-panel": c.surface(1),
    "--color-popover-header": c.surface(1),
    "--color-card": c.readable(c.surface(2)),
    "--color-popover": c.readable(c.surface(2)),
    "--color-input": c.readable(c.surface(2)),
    "--color-menu": c.readable(c.surface(2)),
    "--color-toast": c.readable(c.surface(2)),
    "--color-tooltip": c.readable(c.surface(2)),
    // 下沉层与次级面同样承载文字（侧栏标签、页签标题、菜单悬停项），
    // 浅色下朝暗端混得越多对比度越低，因此一律过对比度守卫。
    "--color-sidebar": c.readable(c.isLight ? mix(ramp.bg0, ramp.bg2, 0.5) : ramp.bgDim),
    "--color-tab": c.readable(c.isLight ? mix(ramp.bg0, ramp.bg2, 0.5) : ramp.bg1),
    "--color-tab-active": c.surface(1),
    "--color-menu-hover": c.readable(c.isLight ? mix(ramp.bg0, ramp.bg2, 0.55) : ramp.bg3),
    "--color-secondary": c.readable(c.isLight ? mix(ramp.bg0, ramp.bg2, 0.5) : ramp.bg3),
    "--color-tag": c.readable(c.isLight ? mix(ramp.bg0, ramp.bg2, 0.5) : ramp.bg3),
    "--color-tooltip-tag": c.readable(c.isLight ? mix(ramp.bg0, ramp.bg2, 0.5) : ramp.bg3),

    // ── 品牌与文字 ────────────────────────────────────────────────────────
    // `--color-brand` 在 ZCode 里是焦点环 / 信息色（plugin-ui 把它接到
    // `--color-text-info`、`--color-ring-primary`），对应 Everforest 的 aqua。
    "--color-brand": fg.aqua,
    // `--color-primary` 是「反色面」（plugin-ui 接到 `--color-background-inverse`），
    // 不是品牌色，所以用前景色而不是 aqua。
    "--color-primary": fg.fg,
    "--color-primary-foreground": ramp.bg0,
    "--color-foreground": fg.fg,
    "--color-foreground-subtle": "color-mix(in oklab, var(--color-foreground) 60%, transparent)",
    "--color-foreground-subtlest": `color-mix(in oklab, var(--color-foreground) ${c.isLight ? 40 : 30}%, transparent)`,
    "--color-foreground-inverse": ramp.bg0,
    "--color-remote-foreground-muted": c.isLight ? mix(fg.fg, ramp.bg0, 0.3) : mix(fg.fg, ramp.bg0, 0.2),
    "--lucide-subtlest-opacity": c.isLight ? "0.4" : "0.3",
    "--animated-gradient-text-strong": fg.fg,
    "--animated-gradient-text-soft": alpha(fg.fg, 0.22),

    // ── 边框与覆盖层 ──────────────────────────────────────────────────────
    // 与 ZCode 原本的半透明墨色叠加同构，只是把中性黑/白换成 Everforest 的灰绿。
    "--color-border": c.border("l1"),
    "--color-border-hover": c.border("l2"),
    "--color-card-border": "var(--color-border)",
    "--color-popover-border": "var(--color-border)",
    "--color-tab-border": "var(--color-border)",
    "--color-input-border": "var(--color-border)",
    "--color-input-border-hover": "var(--color-border-hover)",
    "--color-input-border-focused": "var(--color-border-hover)",
    "--color-input-focused": "var(--color-input)",
    "--color-card-selected": "var(--color-input)",
    "--color-popover-foreground": "var(--color-foreground)",
    "--color-surface": c.overlay("surface"),
    "--color-surface-hover": c.overlay("selected"),
    "--color-hover": c.overlay("hover"),
    "--color-selected": c.overlay("selected"),

    // ── 强调面 ────────────────────────────────────────────────────────────
    "--color-accent": ramp.bgBlue,
    "--color-find-highlight": ramp.bgYellow,
    "--color-find-highlight-active": fg.orange,
    "--color-user-message-bubble": c.isLight
      ? mix(ramp.bg0, ramp.bgVisual, 0.35)
      : mix(ramp.bg0, ramp.bgVisual, 0.4),

    // ── 轨迹着色（会话里区分 user / assistant / 推理 / 工具调用 / 工具结果）──
    "--color-trajectory-user": fg.blue,
    "--color-trajectory-assistant": fg.aqua,
    "--color-trajectory-reasoning": fg.purple,
    "--color-trajectory-tool-call": fg.orange,
    "--color-trajectory-tool-result": fg.green,

    // ── 工作流连线（极低透明度的墨色，沿用 ZCode 的量级）──────────────────
    "--color-workflow-rule": alpha(c.ink, c.isLight ? 0.055 : 0.065),
    "--color-workflow-trace": alpha(c.ink, c.isLight ? 0.3 : 0.35),
    "--color-workflow-trace-strong": alpha(c.ink, c.isLight ? 0.55 : 0.6),

    // ── 交互与状态面 ──────────────────────────────────────────────────────
    "--color-interaction-ask-surface": ramp.bgBlue,
    "--color-interaction-ask-foreground": c.isLight ? mix(fg.blue, fg.fg, 0.25) : mix(fg.blue, fg.fg, 0.2),
    "--color-interaction-ask-fill": alpha(fg.green, 0.22),
    "--color-interaction-confirmation-surface": ramp.bgGreen,
    "--color-interaction-confirmation-foreground": c.isLight
      ? mix(fg.green, fg.fg, 0.45)
      : mix(fg.green, fg.fg, 0.2),
    "--color-success": fg.green,
    "--color-success-foreground": c.inkOn(fg.green),
    "--color-success-surface": ramp.bgGreen,
    "--color-success-surface-foreground": c.isLight ? mix(fg.green, fg.fg, 0.45) : mix(fg.green, fg.fg, 0.2),
    "--color-progress-surface": ramp.bgBlue,
    "--color-progress-surface-foreground": c.isLight ? mix(fg.blue, fg.fg, 0.35) : mix(fg.blue, fg.fg, 0.2),
    "--color-warning": fg.yellow,
    "--color-warning-foreground": c.inkOn(fg.yellow),
    "--color-warning-surface": ramp.bgYellow,
    "--color-warning-surface-foreground": c.isLight
      ? mix(fg.yellow, fg.fg, 0.5)
      : mix(fg.yellow, fg.fg, 0.2),
    "--color-feedback-privacy-hint": fg.yellow,
    "--color-destructive": fg.red,
    "--color-destructive-foreground": c.inkOn(fg.red),
    "--color-destructive-surface": ramp.bgRed,
    "--color-destructive-surface-foreground": c.isLight
      ? mix(fg.red, fg.fg, 0.35)
      : mix(fg.red, fg.fg, 0.2),
    "--color-idle-task": fg.purple,
    "--color-idle-task-surface": ramp.bgPurple,

    // ── diff ──────────────────────────────────────────────────────────────
    "--color-diff-added": fg.green,
    "--color-diff-added-foreground": c.inkOn(fg.green),
    "--color-diff-removed": fg.red,
    "--color-diff-removed-foreground": c.inkOn(fg.red),

    // ── git 状态 ──────────────────────────────────────────────────────────
    "--color-git-none": "var(--color-foreground)",
    "--color-git-modified": fg.orange,
    "--color-git-added": fg.green,
    "--color-git-deleted": fg.red,
    "--color-git-renamed": fg.blue,
    "--color-git-untracked": fg.green,
    "--color-git-ignored": "var(--color-foreground-subtlest)",
    "--color-git-descendant": fg.orange,

    // ── 终端 ──────────────────────────────────────────────────────────────
    "--color-terminal-bg": "var(--color-background)",
    "--color-terminal-fg": "var(--color-foreground)",
    "--color-terminal-cursor": fg.fg,
    "--color-terminal-cursor-accent": ramp.bg0,
    "--color-terminal-selection": alpha(fg.blue, 0.24),
    "--color-terminal-selection-inactive": alpha(c.ink, c.isLight ? 0.12 : 0.14),
    // ANSI 16 色。浅色主题下 black 必须真的是深色（TUI 会把它当背景用），
    // white 反之；bright-* 与 ZCode 原值一样向「可读」方向取值而不是真的更亮。
    "--color-terminal-black": c.isLight ? fg.fg : ramp.bg3,
    "--color-terminal-red": fg.red,
    "--color-terminal-green": fg.green,
    "--color-terminal-yellow": fg.yellow,
    "--color-terminal-blue": fg.blue,
    "--color-terminal-magenta": fg.purple,
    "--color-terminal-cyan": fg.aqua,
    "--color-terminal-white": c.isLight ? fg.grey0 : fg.grey2,
    "--color-terminal-bright-black": c.isLight ? fg.grey2 : fg.grey0,
    "--color-terminal-bright-red": fg.headerRed,
    "--color-terminal-bright-green": fg.headerGreen,
    "--color-terminal-bright-yellow": fg.headerYellow,
    "--color-terminal-bright-blue": fg.headerBlue,
    "--color-terminal-bright-magenta": fg.headerPurple,
    "--color-terminal-bright-cyan": fg.headerAqua,
    "--color-terminal-bright-white": fg.fg,

    // ── 统计图表 ──────────────────────────────────────────────────────────
    // 顺序与 ZCode 原值一致：蓝 / 绿 / 紫 / 红 / 橙 / 青。
    "--color-usage-chart-1": fg.blue,
    "--color-usage-chart-2": fg.green,
    "--color-usage-chart-3": fg.purple,
    "--color-usage-chart-4": fg.red,
    "--color-usage-chart-5": fg.orange,
    "--color-usage-chart-6": fg.aqua,
    // 上下文占用用同色相 7 级渐变（ZCode 原本是蓝色 7 级）。
    "--color-context-breakdown-1": fg.blue,
    "--color-context-breakdown-2": mix(fg.blue, ramp.bg0, 0.16),
    "--color-context-breakdown-3": mix(fg.blue, ramp.bg0, 0.32),
    "--color-context-breakdown-4": mix(fg.blue, ramp.bg0, 0.48),
    "--color-context-breakdown-5": mix(fg.blue, ramp.bg0, 0.64),
    "--color-context-breakdown-6": mix(fg.blue, ramp.bg0, 0.79),
    "--color-context-breakdown-7": mix(fg.blue, ramp.bg0, 0.9),
    "--color-usage-heatmap-0": `color-mix(in oklab, ${fg.blue} 0%, var(--color-surface))`,
    "--color-usage-heatmap-1": `color-mix(in oklab, ${fg.blue} ${c.isLight ? 18 : 24}%, var(--color-surface))`,
    "--color-usage-heatmap-2": `color-mix(in oklab, ${fg.blue} ${c.isLight ? 36 : 42}%, var(--color-surface))`,
    "--color-usage-heatmap-3": `color-mix(in oklab, ${fg.blue} ${c.isLight ? 58 : 62}%, var(--color-surface))`,
    "--color-usage-heatmap-4": `color-mix(in oklab, ${mix(fg.blue, c.isLight ? ramp.bg0 : fg.fg, 0.35)} ${c.isLight ? 82 : 78}%, var(--color-surface))`,

    // ── 远程环境标记（ssh 蓝 / wsl 绿 / docker 紫）────────────────────────
    "--color-remote-ssh-surface": ramp.bgBlue,
    "--color-remote-ssh-foreground": c.isLight ? mix(fg.blue, fg.fg, 0.25) : fg.headerBlue,
    "--color-remote-ssh-border": alpha(fg.blue, 0.42),
    "--color-remote-wsl-surface": ramp.bgGreen,
    "--color-remote-wsl-foreground": c.isLight ? mix(fg.green, fg.fg, 0.35) : fg.headerGreen,
    "--color-remote-wsl-border": alpha(fg.green, 0.42),
    "--color-remote-docker-surface": ramp.bgPurple,
    "--color-remote-docker-foreground": c.isLight ? mix(fg.purple, fg.fg, 0.3) : fg.headerPurple,
    "--color-remote-docker-border": alpha(fg.purple, 0.42),

    // ── 侧栏节点族（每种节点一个色相）────────────────────────────────────
    "--color-file-node": alpha(fg.blue, c.isLight ? 0.12 : 0.16),
    "--color-file-node-hover": alpha(fg.blue, c.isLight ? 0.18 : 0.22),
    "--color-file-node-foreground": c.isLight ? mix(fg.blue, fg.fg, 0.2) : c.lift(fg.blue, 0.15),
    "--color-skill-node": alpha(fg.purple, c.isLight ? 0.12 : 0.16),
    "--color-skill-node-hover": alpha(fg.purple, c.isLight ? 0.18 : 0.22),
    "--color-skill-node-foreground": c.isLight ? mix(fg.purple, fg.fg, 0.2) : c.lift(fg.purple, 0.2),
    "--color-command-node": alpha(fg.grey1, c.isLight ? 0.12 : 0.16),
    "--color-command-node-hover": alpha(fg.grey1, c.isLight ? 0.18 : 0.22),
    "--color-command-node-foreground": c.isLight ? mix(fg.grey1, fg.fg, 0.35) : c.lift(fg.grey1, 0.3),
    "--color-subagent-node": alpha(fg.green, c.isLight ? 0.12 : 0.16),
    "--color-subagent-node-hover": alpha(fg.green, c.isLight ? 0.18 : 0.22),
    "--color-subagent-node-foreground": c.isLight ? mix(fg.green, fg.fg, 0.45) : c.lift(fg.green, 0.15),
    "--color-session-node": alpha(fg.aqua, c.isLight ? 0.12 : 0.16),
    "--color-session-node-hover": alpha(fg.aqua, c.isLight ? 0.18 : 0.22),
    "--color-session-node-foreground": c.isLight ? mix(fg.aqua, fg.fg, 0.25) : c.lift(fg.aqua, 0.15),
    "--color-plugin-node": alpha(fg.yellow, c.isLight ? 0.12 : 0.16),
    "--color-plugin-node-hover": alpha(fg.yellow, c.isLight ? 0.18 : 0.22),
    "--color-plugin-node-foreground": c.isLight ? mix(fg.yellow, fg.fg, 0.5) : c.lift(fg.yellow, 0.1),

    // ── 付费计划徽标 ──────────────────────────────────────────────────────
    "--color-plugin-paid-plan-badge": mix(ramp.bg0, fg.orange, c.isLight ? 0.2 : 0.28),
    "--color-plugin-paid-plan-badge-foreground": c.isLight ? mix(fg.orange, fg.fg, 0.45) : fg.orange,

    // ── 工具提示前景 ──────────────────────────────────────────────────────
    "--color-tooltip-foreground": fg.fg,
    "--color-tooltip-tag-foreground": fg.grey2,
  };

  return Object.freeze(tokens);
}

/**
 * 开发期自检：两个 scheme 必须产出同一组 key。
 *
 * 内联 CSS 变量在切换明暗时不会自动清空，缺 key 会让上一套主题的值残留，
 * 这类 bug 在界面上表现为「某个面板切主题后颜色不对」，很难定位。
 */
export function assertSameTokenKeys(
  light: Readonly<Record<string, string>>,
  dark: Readonly<Record<string, string>>,
): void {
  const lightKeys = Object.keys(light).sort();
  const darkKeys = Object.keys(dark).sort();
  const onlyLight = lightKeys.filter((key) => !(key in dark));
  const onlyDark = darkKeys.filter((key) => !(key in light));
  if (onlyLight.length > 0 || onlyDark.length > 0) {
    throw new Error(
      `Everforest 主题包两个明暗方案的 token key 不一致：仅浅色有 [${onlyLight.join(", ")}]，仅深色有 [${onlyDark.join(", ")}]`,
    );
  }
}

/** 主题包覆盖的 token 总数（用于设置页与自检展示）。 */
export function everforestTokenCount(): number {
  return Object.keys(everforestZCodeTokens("dark", "soft")).length;
}

/**
 * Markdown 富文本着色角色。
 *
 * 上游 dsh-everforest 除了覆盖 `--dsw-*` token，还单独给 Markdown 正文算了一套
 * 「角色色」：六个标题依次走 Everforest Enchanted 的红 → 橙 → 黄 → 绿 → 蓝 → 紫，
 * 正文强调（粗体/斜体）用紫，行内代码用蓝，内部链接用青，列表符号 / 引用边框 /
 * 分隔线统一用青，表格带底纹与斑马纹用绿染，任务列表复选框用强调色。
 *
 * ZCode 的 `--color-*` token 表里**没有**这些角色（Markdown 标题目前走的是
 * `--color-foreground`），所以单独产出一张「角色键 → 颜色」的表，由扩展层写成
 * 一组成员变量 + 一张静态样式表。
 *
 * 几点刻意的取舍（照搬上游）：
 * 1. **对比度门槛用 3:1 而不是 4.5:1**。浅色主题下 Everforest 的紫 / 蓝 / 青在
 *    奶油色画布（`#FFFBEF`）上到不了 4.5:1，硬守会让六个标题全部塌成正文墨色、
 *    颜色彻底消失。上游自己在浅色下只画到约 2.6:1，这里守到 3:1 已经是
 *    「保住色相」与「可读」之间的折中。
 * 2. **染色面用 `safeTint` 逐级退回**。表格斑马纹与引用块填充都承载正文，一旦把
 *    `fg.fg` 压到 4.5:1 以下，正文就开始发灰。
 * 3. **行内代码要守两个背景**。ZCode 的行内代码是
 *    `bg-markdown-inline-code/50`（`message.tsx` 里的 class），也就是 `--color-tag`
 *    以 50% 透明度叠在画布上；只按 `--color-tag` 实色守会偏乐观。
 */
export function everforestMarkdownRoles(
  scheme: Scheme,
  strength: Strength,
): Readonly<Record<string, string>> {
  const context = createContext(scheme, strength);
  const tokens = everforestZCodeTokens(scheme, strength);
  const { fg, ramp, isLight } = context;

  /** 正文墨色：既是对比度守卫要朝之混合的方向，也是 `faint` 之外所有文字的基准。 */
  const ink = fg.fg;
  const canvas = tokens["--color-background"] ?? ramp.bg0;
  // 行内代码的基色必须与 token 表里的 `--color-tag` 完全一致，否则守卫算出的
  // 文字色会与实际落到的面不符（换主题时最容易出现这种漂移）。
  const inlineCodeFill = tokens["--color-tag"] ?? context.surface(3);
  /** 行内代码实际呈现的底：50% 的 tag 叠在画布上。 */
  const inlineCodeChip = mix(canvas, inlineCodeFill, 0.5);

  const band = safeTint(canvas, fg.green, 0.14, ink);
  const zebra = safeTint(canvas, fg.green, 0.06, ink);
  const tableHover = safeTint(canvas, fg.green, 0.1, ink);
  const quoteBg = safeTint(canvas, fg.aqua, 0.08, ink);
  /** 一段 Markdown 文字可能落在哪几个面上：正文、表格底纹/斑马纹/悬停行、引用块。 */
  const textSurfaces = [canvas, band, zebra, tableHover, quoteBg];

  // 列表符号、引用边框、分隔线共用一支青色；它们不承载文字，只需在画布上看得见。
  const decoration = guardTo(fg.aqua, [canvas], 3, ink);

  return Object.freeze({
    h1: guardTo(fg.red, [canvas], 3, ink),
    h2: guardTo(fg.orange, [canvas], 3, ink),
    h3: guardTo(fg.yellow, [canvas], 3, ink),
    h4: guardTo(fg.green, [canvas], 3, ink),
    h5: guardTo(fg.blue, textSurfaces, 3, ink),
    h6: guardTo(fg.purple, textSurfaces, 3, ink),
    emphasis: guardTo(fg.purple, textSurfaces, 3, ink),
    inlineCode: guardTo(fg.blue, [inlineCodeFill, inlineCodeChip], 3, ink),
    link: guardTo(fg.headerAqua, textSurfaces, 3, ink),
    faint: fg.grey2,
    marker: decoration,
    quote: decoration,
    hr: decoration,
    band,
    zebra,
    tableHover,
    quoteBg,
    // 深色下 aqua 在深底上偏暗，改用 blue 更跳；这是上游对暗色的单独处理。
    check: guardTo(isLight ? fg.aqua : fg.blue, textSurfaces, 3, ink),
    /** 复选框里那个对勾的颜色：直接取画布色，形成「挖空」观感。 */
    checkInk: ramp.bg0,
    selection: alpha(fg.aqua, isLight ? 0.28 : 0.32),
  });
}
