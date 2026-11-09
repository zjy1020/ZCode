import { useMemo } from "react";
import { DiffViewer } from "@/components/ui/diff-viewer.js";
import { HighlightedLightweightDiffPreview } from "@/components/ui/highlighted-lightweight-diff-preview.js";
import { useSettledValue } from "@/hooks/useSettledValue.js";
import { inferCodeLanguage } from "@/lib/codeViewer.js";
import { resolveCodePreviewTheme } from "@/lib/codePreviewPreferences.js";
import { getPlainTextPatchFallbackLines } from "@/lib/patchDiffPreview.js";
import type { CodePreviewSettings } from "@/store/index.js";

interface PatchFallbackContentProps {
  patch: string;
  codePreviewSettings: CodePreviewSettings;
  resolvedTheme: "light" | "dark";
  sourcePath?: string;
  sourceTitle?: string;
}

export function PatchFallbackContent({
  patch,
  codePreviewSettings,
  resolvedTheme,
  sourcePath,
  sourceTitle,
}: PatchFallbackContentProps) {
  // 正在被写入的文件，patch 文本会连续刷新；这里只对「停下来之后」的那一份做
  // 行重建 / 语言推断 / 渲染，避免每次写入都整份重算（主线程 Shiki + diffs Shadow DOM）。
  // 首次打开仍然立刻拿到内容，只有后续连续变化才被合并（见 useSettledValue）。
  const settledPatch = useSettledValue(patch);
  const plainTextFallbackLines = useMemo(
    () => getPlainTextPatchFallbackLines(settledPatch),
    [settledPatch],
  );
  const highlightPath = sourcePath ?? sourceTitle;
  const highlightLanguage = useMemo(
    () => inferCodeLanguage(highlightPath, settledPatch),
    [highlightPath, settledPatch],
  );
  const highlightTheme =
    resolvedTheme === "dark" ? codePreviewSettings.darkTheme : codePreviewSettings.lightTheme;

  if (plainTextFallbackLines) {
    // @pierre/diffs 的 PatchDiff 只支持单文件 patch。日志里出现过多文件
    // patch 直接进入右侧预览，生产包渲染阶段会抛错并卡住侧栏，所以这里统一降级成轻量 diff。
    // edit 打开的右侧 Diff 对新增/删除文件也会走这条轻量 fallback；之前只渲染纯文本，
    // 导致 HTML/TS 等文件在右侧失去语法高亮。这里复用异步 Shiki 高亮，保留不卡顿的轻量渲染路径。
    return (
      <HighlightedLightweightDiffPreview
        className="h-full"
        codePreviewSettings={codePreviewSettings}
        data-patch-plain-text-preview
        language={highlightLanguage}
        lines={plainTextFallbackLines}
        path={highlightPath}
        theme={highlightTheme}
      />
    );
  }

  return (
    <DiffViewer
      patch={settledPatch}
      diffClassName="block"
      fontSizePx={codePreviewSettings.fontSizePx}
      lightTheme={resolveCodePreviewTheme("light", codePreviewSettings)}
      darkTheme={resolveCodePreviewTheme("dark", codePreviewSettings)}
      themeType={resolvedTheme}
    />
  );
}
