/**
 * 主题扩展层 —— 纯色彩数学。
 *
 * 移植自 DeepSeek Harness 主题插件 `dsh-everforest@1.4.0` 的 `src/color.js`
 * （MIT，作者 FormalistBlue）。这里只保留与调色板数据无关的换算函数：
 * `#hex` 与通道互转、混色、色阶插值、WCAG 对比度、CIE L*。
 *
 * 约定与上游一致：所有颜色入参都是 CSS hex 字符串（`#rgb` / `#rgba` /
 * `#rrggbb` / `#rrggbbaa`，大小写不敏感），缺省 alpha 视为 1。
 *
 * 为什么不直接依赖上游：上游是 cordis 插件，运行面与本仓库无关；把数学层
 * 抄过来放进扩展层，上游升级时只需对照 `UPGRADE.md` 重放一次即可。
 */

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export type Rgba = {
  /** 0-255 */
  r: number;
  /** 0-255 */
  g: number;
  /** 0-255 */
  b: number;
  /** 0-1 */
  a: number;
};

/** 是否为语法合法的 CSS hex 颜色。 */
export function isHex(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value);
}

/** 展开 hex 为通道。语法不合法直接抛错（上游同样语义，便于测试定位）。 */
export function hexToRgb(hex: string): Rgba {
  if (!isHex(hex)) throw new TypeError(`hexToRgb: not a hex colour: ${String(hex)}`);
  let digits = hex.slice(1);
  if (digits.length === 3 || digits.length === 4) {
    digits = digits
      .split("")
      .map((char) => char + char)
      .join("");
  }
  const r = parseInt(digits.slice(0, 2), 16);
  const g = parseInt(digits.slice(2, 4), 16);
  const b = parseInt(digits.slice(4, 6), 16);
  const a = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

/** 通道转 hex；不透明输出 `#rrggbb`，带 alpha 输出 `#rrggbbaa`。 */
export function rgbToHex(rgba: Rgba): string {
  const channel = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(value)));
  const hex = (value: number) => channel(value, 255).toString(16).padStart(2, "0");
  const a = channel(rgba.a * 255, 255);
  return `#${hex(rgba.r)}${hex(rgba.g)}${hex(rgba.b)}${a === 255 ? "" : hex(a)}`;
}

/** 替换 alpha 通道，始终返回 8 位 hex。 */
export function alpha(hex: string, ratio: number): string {
  if (typeof ratio !== "number" || Number.isNaN(ratio)) {
    throw new TypeError(`alpha: ratio must be a number, got ${String(ratio)}`);
  }
  const { r, g, b } = hexToRgb(hex);
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  const a = Math.round(Math.max(0, Math.min(1, ratio)) * 255);
  return `#${channel(r)}${channel(g)}${channel(b)}${channel(a)}`;
}

/**
 * 双色混合，`t = 0` 返回 `a`，`t = 1` 返回 `b`。
 * 逐通道在 sRGB 内插（与 CSS `color-mix` 的 sRGB 模型一致），含 alpha 通道。
 */
export function mix(a: string, b: string, t: number): string {
  if (typeof t !== "number" || Number.isNaN(t)) {
    throw new TypeError(`mix: t must be a number, got ${String(t)}`);
  }
  const from = hexToRgb(a);
  const to = hexToRgb(b);
  const ratio = Math.max(0, Math.min(1, t));
  const channel = (x: number, y: number) => Math.round(x + (y - x) * ratio);
  return rgbToHex({
    r: channel(from.r, to.r),
    g: channel(from.g, to.g),
    b: channel(from.b, to.b),
    a: from.a + (to.a - from.a) * ratio,
  });
}

export type RampStop = { t: number; color: string };

/**
 * 折线插值色阶。`stops` 必须按 `t` 升序（0-1）；低于首站 / 高于末站钳制到端点。
 */
export function interpolateRamp(stops: readonly RampStop[], t: number): string {
  if (!Array.isArray(stops) || stops.length === 0) {
    throw new TypeError("interpolateRamp: stops must be a non-empty array");
  }
  if (typeof t !== "number" || Number.isNaN(t)) {
    throw new TypeError(`interpolateRamp: t must be a number, got ${String(t)}`);
  }
  if (t <= stops[0].t) return rgbToHex(hexToRgb(stops[0].color));
  const last = stops[stops.length - 1];
  if (t >= last.t) return rgbToHex(hexToRgb(last.color));
  for (let i = 1; i < stops.length; i++) {
    const right = stops[i];
    if (t > right.t) continue;
    const left = stops[i - 1];
    const span = right.t - left.t;
    if (span === 0) return rgbToHex(hexToRgb(right.color));
    return mix(left.color, right.color, (t - left.t) / span);
  }
  return rgbToHex(hexToRgb(last.color));
}

/** WCAG 2.x 相对亮度（忽略 alpha，半透明色请先合成）。 */
export function relativeLuminance(color: string): number {
  const { r, g, b } = hexToRgb(color);
  const linear = (value: number) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2.x 对比度（1-21）。 */
export function contrastRatio(foreground: string, background: string): number {
  const one = relativeLuminance(foreground);
  const two = relativeLuminance(background);
  const lighter = Math.max(one, two);
  const darker = Math.min(one, two);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * CIE L*（0-100）：CIELAB 的感知明度，由 WCAG 相对亮度推导，忽略 alpha。
 * 用在"两个面必须差出最小感知步长"而 WCAG 比值看不出来的场合。
 */
export function labLightness(color: string): number {
  const y = relativeLuminance(color);
  // CIE 1976：线性段以上（Y > (6/29)^3）取 L* = 116·Y^(1/3) − 16。
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
}

/**
 * 某颜色是否在**每一个**给定背景上都达到目标对比度。
 *
 * 用「全部背景」而不是「最坏的背景」来判定，是因为调用方拿到的是「这段文字可能
 * 落在哪几个面上」的清单：Markdown 正文既可能在画布上，也可能在带底纹的表格里，
 * 或者引用块的浅色填充上。只有全部达标才算安全。
 */
export function meetsContrast(
  color: string,
  backgrounds: readonly string[],
  target: number,
): boolean {
  return backgrounds.every((background) => contrastRatio(color, background) >= target);
}

/**
 * 把颜色朝 `ink` 方向逐步混合，直到它在所有 `backgrounds` 上达到目标对比度。
 *
 * 这是「文字色守卫」：浅色主题下 Everforest 的强调色（紫 / 蓝 / 青）在奶油色画布上
 * 只有 2.6:1 左右，直接用会糊成一片。朝墨色混合能保住色相、只压亮度，比换成灰色
 * 或直接用墨色更接近上游 Enchanted 的观感。
 *
 * 返回**第一个达标**的步进值（最小改动量）；一直不达标则返回最后一次的候选值，
 * 也就是接近 `ink` 的深色，而不是原色——宁可变成正文色也不要留下不可读的彩色。
 */
export function guardTo(
  color: string,
  backgrounds: readonly string[],
  target: number,
  ink: string,
  maxSteps = 50,
): string {
  const surfaces = backgrounds.length > 0 ? backgrounds : [ink];
  if (meetsContrast(color, surfaces, target)) return color;
  let candidate = color;
  for (let step = 1; step <= maxSteps; step += 1) {
    candidate = mix(color, ink, step / maxSteps);
    if (meetsContrast(candidate, surfaces, target)) return candidate;
  }
  return candidate;
}

/**
 * 在一个面上叠一层强调色染色，并保证 `labelInk` 在该面上仍然达到 4.5:1。
 *
 * 染色权重是「上限」而不是「目标值」：表格斑马纹、引用块填充这类面承载正文，
 * 一旦把 `label-primary` 压到 4.5:1 以下，正文就开始发灰。所以从请求的权重开始，
 * 逐级退回更浅的染色，取第一个仍然达标的层级。
 */
export function safeTint(
  surface: string,
  accent: string,
  weight: number,
  labelInk: string,
  target = 4.5,
  step = 0.06,
  maxSteps = 40,
): string {
  let candidate = mix(surface, accent, weight);
  if (contrastRatio(labelInk, candidate) >= target) return candidate;
  for (let index = 1; index <= maxSteps; index += 1) {
    candidate = mix(candidate, surface, step);
    if (contrastRatio(labelInk, candidate) >= target) return candidate;
  }
  return surface;
}
