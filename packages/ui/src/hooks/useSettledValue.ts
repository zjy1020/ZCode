import { useEffect, useRef, useState } from "react";

/**
 * 预览类内容的默认稳定窗口。
 *
 * 250ms 是「连续写入」与「单次打开」之间的折中：首次值立刻生效（见下方实现），
 * 只有后续的连续变化才会被合并，所以打开文件不会感觉延迟，
 * 而正在被写入的文件不会让高亮 / diff 重算几百次。
 */
export const PREVIEW_SETTLE_MS = 250;

/**
 * useSettledValue —— 把「高频变化的值」压成「停下之后的值」。
 *
 * 用途：预览面板里的重活（主线程 Shiki 词法化、@pierre/diffs 的千行 Shadow DOM、
 * 词级 diff）都按内容为键，内容一变就整份重算。文件正在被写入时内容每几百毫秒变一次，
 * 于是重算永远追不上，主线程被反复占满，界面掉到个位数帧。
 *
 * 语义：
 * - **首次渲染立刻返回入参**（`useState(value)` 初值），打开文件不额外等一个窗口；
 * - 之后只有入参静默 `delayMs` 没再变化，才把新值推给重活；
 * - 变化期间返回的是上一个稳定值，因此界面继续展示上一次完成的内容，而不是空白。
 *
 * 与 `useDeferredValue` 的区别：`useDeferredValue` 只让这棵树变成可中断的低优先级渲染，
 * 不减少总工作量；这里是真的少算——连续写入只看最后一份内容。
 */
export function useSettledValue<T>(value: T, delayMs: number = PREVIEW_SETTLE_MS): T {
  const [settled, setSettled] = useState(value);
  const latestRef = useRef(value);
  latestRef.current = value;

  useEffect(() => {
    if (Object.is(settled, value)) {
      return;
    }

    const timer = setTimeout(() => {
      setSettled(latestRef.current);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [delayMs, settled, value]);

  return settled;
}
