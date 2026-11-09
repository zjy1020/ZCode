import { type ReactNode, useEffect, useMemo } from "react";
import {
  WorkerPoolContextProvider,
  useWorkerPool,
  type WorkerInitializationRenderOptions,
} from "@pierre/diffs/react";
import { createDiffsWorkerHighlighterOptions } from "@/lib/diffsHighlighterEngine.js";
import { useCodeThemeRevision } from "@/hooks/useCodeThemeRevision.js";
import { logger } from "@/logger.js";
import { DEFAULT_CODE_PREVIEW_SETTINGS } from "@/store/index.js";
import { useZCodeStore } from "@/store/StoreProvider.js";

function createDiffsWorker(): Worker {
  return new Worker(new URL("../workers/diffs.worker.ts", import.meta.url), {
    type: "module",
    name: "zcode-diffs-worker",
  });
}

function resolveWorkerPoolSize(): number {
  if (typeof navigator === "undefined") {
    return 2;
  }

  const hardwareConcurrency = navigator.hardwareConcurrency;
  if (!Number.isFinite(hardwareConcurrency) || hardwareConcurrency <= 0) {
    return 2;
  }

  return Math.max(1, Math.min(4, Math.floor(hardwareConcurrency / 2)));
}

function WorkerRenderOptionsSync({
  highlighterOptions,
}: {
  highlighterOptions: WorkerInitializationRenderOptions;
}) {
  const workerPool = useWorkerPool();

  useEffect(() => {
    if (!workerPool) {
      return;
    }

    void workerPool
      .setRenderOptions({
        theme: highlighterOptions.theme,
        lineDiffType: highlighterOptions.lineDiffType,
        maxLineDiffLength: highlighterOptions.maxLineDiffLength,
        tokenizeMaxLineLength: highlighterOptions.tokenizeMaxLineLength,
        useTokenTransformer: highlighterOptions.useTokenTransformer,
      })
      .catch((error: unknown) => {
        logger.warn("[DiffsWorkerPoolProvider] 同步渲染参数失败", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }, [highlighterOptions, workerPool]);

  return null;
}

export function DiffsWorkerPoolProvider({ children }: { children: ReactNode }) {
  const codePreviewSettings = useZCodeStore(
    (state) => state.codePreviewSettings ?? DEFAULT_CODE_PREVIEW_SETTINGS,
  );
  // 外观扩展层接管代码配色时，主题名恒定、只有 CSS 变量变，所以光看设置值重算不出来；
  // 修订号一变就重建 options，`WorkerRenderOptionsSync` 会把新的渲染参数同步给 worker。
  const codeThemeRevision = useCodeThemeRevision();

  const highlighterOptions = useMemo<WorkerInitializationRenderOptions>(
    () =>
      createDiffsWorkerHighlighterOptions({
        lightTheme: codePreviewSettings.lightTheme,
        darkTheme: codePreviewSettings.darkTheme,
      }),
    [codePreviewSettings.darkTheme, codePreviewSettings.lightTheme, codeThemeRevision],
  );

  const poolSize = useMemo(() => resolveWorkerPoolSize(), []);
  const canUseWorkerPool = typeof window !== "undefined" && typeof Worker !== "undefined";

  if (!canUseWorkerPool) {
    return <>{children}</>;
  }

  return (
    <WorkerPoolContextProvider
      poolOptions={{
        workerFactory: createDiffsWorker,
        poolSize,
      }}
      highlighterOptions={highlighterOptions}
    >
      <WorkerRenderOptionsSync highlighterOptions={highlighterOptions} />
      {children}
    </WorkerPoolContextProvider>
  );
}
