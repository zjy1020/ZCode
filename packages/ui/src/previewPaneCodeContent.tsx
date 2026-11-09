import type { BundledLanguage } from "shiki";
import type { Ref, UIEventHandler } from "react";
import { cn } from "@/components/lib/utils.js";
import { MermaidBlock } from "@/components/ai-elements/mermaid-block.js";
import { CodeViewer } from "@/components/ui/code-viewer.js";
import type { CodeCommentLabels } from "@/components/ui/code-viewer.js";
import type { CodePreviewSettings } from "@/store/index.js";
import type { CodePreviewThemeName } from "@/lib/codePreviewPreferences.js";
import type { CodeCommentPreview, CodeCommentRange } from "@/lib/codeCommentContext.js";
import { isMermaidLanguage } from "@/lib/mermaidLanguage.js";
import { useSettledValue } from "@/hooks/useSettledValue.js";
import type { Theme } from "@/useTheme.js";

interface CodeContentProps {
  code: string;
  language: BundledLanguage;
  codePreviewSettings: CodePreviewSettings;
  codeTheme: CodePreviewThemeName;
  /** 应用主题（store 耦合剥离）：透传给 Mermaid 预览，缺省按 "system" 兜底。 */
  theme?: Theme;
  wrapLongLines: boolean;
  firstLineNumber?: number;
  comments?: readonly CodeCommentPreview[];
  topComment?: CodeCommentPreview | null;
  topCommentShowRange?: boolean;
  topCommentNotice?: string;
  focusedRange?: CodeCommentRange | null;
  focusRequestId?: string;
  enableLineSelection?: boolean;
  enableGutterUtility?: boolean;
  labels?: Partial<CodeCommentLabels>;
  onSubmitCodeComment?: (params: {
    range: CodeCommentRange;
    selectedText: string;
    comment: string;
  }) => void;
  onDeleteCodeComment?: (commentId: string) => void;
  onScroll?: UIEventHandler<HTMLDivElement>;
  scrollContainerRef?: Ref<HTMLDivElement>;
  className?: string;
}

export function CodeContent({
  code,
  language,
  codePreviewSettings,
  codeTheme,
  theme,
  wrapLongLines,
  firstLineNumber,
  comments,
  topComment,
  topCommentShowRange,
  topCommentNotice,
  focusedRange,
  focusRequestId,
  enableLineSelection = false,
  enableGutterUtility = false,
  labels,
  onSubmitCodeComment,
  onDeleteCodeComment,
  onScroll,
  scrollContainerRef,
  className,
}: CodeContentProps) {
  // 预览面板里的文件可能正在被写入 / 被 Agent 反复改写：内容一变，@pierre/diffs 就要重建
  // 整份 Shadow DOM（千行级）并重新词法化。只渲染「停下之后」的那一版，避免连续重算把
  // 主线程占满；首次打开依旧立刻产出内容，不会多等一个窗口。
  const settledCode = useSettledValue(code);

  if (isMermaidLanguage(language)) {
    return (
      <div
        ref={scrollContainerRef}
        className={cn("h-full w-full overflow-auto bg-background p-4", className)}
        onScroll={onScroll}
      >
        <MermaidBlock
          code={settledCode}
          theme={theme}
          className="min-h-full rounded-xl border border-border"
        />
      </div>
    );
  }

  return (
    <CodeViewer
      code={settledCode}
      language={language}
      showLineNumbers={codePreviewSettings.showLineNumbers}
      theme={codeTheme}
      wrapLongLines={wrapLongLines}
      fontSizePx={codePreviewSettings.fontSizePx}
      firstLineNumber={firstLineNumber}
      comments={comments}
      topComment={topComment}
      topCommentShowRange={topCommentShowRange}
      topCommentNotice={topCommentNotice}
      focusedRange={focusedRange}
      focusRequestId={focusRequestId}
      enableLineSelection={enableLineSelection}
      enableGutterUtility={enableGutterUtility}
      labels={labels}
      onSubmitCodeComment={onSubmitCodeComment}
      onDeleteCodeComment={onDeleteCodeComment}
      onScroll={onScroll}
      scrollContainerRef={scrollContainerRef}
      className={className}
    />
  );
}
