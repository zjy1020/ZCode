import { useEffect, useMemo, useState, type HTMLAttributes } from "react";
import type { BundledTheme, ThemedToken } from "shiki";
import {
  getLightweightDiffLineParts,
  LightweightDiffPreview,
} from "@/components/ui/lightweight-diff-preview.js";
import {
  highlightCode,
  shouldUseSyntaxHighlighting,
  type TokenizedCode,
} from "@/lib/shikiHighlighter.js";
import { PREVIEW_SETTLE_MS, useSettledValue } from "@/hooks/useSettledValue.js";
import { logger } from "@/logger.js";
import type { CodePreviewSettings } from "@/store/index.js";

const HIGHLIGHTED_LIGHTWEIGHT_DIFF_MAX_CHARS = 120_000;

export function getHighlightedLightweightDiffLine(line: string) {
  const lineParts = getLightweightDiffLineParts(line);
  return {
    code: lineParts.content,
    marker: lineParts.marker,
  };
}

export function buildHighlightedLightweightDiffCode(lines: readonly string[]): string {
  return lines.map((line) => getHighlightedLightweightDiffLine(line).code).join("\n");
}

function useHighlightedLightweightDiffTokens({
  code,
  language,
  path,
  theme,
}: {
  code: string;
  language: string;
  path?: string;
  theme: BundledTheme;
}) {
  const [tokenizedCode, setTokenizedCode] = useState<TokenizedCode | null>(null);
  // 文件正在被写入时，这段 code 每几百毫秒换一次；不合并的话每次都会重新触发一趟
  // 主线程 Shiki 词法化（大文件是百毫秒级），界面就会被连续占满。
  const settledCode = useSettledValue(code, PREVIEW_SETTLE_MS);

  useEffect(() => {
    setTokenizedCode(null);

    if (!settledCode || settledCode.length > HIGHLIGHTED_LIGHTWEIGHT_DIFF_MAX_CHARS) {
      return;
    }

    const shouldHighlight = shouldUseSyntaxHighlighting(language);
    const startedAt = Date.now();
    let cancelled = false;

    if (shouldHighlight) {
      logger.debug("[HighlightedLightweightDiffPreview] 启动异步 diff 高亮", {
        chars: settledCode.length,
        language,
        path,
        theme,
      });
    }

    const tokenized = highlightCode(settledCode, language, theme, (result) => {
      if (cancelled) {
        return;
      }

      if (shouldHighlight) {
        logger.debug("[HighlightedLightweightDiffPreview] 异步 diff 高亮完成", {
          durationMs: Date.now() - startedAt,
          language,
          path,
          theme,
        });
      }

      setTokenizedCode(result);
    });

    if (tokenized) {
      setTokenizedCode(tokenized);
    }

    return () => {
      cancelled = true;
    };
    // settledCode 已内建延迟：只有内容停下来才会变，因此这里不再需要额外去抖。
  }, [language, path, settledCode, theme]);

  return tokenizedCode;
}

function renderHighlightedLightweightDiffTokens(tokens: readonly ThemedToken[] | undefined) {
  if (!tokens || tokens.length === 0) {
    return null;
  }

  return tokens.map((token, index) => (
    <span
      key={`${index}:${token.content}`}
      style={token.color ? { color: token.color } : undefined}
    >
      {token.content}
    </span>
  ));
}

function HighlightedLightweightDiffCodeLine({
  code,
  tokens,
}: {
  code: string;
  tokens?: readonly ThemedToken[];
}) {
  const tokenNodes = renderHighlightedLightweightDiffTokens(tokens);

  return <>{tokenNodes ?? (code || " ")}</>;
}

export interface HighlightedLightweightDiffPreviewProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> {
  codePreviewSettings: Pick<
    CodePreviewSettings,
    "fontSizePx" | "showLineNumbers" | "wrapLongLines"
  >;
  language: string;
  lines: readonly string[];
  path?: string;
  theme: BundledTheme;
}

export function HighlightedLightweightDiffPreview({
  codePreviewSettings,
  language,
  lines,
  path,
  theme,
  ...props
}: HighlightedLightweightDiffPreviewProps) {
  const highlightCodeText = useMemo(() => buildHighlightedLightweightDiffCode(lines), [lines]);
  const tokenizedCode = useHighlightedLightweightDiffTokens({
    code: highlightCodeText,
    language,
    path,
    theme,
  });

  return (
    <LightweightDiffPreview
      codePreviewSettings={codePreviewSettings}
      data-lightweight-diff-highlight-language={language}
      data-lightweight-diff-highlight-theme={theme}
      data-lightweight-diff-highlighted={tokenizedCode ? "true" : "false"}
      lines={lines}
      renderLineContent={(line, index) => (
        <HighlightedLightweightDiffCodeLine
          code={line.content}
          tokens={tokenizedCode?.tokens[index]}
        />
      )}
      {...props}
    />
  );
}
