import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { CheckIcon, ChevronRightIcon, Loader2Icon, Pencil, RefreshCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import type { ProviderModelListItem, ProviderModelListResult } from "@zcode/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.js";
import { Input } from "@/components/ui/input.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { ModelConfigObject } from "@zcode/provider";
import {
  createProviderModelDraftValues,
  type ProviderModelDraftValues,
  type ProviderModelDraftCommitResult,
} from "@/settings/model-provider-section/ProviderModelMetadata.js";
import type { ProviderSettingsFormModel } from "@/lib/providerSettingsFormTypes.js";
import {
  modelDraftOverrides,
  projectModelDraft,
} from "@/settings/model-provider-section/ProviderModelDraftState.js";
import { isImeComposingKeyEvent } from "@/lib/imeComposition.js";
import { TECHNICAL_INPUT_ATTRIBUTES } from "@/lib/technicalInputAttributes.js";
import {
  ProviderModelMetadataDialogActions,
  ModelSmartConfigSwitch,
  ModelConfigDraftFeedback,
  ModelConfigRestoreButton,
} from "@/settings/model-provider-section/ProviderModelMetadataDialogActions.js";
import { modelEditorControlStyle } from "@/settings/model-provider-section/modelEditorControlStyle.js";
import { cn } from "@/components/lib/utils.js";
import { ModelSettingsGroup } from "@/settings/model-provider-section/ProviderModelSettingsGroups.js";
import {
  ModelParamsDisclosure,
  ProviderModelParamsFields,
} from "@/settings/model-provider-section/ProviderModelParamsFields.js";

/**
 * 批量添加时，每个模型可以各自带一份完整草稿。
 *
 * draft 是「用户显式改过的字段」，宿主把它叠在自己的推荐基线之上再提交，不传即完全
 * 沿用推荐配置。之所以带整份草稿而不只是「上下文窗口 / 最大输出」两个字符串，是因为
 * 行内展开的「高级配置」（模态、能力、推理档位）也要能跟着落盘——提交链路本来就是
 * `resolveProviderModelDraftCommit`，多带字段不增加任何新的校验分支。
 */
export interface ProviderModelBatchItemInput {
  readonly modelId: string;
  readonly draft?: Partial<ProviderModelDraftValues>;
}

/** 复刻 ProviderCardSections 的 createEmptyModel，仅用于给「行草稿」当投影基底。 */
function createRowBaseModel(
  modelId: string,
  inheritedConfig: ModelConfigObject,
): ProviderSettingsFormModel {
  return {
    kind: "candidate",
    modelId,
    builtin: false,
    personalConfig: {},
    config: inheritedConfig,
    inheritedConfig,
    hasPersonalConfig: false,
    executable: false,
    selectable: false,
  };
}

/** 行草稿必须先投影：推理档位编辑器的候选项来自 optionSpecs，不投影就是一片空白。 */
function buildRowDraft(
  modelId: string,
  inheritedConfig: ModelConfigObject,
): ProviderModelDraftValues {
  const baseModel = createRowBaseModel(modelId, inheritedConfig);
  return projectModelDraft(createProviderModelDraftValues(baseModel), baseModel);
}

export function ProviderModelMetadataDialog({
  mode = "edit",
  open,
  draft,
  draftErrorMessage,
  draftErrorField,
  personalConfig,
  overrideFields,
  inheritedConfig,
  onOpenChange,
  onDraftChange,
  onRestore,
  onCommit,
  modelConfigResolutionPending = false,
  modelIdReadOnly = false,
  saving = false,
  modelDefaultsLoaded = false,
  onModelIdBlur,
  onFetchModels,
  onAddModels,
  onResolveModelConfig,
  existingModelIds,
}: {
  mode?: "add" | "edit";
  open: boolean;
  draft: ProviderModelDraftValues;
  draftErrorMessage: string | null;
  draftErrorField?: Extract<ProviderModelDraftCommitResult, { status: "invalid" }>["field"] | null;
  personalConfig?: ModelConfigObject;
  overrideFields?: ReadonlySet<string>;
  inheritedConfig?: ModelConfigObject;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (patch: Partial<ProviderModelDraftValues>) => void;
  onRestore?: () => void;
  onCommit: () => boolean | Promise<boolean>;
  modelConfigResolutionPending?: boolean;
  modelIdReadOnly?: boolean;
  saving?: boolean;
  modelDefaultsLoaded?: boolean;
  onModelIdBlur?: () => void;
  /**
   * 从供应商上游拉取可选模型列表；只在「新增」且宿主提供了该能力时渲染入口。
   * 用户因此不必背 model id，点一下就能填进来。
   */
  onFetchModels?: () => Promise<ProviderModelListResult>;
  /**
   * 顺序批量添加模型；只在宿主装配了这条链路时渲染批量入口（渐进增强）。
   * 不复用 onDraftChange：批量必须走真正的保存通道，而不是反复改写同一行草稿。
   * 返回 added/failed 由对话框汇总提示；宿主也可以返回 void，此时按「全部成功」处理。
   */
  onAddModels?: (
    items: readonly ProviderModelBatchItemInput[],
  ) => Promise<{ added: number; failed: string[]; skipped?: string[] } | void>;
  /**
   * 取某个候选模型的推荐基线（`resolveModelConfig` 的 inheritedConfig）。
   *
   * 只在批量清单里「展开某一行参数」时才调用：推理档位候选项、上下文/最大输出的
   * placeholder 都来自这份基线，缺了它展开区就是空的。宿主不提供时行内只显示两个
   * 数字输入框（仍可提交，宿主自己会解析），不会报错。
   */
  onResolveModelConfig?: (modelId: string) => Promise<ModelConfigObject>;
  /**
   * 这个供应商下已经加过的模型 id。
   *
   * 候选清单里有它，就必须标成「已添加」且不可勾选 —— 否则用户会把同一个模型再加一遍，
   * 拿到一个「N 个失败」而完全不知道错在哪（失败原因是「已经存在」，不是他做了什么错事）。
   */
  existingModelIds?: readonly string[];
}) {
  const { intl } = useZCodeIntl();
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [fetchedModels, setFetchedModels] = useState<readonly ProviderModelListItem[] | null>(null);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchModelsMessage, setFetchModelsMessage] = useState<{
    text: string;
    /** hint 是「上游没有这个接口 / 缺 Key」这类正常分支，用弱化色而不是报错红。 */
    tone: "hint" | "error";
  } | null>(null);
  // 勾选集合只服务于「一次添加多个」：chip 点击仍然照旧把 id 填进当前编辑行，
  // 所以勾选态必须独立于 draft.idValue 存在，否则多选和「正在编辑的那一行」会互相覆盖。
  const [selectedModelIds, setSelectedModelIds] = useState<readonly string[]>([]);
  const [addingSelectedModels, setAddingSelectedModels] = useState(false);
  // 候选列表的筛选词独立存在，**绝不能复用 draft.idValue**：ID 输入框回答的是
  // 「我要加哪个模型」，而点候选行会把 ID 填进那个输入框；两者共用一份值，列表刚点完
  // 就会把自己筛得只剩一条 —— 用户看到的现象正是「加了第一个模型之后就加不了第二个」。
  const [modelFilterValue, setModelFilterValue] = useState("");
  // 同时只展开一行参数：多行同开会让「正在编辑哪一个」失焦，同一屏也会叠出几份几乎
  // 一样的表单。展开即视为勾选（点箭头本来就是为了给这个模型单独调参）。
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  // 每一行的完整草稿与推荐基线；只有真正展开某一行才按需拉基线，
  // 免得一屏几十个候选项各发一次 resolveModelConfig。
  const [batchDrafts, setBatchDrafts] = useState<Record<string, ProviderModelDraftValues>>({});
  const [rowInheritedConfigs, setRowInheritedConfigs] = useState<Record<string, ModelConfigObject>>(
    {},
  );
  const [resolvingModelIds, setResolvingModelIds] = useState<readonly string[]>([]);
  const resetBatchSelection = useCallback(() => {
    setSelectedModelIds([]);
    setBatchDrafts({});
    setRowInheritedConfigs({});
    setResolvingModelIds([]);
    setExpandedModelId(null);
    setModelFilterValue("");
  }, []);
  const updateBatchDraft = useCallback(
    (modelId: string, patch: Partial<ProviderModelDraftValues>) => {
      setBatchDrafts((current) => {
        const base = current[modelId];
        if (!base) {
          return current;
        }
        return { ...current, [modelId]: { ...base, ...patch } };
      });
    },
    [],
  );
  const forgetRow = useCallback((modelId: string) => {
    setBatchDrafts((current) => {
      if (!(modelId in current)) return current;
      const next = { ...current };
      delete next[modelId];
      return next;
    });
    setRowInheritedConfigs((current) => {
      if (!(modelId in current)) return current;
      const next = { ...current };
      delete next[modelId];
      return next;
    });
    setExpandedModelId((current) => (current === modelId ? null : current));
  }, []);
  const handleFetchModels = useCallback(async () => {
    if (!onFetchModels || fetchingModels) {
      return;
    }
    setFetchingModels(true);
    setFetchModelsMessage(null);
    try {
      const result = await onFetchModels();
      if (result.success) {
        // 新的列表可能已经没有上一轮勾选的模型，勾选直接作废，避免批量添加不存在的 id。
        resetBatchSelection();
        setFetchedModels(result.models);
        if (result.models.length === 0) {
          setFetchModelsMessage({
            tone: "hint",
            text: intl.formatMessage({ id: "settings.modelProvider.fetchModelsEmpty" }),
          });
        }
        return;
      }
      setFetchedModels(null);
      resetBatchSelection();
      // 「没这个接口」和「没填 Key」都不是错误，只是需要用户手填，所以按提示色呈现。
      const hintId =
        result.error.code === "unsupported-api-format"
          ? "settings.modelProvider.fetchModelsUnsupported"
          : result.error.code === "missing-credentials"
            ? "settings.modelProvider.fetchModelsMissingCredentials"
            : null;
      setFetchModelsMessage(
        hintId
          ? { tone: "hint", text: intl.formatMessage({ id: hintId }) }
          : { tone: "error", text: result.error.message },
      );
    } catch (error) {
      setFetchedModels(null);
      resetBatchSelection();
      setFetchModelsMessage({
        tone: "error",
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setFetchingModels(false);
    }
  }, [fetchingModels, intl, onFetchModels, resetBatchSelection]);
  const toggleSelectedModel = useCallback(
    (modelId: string) => {
      // 已添加过的模型不给选：重复提交的结局是一句「失败」，而用户根本没做错什么。
      if (existingModelIds?.includes(modelId)) {
        return;
      }
      if (selectedModelIds.includes(modelId)) {
        setSelectedModelIds((current) => current.filter((id) => id !== modelId));
        // 取消勾选顺手收起并丢掉行草稿：留着会变成「没勾选却还带着参数」的半状态，
        // 下次勾回来时悄悄生效。
        forgetRow(modelId);
        return;
      }
      setSelectedModelIds((current) =>
        current.includes(modelId) ? current : [...current, modelId],
      );
    },
    [existingModelIds, forgetRow, selectedModelIds],
  );
  /**
   * 展开某一行的参数面板。展开前先补齐该行的推荐基线：
   * 上下文 / 最大输出的 placeholder 与推理档位候选项都来自它。
   */
  const expandModelRow = useCallback(
    async (modelId: string) => {
      // 展开只对「还没加过的候选」有意义；已添加过的行连参数都不给改（去模型列表里改）。
      if (existingModelIds?.includes(modelId)) {
        return;
      }
      setSelectedModelIds((current) =>
        current.includes(modelId) ? current : [...current, modelId],
      );
      if (expandedModelId === modelId) {
        setExpandedModelId(null);
        return;
      }
      setExpandedModelId(modelId);
      if (batchDrafts[modelId] || !onResolveModelConfig) {
        return;
      }
      setResolvingModelIds((current) =>
        current.includes(modelId) ? current : [...current, modelId],
      );
      try {
        const inheritedConfig = await onResolveModelConfig(modelId);
        setRowInheritedConfigs((current) => ({ ...current, [modelId]: inheritedConfig }));
        setBatchDrafts((current) =>
          current[modelId]
            ? current
            : { ...current, [modelId]: buildRowDraft(modelId, inheritedConfig) },
        );
      } catch (error) {
        setFetchModelsMessage({
          tone: "error",
          text: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setResolvingModelIds((current) => current.filter((id) => id !== modelId));
      }
    },
    [batchDrafts, expandedModelId, onResolveModelConfig],
  );
  const handleAddSelectedModels = useCallback(async () => {
    if (!onAddModels || addingSelectedModels || selectedModelIds.length === 0) {
      return;
    }
    // 点击瞬间快照一次：宿主保存过程中会 rerender，勾选集合与草稿可能已被别的交互改写。
    const modelIds = [...selectedModelIds];
    const items: ProviderModelBatchItemInput[] = modelIds.map((modelId) => {
      // 没展开过的行没有草稿 —— 那就是「全部沿用推荐配置」，宿主自己会解析成基线。
      const rowDraft = batchDrafts[modelId];
      return { modelId, ...(rowDraft ? { draft: rowDraft } : {}) };
    });
    setAddingSelectedModels(true);
    try {
      const result = await onAddModels(items);
      const failed = result?.failed ?? [];
      // 「已经加过」不是失败：宿主认出来会放进 skipped。把它算进失败数是最误导人的一种报法——
      // 用户会拿着一个没做过的事去找自己的错。
      const skipped = result?.skipped ?? [];
      const added = result?.added ?? Math.max(items.length - failed.length - skipped.length, 0);
      const summary: string[] = [];
      if (added > 0) {
        summary.push(
          intl.formatMessage(
            { id: "settings.modelProvider.fetchModelsAddSelectedDone" },
            { count: added },
          ),
        );
      }
      if (skipped.length > 0) {
        summary.push(
          intl.formatMessage(
            { id: "settings.modelProvider.fetchModelsAddSelectedExisting" },
            { count: skipped.length },
          ),
        );
      }
      const text = summary.join("；");
      if (failed.length === 0) {
        // 全部落地（或全是已存在）：这一批没有要重试的东西，清空勾选。
        resetBatchSelection();
        setFetchModelsMessage({ tone: "hint", text });
        return;
      }
      // 部分失败不静默：如实报出成功数、已存在数与失败的 model id，并保留失败项的勾选让用户直接重试。
      // 失败与已存在的 model id 都从勾选里摘掉，避免用户再点一次时把已成功的又提交一遍。
      const keepSet = new Set(failed);
      setSelectedModelIds((current) => current.filter((id) => keepSet.has(id)));
      setBatchDrafts((current) => {
        const next: Record<string, ProviderModelDraftValues> = {};
        for (const [id, values] of Object.entries(current)) {
          if (keepSet.has(id)) {
            next[id] = values;
          }
        }
        return next;
      });
      setRowInheritedConfigs((current) => {
        const next: Record<string, ModelConfigObject> = {};
        for (const [id, inheritedConfig] of Object.entries(current)) {
          if (keepSet.has(id)) {
            next[id] = inheritedConfig;
          }
        }
        return next;
      });
      // 已成功的不再展开，免得用户对着一个已经加好的模型继续改参数。
      setExpandedModelId((current) => (current && keepSet.has(current) ? current : null));
      setFetchModelsMessage({
        tone: "error",
        text: [
          text,
          intl.formatMessage(
            { id: "settings.modelProvider.fetchModelsAddSelectedFailed" },
            { count: failed.length, names: failed.join("，") },
          ),
        ]
          .filter((part) => part.length > 0)
          .join("；"),
      });
    } catch (error) {
      setFetchModelsMessage({
        tone: "error",
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setAddingSelectedModels(false);
    }
  }, [addingSelectedModels, batchDrafts, intl, onAddModels, resetBatchSelection, selectedModelIds]);
  const handleDialogOpenChange = (next: boolean) => {
    // 关闭后重新打开时上一轮的勾选已经过期（模型可能已添加、列表可能已重拉），必须清空。
    // 但批量提交期间宿主会上锁拒绝关闭（此时对话框并没有真的关掉），
    // 那种情况不能清勾选，否则「失败项保留勾选以便重试」的语义就丢了。
    if (!next && !addingSelectedModels) {
      resetBatchSelection();
    }
    onOpenChange(next);
  };
  // 列表自己的筛选框就是筛选器：打了 "claude" 就只看 claude 系列，清空就回到全部。
  // 刻意与模型 ID 输入框分开——那个才是「当前要添加的模型」，被当成筛选词会让列表自噬。
  const visibleFetchedModels = (fetchedModels ?? []).filter((item) => {
    const keyword = modelFilterValue.trim().toLowerCase();
    if (!keyword) {
      return true;
    }
    return (
      item.modelId.toLowerCase().includes(keyword) ||
      (item.displayName?.toLowerCase().includes(keyword) ?? false)
    );
  });
  const commit = async () => {
    const result = await onCommit();
    if (!result) setValidationAttempt((value) => value + 1);
  };
  /*
    「保存」= 保存手填的那一个模型。
    但候选列表摆在那儿、用户一个都没勾、ID 也空着的时候按保存，拿「模型 ID 不能为空」
    回他没有意义 —— 他刚看见一串可选的模型名，缺的是「得先点一个」这一步。这种情形
    直接把下一步指出来，而不是让他对着一个自己以为已经填好的表单反复试。
  */
  const handleSave = () => {
    if (!draft.idValue.trim() && visibleFetchedModels.length > 0 && selectedModelIds.length === 0) {
      setFetchModelsMessage({
        tone: "hint",
        text: intl.formatMessage({ id: "settings.modelProvider.fetchModelsPickFirst" }),
      });
      return;
    }
    void commit();
  };
  const smart = draft.useRecommendedConfigValue !== false;
  const editModelLabel = intl.formatMessage({
    id: "settings.modelProvider.editModel",
  });
  // 新增模型时模型 ID 为空，如果沿用编辑态的上下文窗口自动聚焦，会让用户先落到默认数值字段。
  // 编辑态仍保留上下文窗口自动聚焦和选中，方便直接修改已有模型配置。
  const shouldFocusModelIdInput = mode === "add";
  const shouldFocusContextWindowInput = mode === "edit";
  const addModelConfigResolutionPending = smart && modelConfigResolutionPending;
  const compositionActiveRef = useRef(false);
  const handleTechnicalInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }
    // 输入法候选确认也会发出 Enter。某些 Electron/macOS 版本的
    // nativeEvent.isComposing 会过早恢复 false，因此同时保留本地 composition 状态。
    if (
      isImeComposingKeyEvent({
        compositionActive: compositionActiveRef.current,
        nativeEvent: event.nativeEvent,
      })
    ) {
      return;
    }
    event.preventDefault();
    void commit();
  };
  const handleCompositionStart = () => {
    compositionActiveRef.current = true;
  };
  const handleCompositionEnd = () => {
    compositionActiveRef.current = false;
  };
  // 批量清单是否有可选项：有列表时参数全都挂在行里，底部就不再重复一份手填参数区。
  const showRowParams = visibleFetchedModels.length > 0;
  /**
   * 这个供应商下已经加过的模型 id。
   *
   * 这些行必须一眼看出来「已经有了」并且点不动 —— 用户在这里勾一个已经存在的模型，
   * 结局只有一句「失败」，而他从头到尾没做错任何事，只会当成是自己不会用。
   */
  const existingModelIdSet = new Set(existingModelIds ?? []);
  /**
   * 只有「添加 + 真的拿到了候选模型」这条路径才默认收起参数区：这条路径上用户是先挑模型、
   * 再逐个展开调参，一进来就摊开两个数字输入框会让人以为必须先填它们。
   *
   * 判据是**实际拿到的候选数**而不是「有没有拉取入口」：列表拉空（比如网关说这个 Key
   * 没有可用模型）时用户只能手填 ID，此时参数区若还收着，他连上下文窗口都改不了，
   * 看上去就像「这个对话框根本加不了模型」。
   */
  const paramsCollapsedByDefault = mode === "add" && (fetchedModels?.length ?? 0) > 0;
  // 主按钮是否切成「添加 N 个模型」——只在能批量提交时才切。
  const batchAddMode = Boolean(onAddModels) && selectedModelIds.length > 0;
  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      {mode === "edit" ? (
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 p-0"
            aria-label={editModelLabel}
            title={editModelLabel}
          >
            <Pencil className="size-3.5 text-foreground-subtle" />
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent
        // overflow-hidden 仍允许聚焦触发外层滚动；语言换行后曾滚走标题。仅正文滚动，外框只裁切。
        className="max-h-[min(48rem,calc(100vh-4rem))] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto_auto] overflow-clip"
        data-no-model-drag="true"
      >
        <DialogHeader className="pr-8">
          <DialogTitle className="truncate">
            {intl.formatMessage({
              id:
                mode === "add"
                  ? "settings.modelProvider.addModel"
                  : "settings.modelProvider.editModel",
            })}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {intl.formatMessage({
              id: "settings.modelProvider.editModelDescription",
            })}
          </DialogDescription>
          <ModelSmartConfigSwitch
            disabled={saving}
            checked={smart}
            onChange={(useRecommendedConfigValue) => onDraftChange({ useRecommendedConfigValue })}
          />
        </DialogHeader>
        {/* 保存期间锁定正文交互，不改变原有滚动容器；页脚单独显示提交状态。 */}
        <div
          inert={saving}
          className="min-h-0 min-w-0 -mr-3 space-y-4 overflow-y-auto pr-4"
          data-model-settings-scroll="true"
        >
          <ModelSettingsGroup group="basic">
            <div data-model-identity-row="true" className="flex flex-col gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-ui-base text-foreground-subtle">
                    {intl.formatMessage({ id: "settings.modelProvider.modelId" })}
                  </label>
                  {mode === "add" && onFetchModels ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 rounded-lg text-foreground-subtle"
                      disabled={fetchingModels}
                      onClick={() => {
                        void handleFetchModels();
                      }}
                    >
                      {fetchingModels ? (
                        <Loader2Icon
                          data-icon="inline-start"
                          className="animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <RefreshCcw data-icon="inline-start" aria-hidden="true" />
                      )}
                      {intl.formatMessage({
                        id: fetchingModels
                          ? "settings.modelProvider.fetchModelsLoading"
                          : "settings.modelProvider.fetchModels",
                      })}
                    </Button>
                  ) : null}
                </div>
                <Input
                  {...TECHNICAL_INPUT_ATTRIBUTES}
                  type="text"
                  autoFocus={shouldFocusModelIdInput}
                  size="lg"
                  className={cn("font-mono", modelEditorControlStyle(false))}
                  readOnly={modelIdReadOnly}
                  value={draft.idValue}
                  placeholder={intl.formatMessage({
                    id: "settings.modelProvider.modelId",
                  })}
                  onChange={(event) => {
                    onDraftChange({ idValue: event.target.value });
                  }}
                  onBlur={onModelIdBlur}
                  onCompositionStart={handleCompositionStart}
                  onCompositionEnd={handleCompositionEnd}
                  onKeyDown={handleTechnicalInputKeyDown}
                />
                {fetchModelsMessage ? (
                  <p
                    className={cn(
                      "mt-1 text-ui-sm",
                      fetchModelsMessage.tone === "error"
                        ? "text-destructive"
                        : "text-foreground-subtle",
                    )}
                  >
                    {fetchModelsMessage.text}
                  </p>
                ) : null}
                {showRowParams ? (
                  <div
                    className="mt-2 rounded-lg border border-input-border bg-input p-2"
                    data-fetched-models="true"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-ui-xs text-foreground-subtle">
                        {intl.formatMessage(
                          { id: "settings.modelProvider.fetchModelsCount" },
                          { count: visibleFetchedModels.length },
                        )}
                      </p>
                      {/*
                        筛选框独立于模型 ID 输入框。共用一份值时，点一个候选行会把 ID 写进
                        输入框，列表随即按它自筛，只剩刚点的那一条 —— 表现就是「加了第一个
                        模型之后再也选不中第二个」。
                      */}
                      <div className="relative shrink-0">
                        <Search
                          className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-foreground-subtlest"
                          aria-hidden="true"
                        />
                        <Input
                          type="text"
                          size="sm"
                          className="w-40 pl-6"
                          value={modelFilterValue}
                          placeholder={intl.formatMessage({
                            id: "settings.modelProvider.fetchModelsFilterPlaceholder",
                          })}
                          aria-label={intl.formatMessage({
                            id: "settings.modelProvider.fetchModelsFilterPlaceholder",
                          })}
                          data-fetch-models-filter="true"
                          onChange={(event) => setModelFilterValue(event.target.value)}
                        />
                      </div>
                    </div>
                    {/*
                      每个候选项一行：点名字 = 勾选 / 取消（支持多选），点右侧箭头 = 展开这个
                      模型自己的「上下文窗口 / 最大输出 / 高级配置」。参数挂在行上而不是挂在
                      对话框底部，是因为「一次加一批」和「只调一个」本来就不是同一件事。
                    */}
                    <div className="space-y-1">
                      {visibleFetchedModels.map((item) => {
                        const selected = selectedModelIds.includes(item.modelId);
                        const expanded = expandedModelId === item.modelId;
                        const rowDraft = batchDrafts[item.modelId];
                        const resolvingRow = resolvingModelIds.includes(item.modelId);
                        const alreadyAdded = existingModelIdSet.has(item.modelId);
                        return (
                          <div
                            key={item.modelId}
                            className={cn(
                              "rounded-md border",
                              alreadyAdded
                                ? "border-input-border bg-hover/40"
                                : selected
                                  ? "border-[var(--color-brand)]"
                                  : "border-input-border",
                            )}
                            data-fetched-model-row={item.modelId}
                            data-fetched-model-added={alreadyAdded ? "true" : undefined}
                          >
                            {/*
                              整行都是勾选热区。只把「名字」做成按钮时，名字与箭头之间的
                              空白点了没有任何反应，用户会以为「选不了」，然后在空着 ID 的
                              情况下直接去按保存，再被「模型 ID 不能为空」挡回来。
                              aria-pressed 仍挂在里面的按钮上，键盘 Enter/Space 触发的 click
                              会冒泡到这一层，所以键盘操作照旧。
                            */}
                            <div
                              className={cn(
                                "flex items-center gap-2 px-2 py-1.5",
                                alreadyAdded ? "cursor-default" : "cursor-pointer hover:bg-hover",
                              )}
                              onClick={() => toggleSelectedModel(item.modelId)}
                            >
                              <button
                                type="button"
                                className={cn(
                                  "flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-primary",
                                  alreadyAdded ? "cursor-default" : "cursor-pointer",
                                )}
                                aria-pressed={selected}
                                aria-disabled={alreadyAdded}
                                data-selected={selected ? "true" : "false"}
                                title={item.displayName ?? item.modelId}
                              >
                                <span
                                  aria-hidden="true"
                                  className={cn(
                                    "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                                    alreadyAdded
                                      ? "border-[var(--color-brand)] bg-[var(--color-brand)]"
                                      : selected
                                        ? "border-[var(--color-brand)] bg-[var(--color-brand)]"
                                        : "border-input-border",
                                  )}
                                >
                                  {alreadyAdded || selected ? (
                                    <CheckIcon
                                      className="size-3 text-background"
                                      aria-hidden="true"
                                    />
                                  ) : null}
                                </span>
                                {/*
                                  模型名是这一屏的主体信息，原来给的是 text-ui-xs
                                  （正文 -4px，约 9px），比旁边的说明文字还小 —— 直接
                                  用 text-ui-base（正文尺寸），保持等宽好认 ID。
                                */}
                                <span className="min-w-0 truncate font-mono text-ui-base text-foreground">
                                  {item.modelId}
                                </span>
                                {alreadyAdded ? (
                                  <span
                                    className="shrink-0 rounded-full bg-hover px-1.5 py-0.5 text-ui-xs text-foreground-subtle"
                                    data-fetched-model-added-badge="true"
                                  >
                                    {intl.formatMessage({
                                      id: "settings.modelProvider.fetchModelsAlreadyAdded",
                                    })}
                                  </span>
                                ) : null}
                              </button>
                              {/*
                                已经加过的行不给箭头：它的参数该去模型列表里改，
                                在这里展开只会让人以为「又能加一次」。
                              */}
                              {alreadyAdded ? null : (
                                <button
                                  type="button"
                                  className="shrink-0 cursor-pointer rounded-sm p-1 text-foreground-subtle hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                                  aria-expanded={expanded}
                                  aria-label={intl.formatMessage(
                                    { id: "settings.modelProvider.fetchModelsExpandParams" },
                                    { modelId: item.modelId },
                                  )}
                                  data-fetched-model-expand={item.modelId}
                                  onClick={(event) => {
                                    // 必须掐断冒泡：否则点箭头会连带把这一行的勾选翻掉。
                                    event.stopPropagation();
                                    void expandModelRow(item.modelId);
                                  }}
                                >
                                  {resolvingRow ? (
                                    <Loader2Icon
                                      className="size-4 animate-spin"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <ChevronRightIcon
                                      className={cn(
                                        "size-4 transition-transform motion-reduce:transition-none",
                                        expanded && "rotate-90",
                                      )}
                                      aria-hidden="true"
                                    />
                                  )}
                                </button>
                              )}
                            </div>
                            {expanded ? (
                              <div className="border-t border-input-border px-2 pb-2">
                                {rowDraft ? (
                                  <ProviderModelParamsFields
                                    draft={rowDraft}
                                    onDraftChange={(patch) => updateBatchDraft(item.modelId, patch)}
                                    inheritedConfig={rowInheritedConfigs[item.modelId]}
                                    overrideFields={modelDraftOverrides(rowDraft)}
                                    dialogOpen={open}
                                    advancedExpanded
                                    onEnterKeyDown={handleTechnicalInputKeyDown}
                                    onCompositionStart={handleCompositionStart}
                                    onCompositionEnd={handleCompositionEnd}
                                  />
                                ) : (
                                  <p className="px-1 py-2 text-ui-xs text-foreground-subtle">
                                    {intl.formatMessage({ id: "common.loading" })}
                                  </p>
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    {selectedModelIds.length > 0 ? (
                      <p
                        className="mt-2 text-ui-xs text-foreground-subtle"
                        data-selected-models-count="true"
                      >
                        {intl.formatMessage(
                          { id: "settings.modelProvider.fetchModelsSelected" },
                          { count: selectedModelIds.length },
                        )}
                      </p>
                    ) : (
                      <p className="mt-2 text-ui-xs text-foreground-subtlest">
                        {intl.formatMessage({
                          id: "settings.modelProvider.fetchModelsEditorHint",
                        })}
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </ModelSettingsGroup>
          {/*
            手填单个模型时才需要这份参数区：有候选列表时，参数全挂在每一行的右箭头里。
            默认收起——一进「编辑模型」就先看到两个数字输入框，会让人误以为必须先填它们。
          */}
          {showRowParams ? null : (
            <ModelParamsDisclosure
              label={intl.formatMessage({ id: "settings.modelProvider.modelParams" })}
              defaultExpanded={!paramsCollapsedByDefault}
              pending={addModelConfigResolutionPending}
            >
              <ProviderModelParamsFields
                draft={draft}
                onDraftChange={onDraftChange}
                inheritedConfig={inheritedConfig}
                personalConfig={personalConfig}
                overrideFields={overrideFields}
                errorField={draftErrorField}
                validationAttempt={validationAttempt}
                dialogOpen={open}
                autoFocusContextWindow={shouldFocusContextWindowInput}
                onEnterKeyDown={handleTechnicalInputKeyDown}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
              />
            </ModelParamsDisclosure>
          )}
        </div>
        <ModelConfigDraftFeedback error={draftErrorMessage} matched={modelDefaultsLoaded} />
        {/*
          勾选了候选模型之后，主按钮就从「保存这一个」切成「添加这一批」：
          用户的心智是「我选好了，加进去」，不该再让他回头找一个列表里的次要按钮。
        */}
        {batchAddMode ? (
          <ProviderModelMetadataDialogActions
            leadingAction={<ModelConfigRestoreButton disabled={saving} onRestore={onRestore} />}
            saveLabel={intl.formatMessage(
              { id: "settings.modelProvider.fetchModelsAddSelected" },
              { count: selectedModelIds.length },
            )}
            cancelLabel={intl.formatMessage({ id: "common.cancel" })}
            saving={addingSelectedModels}
            saveTestId="model-provider-add-selected-models"
            onSave={() => void handleAddSelectedModels()}
            onCancel={() => onOpenChange(false)}
          />
        ) : (
          <ProviderModelMetadataDialogActions
            leadingAction={<ModelConfigRestoreButton disabled={saving} onRestore={onRestore} />}
            saveLabel={intl.formatMessage({ id: "common.save" })}
            cancelLabel={intl.formatMessage({ id: "common.cancel" })}
            saving={saving}
            onSave={handleSave}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
