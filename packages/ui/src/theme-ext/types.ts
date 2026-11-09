/**
 * 主题扩展层 —— 类型契约。
 *
 * 这一层刻意不依赖 `@zcode/*` 的任何运行时模块，只依赖 DOM：
 * - 目的是让「外观扩展」能作为一个可独立替换的目录随上游升级整体重放
 *   （见同目录 `UPGRADE.md`）；
 * - 所有效果最终都落到 `document.documentElement` 的内联 CSS 自定义属性上，
 *   因此永远不需要改上游的 `styles.css`。
 */

/** 明暗方案。由根元素上的 `dark` class 推导，与 `useTheme.ts` 的 `resolveTheme` 对齐。 */
export type ColorScheme = "light" | "dark";

/** 主题包内的一个变体（Everforest 用它表达 hard/medium/soft 对比强度）。 */
export interface ColorPackVariant {
  /** 变体 id，存进扩展层设置。 */
  readonly id: string;
  /** 默认展示名；UI 层有对应 i18n 时优先用 i18n。 */
  readonly label: string;
}

/**
 * 一个配色主题包。
 *
 * `tokens` 必须对同一 `variantId` 下的 light / dark **返回完全相同的 key 集合**：
 * 内联 CSS 变量在切换明暗时不会自动清空，只在一个方案里出现的 key 会残留。
 * `assertSameTokenKeys()` 可以断言这一点。
 */
export interface ColorPack {
  /** 稳定 id，存进扩展层设置，不可随展示名变化。 */
  readonly id: string;
  /** 默认展示名；UI 层若有 i18n 用 i18n 覆盖。 */
  readonly label: string;
  readonly description: string;
  /** 可选变体；为空表示这个包没有可调项。 */
  readonly variants: readonly ColorPackVariant[];
  readonly defaultVariantId: string;
  /**
   * 某个变体在当前明暗方案下**实际等效**的变体 id。
   *
   * 用途是让「跟随默认」这类变体在界面上说清楚它到底等效成哪一档——用户点了
   * 「跟随默认」之后看到的其实是「强烈」，不写出来会以为设置没生效。
   * 不提供时视为变体 id 就是它自己的等效 id。
   */
  readonly effectiveVariantId?: (scheme: ColorScheme, variantId: string) => string;
  /** 产出「CSS 自定义属性名 → 值」。返回空对象表示「不覆盖，用上游原生样式」。 */
  readonly tokens: (scheme: ColorScheme, variantId: string) => Readonly<Record<string, string>>;
  /** 设置页预览卡片用的色板（画布、表面、正文、以及若干强调色）。 */
  readonly previewColors: (scheme: ColorScheme, variantId: string) => readonly string[];
  /**
   * 可选的 Markdown 富文本着色角色。
   *
   * ZCode 的 `--color-*` token 里没有「标题色 / 强调色 / 行内代码色」，正文全部继承
   * `--color-foreground`。主题包若想给标题、粗体、行内代码、表格底纹上色，就在这里
   * 产出角色色（键见 `markdown.ts` 的 `MARKDOWN_ROLE_KEYS`）。
   *
   * 不提供（或返回空对象）表示「保持原生 Markdown 外观」，扩展层不会注入样式表。
   */
  readonly markdownRoles?: (
    scheme: ColorScheme,
    variantId: string,
  ) => Readonly<Record<string, string>>;
  /**
   * 设置页「对比强度」选择器用的预览色。
   *
   * 返回一组 mini 色条（画布、两级表面、正文、强调色），让用户能直接看出
   * hard/medium/soft 三个档位的差别，而不是只能读文字。
   */
  readonly variantPreview?: (
    scheme: ColorScheme,
    variantId: string,
  ) => readonly string[];
}

/** 字体族设置。空字符串表示「跟随上游默认」。 */
export interface ThemeExtFontSettings {
  readonly uiFontFamily: string;
  readonly codeFontFamily: string;
}

/** 主题扩展层的完整持久化状态。 */
export interface ThemeExtSettings {
  /** 当前配色包 id；`native` 表示 ZCode 原生配色。 */
  readonly colorPackId: string;
  /** 当前配色包变体 id。 */
  readonly colorPackVariantId: string;
  readonly fonts: ThemeExtFontSettings;
}

/**
 * 合并式更新用的补丁类型。
 *
 * 必须把 `fonts` 从 `Partial<ThemeExtSettings>` 里摘掉再单独放宽成部分字段，
 * 否则 `Partial<ThemeExtSettings>` 与 `{ fonts?: Partial<...> }` 求交会把 `fonts`
 * 重新收窄成完整对象，导致「只改界面字体」无法通过类型检查。
 */
export type ThemeExtSettingsPatch = Omit<Partial<ThemeExtSettings>, "fonts"> & {
  readonly fonts?: Partial<ThemeExtFontSettings>;
};

/** 应用一次主题后的结果快照，便于 UI 展示与排查。 */
export interface AppliedThemeSnapshot {
  readonly colorPackId: string;
  readonly colorPackVariantId: string;
  readonly scheme: ColorScheme;
  /** 本次写进根元素内联样式的 token 数量。 */
  readonly tokenCount: number;
  /** 实际生效的界面字体族栈（已含上游兜底栈）。 */
  readonly uiFontFamily: string;
  /** 实际生效的代码字体族栈（已含上游兜底栈）。 */
  readonly codeFontFamily: string;
}
