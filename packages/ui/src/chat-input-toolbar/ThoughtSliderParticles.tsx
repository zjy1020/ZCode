import { useEffect, useRef } from "react";

/**
 * 思考强度滑块的星尘层。
 *
 * 视觉移植自上游 dsh-better-reasoning-effort 的 canvas 粒子（MIT）：像素块铺底、
 * 填充前沿的椭圆辉光、横向流动的拖尾丝带三段合成。颜色不写死在组件里，而是从
 * `--composer-thought-particle-rgb` 读，因此浅色与深色各自取色，主题切换后重绘。
 *
 * 与上游的三处差异，都是为了本仓库的功耗与可判据约束：
 * 1. 页面不可见时停帧（上游会继续空转）；
 * 2. `prefers-reduced-motion` 只画一帧，不做持续动画；
 * 3. 画布尺寸变化与主题类变化都不重建 canvas，只重算一次缓存值。
 */

/** DPR 上限：与上游一致，避免高分辨率屏把粒子画成噪声。 */
const MAX_DPR = 2;
/** 像素块边长（CSS px）。 */
const PIXEL_STEP = 4;
/** 拖尾丝带条数。 */
const RIBBON_COUNT = 14;
/** 变量缺失或不可解析时的兜底粒子色。 */
const FALLBACK_PARTICLE_RGB: readonly [number, number, number] = [58, 132, 220];

type ParticleRgb = readonly [number, number, number];

function readParticleRgb(element: HTMLElement): ParticleRgb {
  const raw = getComputedStyle(element).getPropertyValue("--composer-thought-particle-rgb");
  const values = raw.split(",").map((part) => Number.parseFloat(part.trim()));
  const red = values[0];
  const green = values[1];
  const blue = values[2];
  if (red === undefined || green === undefined || blue === undefined)
    return FALLBACK_PARTICLE_RGB;
  if (!Number.isFinite(red) || !Number.isFinite(green) || !Number.isFinite(blue))
    return FALLBACK_PARTICLE_RGB;
  return [red, green, blue];
}

export function ThoughtSliderParticles({
  progress,
  enabled,
}: {
  /** 当前填充百分比（0–100），与滑块的视觉进度一致。 */
  progress: number;
  /** 关闭时整层不绘制，避免禁用态还在跑动画。 */
  enabled: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let width = 0;
    let height = 0;
    let rgb = readParticleRgb(canvas);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const paint = (elapsedMs: number) => {
      if (width <= 0 || height <= 0) return;
      const phase = elapsedMs / 1000;
      const filledWidth = (progressRef.current / 100) * width;
      context.clearRect(0, 0, width, height);

      // 像素块：整条轨道铺一层稀疏星尘，已填充区域更亮，让进度一眼可读。
      for (let x = 0; x < width; x += PIXEL_STEP) {
        const insideFill = x <= filledWidth;
        for (let y = 0; y < height; y += PIXEL_STEP) {
          const wave = Math.sin(phase * 2.1 + x * 0.09 + y * 0.7) * 0.5 + 0.5;
          const sparkle = Math.sin(phase * 3.7 + x * 0.31 - y * 0.53) * 0.5 + 0.5;
          const alpha = Math.min(0.92, (insideFill ? 0.3 : 0.1) + wave * 0.26 + sparkle * 0.18);
          context.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha.toFixed(3)})`;
          context.fillRect(x, y, PIXEL_STEP - 1, PIXEL_STEP - 1);
        }
      }

      // 头部辉光：贴着填充前沿的椭圆脉冲，与 CSS 光斑叠在一起形成光源感。
      const headX = Math.max(0, Math.min(width, filledWidth));
      if (headX > 0) {
        const pulse = 0.82 + Math.sin(phase * 2.6) * 0.18;
        const radius = Math.max(18, width * 0.16);
        const glow = context.createRadialGradient(headX, height / 2, 0, headX, height / 2, radius);
        glow.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${(0.5 * pulse).toFixed(3)})`);
        glow.addColorStop(0.45, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${(0.2 * pulse).toFixed(3)})`);
        glow.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
        context.fillStyle = glow;
        context.fillRect(0, 0, width, height);
      }

      // 拖尾丝带：横向流动的细线，给填充区一点速度感。
      const travelTick = phase * 90;
      for (let index = 0; index < RIBBON_COUNT; index += 1) {
        const y = ((index + 0.5) / RIBBON_COUNT) * height;
        const travel = (travelTick * (1 + (index % 4) * 0.18) + index * 53) % Math.max(1, width);
        const length = width * (0.12 + (index % 3) * 0.05);
        const tail = context.createLinearGradient(travel - length, 0, travel, 0);
        tail.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
        tail.addColorStop(0.7, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.28)`);
        tail.addColorStop(1, "rgba(255, 255, 255, 0.5)");
        context.strokeStyle = tail;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(travel - length, y);
        context.lineTo(travel, y);
        context.stroke();
      }
    };

    const stop = () => {
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const step = (timestamp: number) => {
      frame = requestAnimationFrame(step);
      paint(timestamp);
    };

    const start = () => {
      stop();
      if (reducedMotion.matches) {
        // 降低动态效果时只留一帧静态星尘，不做持续动画。
        paint(0);
        return;
      }
      if (document.visibilityState !== "visible") return;
      frame = requestAnimationFrame(step);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    const handleReducedMotion = () => {
      start();
    };
    const handleResize = () => {
      resize();
      if (!frame) paint(0);
    };

    resize();
    start();

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(canvas);
    // 主题切换会换掉根元素上的类，粒子色要跟着重算；否则组件要每帧读样式。
    const themeObserver = new MutationObserver(() => {
      rgb = readParticleRgb(canvas);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("visibilitychange", handleVisibility);
    reducedMotion.addEventListener("change", handleReducedMotion);

    return () => {
      stop();
      resizeObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      reducedMotion.removeEventListener("change", handleReducedMotion);
    };
  }, [enabled]);

  return <canvas ref={canvasRef} aria-hidden="true" className="composer-thought-canvas" />;
}
