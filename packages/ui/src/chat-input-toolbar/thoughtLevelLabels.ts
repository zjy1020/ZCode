// 纯展示词表：工作流分享页不可经工具栏组件引入 Desktop 状态和服务。
//
// 词表指向的那几个文案是**语言无关的档位标识**（off / minimal / low / medium / high /
// xhigh / max / ultra），不是可翻译的界面文字：用户看到的必须就是请求里发的那个值，
// 这样他能直接拿去对供应商文档。多语言由 IntlProvider 提供，但两种语言的这些词条
// 刻意写成同一个标识，改它们等于改「显示值 ↔ 请求值」的对应关系，别顺手翻译。
const THOUGHT_LEVEL_LABEL_IDS: Record<string, string> = {
  disabled: "chat.toolbar.thoughtLevel.value.off",
  false: "chat.toolbar.thoughtLevel.value.off",
  no: "chat.toolbar.thoughtLevel.value.off",
  none: "chat.toolbar.thoughtLevel.value.off",
  nothink: "chat.toolbar.thoughtLevel.value.off",
  "no-think": "chat.toolbar.thoughtLevel.value.off",
  no_think: "chat.toolbar.thoughtLevel.value.off",
  off: "chat.toolbar.thoughtLevel.value.off",
  enable: "chat.toolbar.thoughtLevel.value.on",
  enabled: "chat.toolbar.thoughtLevel.value.on",
  on: "chat.toolbar.thoughtLevel.value.on",
  true: "chat.toolbar.thoughtLevel.value.on",
  low: "chat.toolbar.thoughtLevel.value.low",
  minimal: "chat.toolbar.thoughtLevel.value.minimal",
  medium: "chat.toolbar.thoughtLevel.value.medium",
  high: "chat.toolbar.thoughtLevel.value.high",
  "extra-high": "chat.toolbar.thoughtLevel.value.xhigh",
  extra_high: "chat.toolbar.thoughtLevel.value.xhigh",
  xhigh: "chat.toolbar.thoughtLevel.value.xhigh",
  max: "chat.toolbar.thoughtLevel.value.max",
  ultra: "chat.toolbar.thoughtLevel.value.ultra",
};

/**
 * 档位值 → 词条 id；表里没有的值返回 undefined（调用方原样显示 provider 自己的档位名）。
 * 工具条之外也有人要说这个词（工作流的子代理模型），两处必须查同一张表。
 */
export function thoughtLevelLabelId(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  return Object.hasOwn(THOUGHT_LEVEL_LABEL_IDS, normalized)
    ? THOUGHT_LEVEL_LABEL_IDS[normalized]
    : undefined;
}
