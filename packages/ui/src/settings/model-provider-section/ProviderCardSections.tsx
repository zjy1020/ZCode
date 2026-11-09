/* eslint-disable max-lines -- 模型供应商卡片仍在迁移期集中维护多个紧耦合区块，后续拆分时再移除。 */
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import type {
  ProviderSettingsFormProvider,
  ProviderSettingsFormModel,
} from "@/lib/providerSettingsFormTypes.js";
import type { ModelConnectivityResult, ProviderModelListResult } from "@zcode/shared";
import type { ProviderApiType } from "@zcode/provider";
import {
  TID_MODEL_PROVIDER_ADD_MODEL_BUTTON,
  TID_MODEL_PROVIDER_BASE_URL_INPUT,
  TID_MODEL_PROVIDER_MODEL_DELETE_BUTTON,
  TID_MODEL_PROVIDER_MODEL_INPUT,
  TID_MODEL_PROVIDER_NAME_EDIT_BUTTON,
  TID_MODEL_PROVIDER_NAME_INPUT,
  testId,
} from "@zcode/shared/test-ids";
import { InfoIcon, LockKeyholeIcon, Plus, Pencil, Trash2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useServices } from "@/hooks/useServices.js";
import { TECHNICAL_INPUT_ATTRIBUTES } from "@/lib/technicalInputAttributes.js";
import { ApiKeyInput } from "./ApiKeyInput.js";
import { ModelRowInput } from "./ProviderFormControls.js";
import { PresetProviderApiKeyBanner } from "./PresetProviderApiKeyBanner.js";
import {
  createProviderModelDraftValues,
  resolveProviderModelDraftCommit,
  type ProviderModelDraftValues,
} from "@/settings/model-provider-section/ProviderModelMetadata.js";
import {
  ProviderModelMetadataDialog,
  type ProviderModelBatchItemInput,
} from "@/settings/model-provider-section/ProviderModelMetadataDialog.js";
import { projectModelDraft } from "@/settings/model-provider-section/ProviderModelDraftState.js";
import {
  PROVIDER_CONNECTION_API_FORMATS,
  ProviderApiFormatSelect,
  resolveProviderConnectionApiFormatDisplayLabel,
} from "@/settings/model-provider-section/ProviderApiFormatSelect.js";
import { SortableProviderModelList } from "@/settings/model-provider-section/SortableProviderModelList.js";
import { useProviderModelDraft } from "@/settings/model-provider-section/useProviderModelDraft.js";
import { ProviderLogo } from "@/settings/model-provider-section/ProviderLogo.js";
import type { ProviderConfigObject } from "@zcode/provider";

export {
  resolveProviderConnectionApiFormatDisplayLabel,
  resolveProviderConnectionApiFormatOptions,
} from "@/settings/model-provider-section/ProviderApiFormatSelect.js";
export { formatModelContextWindowLabel } from "@/lib/tokenNumberFormat.js";

export function resolveProviderApiFormatOptions(
  _provider: Pick<ProviderSettingsFormProvider, "config" | "models">,
): ProviderApiType[] {
  return [...PROVIDER_CONNECTION_API_FORMATS];
}

export function shouldShowProviderApiFormat(
  _provider: Pick<ProviderSettingsFormProvider, "providerId">,
): boolean {
  return true;
}

export function ProviderCardHeader({
  providerName,
  logo,
  editingName,
  nameValue,
  nameEditable = true,
  onNameChange,
  onNameBlur,
  onNameKeyDown,
  onNameCompositionEnd,
  onNameCompositionStart,
  onStartEditName,
  onDelete,
  actionsVisible = true,
  providerToggle,
}: {
  providerName: string;
  logo?: ProviderConfigObject["logo"];
  editingName: boolean;
  nameValue: string;
  nameEditable?: boolean;
  onNameChange: (value: string) => void;
  onNameBlur: () => void;
  onNameKeyDown: (event: ReactKeyboardEvent) => void;
  onNameCompositionEnd?: () => void;
  onNameCompositionStart?: () => void;
  onStartEditName: () => void;
  onDelete?: () => void;
  actionsVisible?: boolean;
  providerToggle?: ReactNode;
}) {
  const { intl } = useZCodeIntl();
  const renameRequestedRef = useRef(false);
  const secondaryActionsVisible = actionsVisible && (nameEditable || Boolean(onDelete));

  return (
    <div className="flex items-center justify-between gap-3" data-testid="model-provider-header">
      <div className="flex min-w-0 items-center gap-2">
        <ProviderLogo logo={logo} className="size-5" />
        {editingName ? (
          <Input
            {...TECHNICAL_INPUT_ATTRIBUTES}
            autoFocus
            data-testid={TID_MODEL_PROVIDER_NAME_INPUT}
            type="text"
            size="lg"
            className="w-auto min-w-0 text-ui-lg font-semibold"
            value={nameValue}
            onChange={(event) => onNameChange(event.target.value)}
            onCompositionEnd={onNameCompositionEnd}
            onCompositionStart={onNameCompositionStart}
            onBlur={onNameBlur}
            onKeyDown={onNameKeyDown}
          />
        ) : (
          <>
            <div className="min-w-0 truncate text-ui-lg font-semibold text-foreground">
              {providerName}
            </div>
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {providerToggle}
        {secondaryActionsVisible ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                data-testid="model-provider-actions-button"
                aria-label={intl.formatMessage({ id: "common.more" })}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onCloseAutoFocus={(event) => {
                // 退场动画中的菜单仍会因鼠标移动抢焦点，必须关闭后再挂载并聚焦输入框。
                if (renameRequestedRef.current) {
                  event.preventDefault();
                  renameRequestedRef.current = false;
                  onStartEditName();
                }
              }}
            >
              {nameEditable ? (
                <DropdownMenuItem
                  data-testid={TID_MODEL_PROVIDER_NAME_EDIT_BUTTON}
                  onSelect={() => {
                    renameRequestedRef.current = true;
                  }}
                >
                  <Pencil className="size-3.5" />
                  {intl.formatMessage({ id: "settings.modelProvider.renameProvider" })}
                </DropdownMenuItem>
              ) : null}
              {nameEditable && onDelete ? <DropdownMenuSeparator /> : null}
              {onDelete ? (
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  <Trash2 className="size-3.5" />
                  {intl.formatMessage({ id: "common.delete" })}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}

export function ProviderConnectionSection({
  provider,
  readOnly,
  apiFormat,
  baseUrlValue,
  onApiFormatChange,
  onBaseUrlChange,
  onBaseUrlBlur,
  onBaseUrlKeyDown,
  onBaseUrlCompositionStart,
  onBaseUrlCompositionEnd,
}: {
  provider: ProviderSettingsFormProvider;
  readOnly?: boolean;
  apiFormat: ProviderApiType;
  baseUrlValue: string;
  onApiFormatChange: (value: ProviderApiType) => void;
  onBaseUrlChange: (value: string) => void;
  onBaseUrlBlur: () => void;
  onBaseUrlKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onBaseUrlCompositionStart?: () => void;
  onBaseUrlCompositionEnd?: () => void;
}) {
  const { intl } = useZCodeIntl();
  const showApiFormat = shouldShowProviderApiFormat(provider);
  const readOnlyBaseUrl = provider.config.api?.baseUrl ?? "";
  const resolvedApiFormat = provider.config.api?.type ?? "anthropic-messages";

  const renderReadOnlyField = (label: string, value: string) => (
    <div>
      <label className="mb-1 block text-ui-base text-foreground-subtle">{label}</label>
      <div className="flex min-h-8 items-center gap-2 rounded-lg border border-input-border bg-input px-3 py-1.5 text-ui-base text-foreground">
        <span className="min-w-0 flex-1 break-all">{value || "-"}</span>
        <span
          role="img"
          aria-label={intl.formatMessage(
            { id: "settings.modelProvider.readOnlyField" },
            { field: label },
          )}
          className="shrink-0 text-foreground-subtle"
        >
          <LockKeyholeIcon className="size-3.5" aria-hidden="true" />
        </span>
      </div>
    </div>
  );

  if (readOnly) {
    return (
      <>
        {renderReadOnlyField(
          intl.formatMessage({ id: "settings.modelProvider.baseUrl" }),
          readOnlyBaseUrl,
        )}
        {showApiFormat
          ? renderReadOnlyField(
              intl.formatMessage({ id: "settings.modelProvider.apiFormat" }),
              resolveProviderConnectionApiFormatDisplayLabel(intl, resolvedApiFormat),
            )
          : null}
      </>
    );
  }

  return (
    <>
      <div>
        <label className="mb-1 block text-ui-base text-foreground-subtle">
          {intl.formatMessage({ id: "settings.modelProvider.baseUrl" })}
        </label>
        <Input
          {...TECHNICAL_INPUT_ATTRIBUTES}
          type="text"
          size="lg"
          data-testid={TID_MODEL_PROVIDER_BASE_URL_INPUT}
          value={baseUrlValue}
          placeholder={intl.formatMessage({
            id: "settings.modelProvider.baseUrlPlaceholder",
          })}
          onChange={(event) => onBaseUrlChange(event.target.value)}
          onBlur={onBaseUrlBlur}
          onKeyDown={onBaseUrlKeyDown}
          onCompositionStart={onBaseUrlCompositionStart}
          onCompositionEnd={onBaseUrlCompositionEnd}
        />
      </div>
      {showApiFormat ? (
        <div>
          <label className="mb-1 block text-ui-base text-foreground-subtle">
            {intl.formatMessage({ id: "settings.modelProvider.apiFormat" })}
          </label>
          <ProviderApiFormatSelect value={apiFormat} onChange={onApiFormatChange} />
        </div>
      ) : null}
    </>
  );
}

export function ProviderApiKeySection({
  apiKeyValue,
  apiKeyVisible,
  readOnly,
  presetApiKeyUrl,
  onOpenPresetApiKey,
  onApiKeyChange,
  onApiKeyBlur,
  onApiKeyKeyDown,
  onApiKeyCompositionStart,
  onApiKeyCompositionEnd,
  onToggleApiKeyVisibility,
}: {
  apiKeyValue: string;
  apiKeyVisible: boolean;
  readOnly?: boolean;
  presetApiKeyUrl?: string;
  onOpenPresetApiKey?: () => void;
  onApiKeyChange: (value: string) => void;
  onApiKeyBlur: () => void;
  onApiKeyKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onApiKeyCompositionStart?: () => void;
  onApiKeyCompositionEnd?: () => void;
  onToggleApiKeyVisibility: () => void;
}) {
  const { intl } = useZCodeIntl();

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="block text-ui-base text-foreground-subtle">
          {intl.formatMessage({ id: "settings.modelProvider.apiKey" })}
        </label>
        {presetApiKeyUrl && onOpenPresetApiKey ? (
          <PresetProviderApiKeyBanner onOpenApiKey={onOpenPresetApiKey} />
        ) : null}
      </div>
      <ApiKeyInput
        value={apiKeyValue}
        visible={apiKeyVisible}
        readOnly={readOnly}
        onChange={onApiKeyChange}
        onBlur={onApiKeyBlur}
        onKeyDown={onApiKeyKeyDown}
        onCompositionStart={onApiKeyCompositionStart}
        onCompositionEnd={onApiKeyCompositionEnd}
        onToggleVisibility={onToggleApiKeyVisibility}
      />
    </div>
  );
}

function createEmptyModel(): ProviderSettingsFormModel {
  return {
    kind: "candidate",
    modelId: "",
    builtin: false,
    personalConfig: {},
    // 空 ID 尚未解析模型配置，硬编码档位会被误认为智能推荐。
    config: {
      properties: { supportsToolCall: true },
    },
    hasPersonalConfig: false,
    executable: false,
    selectable: false,
  };
}

export function ProviderModelsSection({
  providerId,
  providerName,
  providerEnabled = true,
  providerAccess,
  models,
  onTestModel,
  onListProviderModels,
  onModelCommit,
  onModelEnabledChange,
  onDeleteModel,
  onAddModel,
  onReorderModelIds,
  settingsRevision = 0,
}: {
  providerId: string;
  providerName?: string;
  providerEnabled?: boolean;
  providerAccess?: ProviderConfigObject["access"];
  models: ProviderSettingsFormModel[];
  onTestModel?: (model: string) => Promise<ModelConnectivityResult>;
  /** 拉取上游模型列表（调用方负责先把卡片草稿落盘），供新增模型时挑选用。 */
  onListProviderModels?: () => Promise<ProviderModelListResult>;
  onModelCommit: (
    originalModelId: string,
    model: ProviderSettingsFormModel,
    basedOnRevision: number,
  ) => void | Promise<void>;
  onDeleteModel: (modelId: string) => void;
  onModelEnabledChange?: (modelId: string, enabled: boolean) => void | Promise<void>;
  onAddModel: (model: ProviderSettingsFormModel) => void | Promise<void>;
  onReorderModelIds?: (modelIds: string[]) => void;
  settingsRevision?: number;
}) {
  const { intl } = useZCodeIntl();
  const { providerSettingsService } = useServices();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const addSavingRef = useRef(false);
  const [addCommitError, setAddCommitError] = useState<string | null>(null);
  const [addModel] = useState(createEmptyModel);
  const [addDraftErrorField, setAddDraftErrorField] = useState<
    | "id"
    | "contextWindow"
    | "maxOutputTokens"
    | "inputFormat"
    | "reasoningLevelValues"
    | "reasoningLevelMap"
    | null
  >(null);
  const resolveAddModelConfig = useCallback(
    (modelId: string) => providerSettingsService.resolveModelConfig({ providerId, modelId }),
    [providerId, providerSettingsService],
  );
  const editor = useProviderModelDraft({
    model: addModel,
    open: addDialogOpen,
    scopeKey: providerId,
    resolve: resolveAddModelConfig,
  });
  const { draft: addDraft } = editor;

  const openAddDialog = useCallback(() => {
    editor.reset(createEmptyModel());
    setAddDraftErrorField(null);
    setAddCommitError(null);
    setAddDialogOpen(true);
  }, [editor.reset]);

  const updateAddDraft = (patch: Partial<ProviderModelDraftValues>) => {
    editor.change(patch);
    setAddDraftErrorField(null);
  };

  const cancelAddDialog = () => {
    setAddDialogOpen(false);
    editor.reset(createEmptyModel());
    setAddDraftErrorField(null);
    editor.cancel();
  };

  const handleAddDialogOpenChange = useCallback(
    (open: boolean) => {
      // 保存中的关闭/再打开会让旧请求结束掉新草稿，等待本次提交完成再结束编辑。
      if (addSavingRef.current) return;
      if (!open) {
        cancelAddDialog();
        return;
      }
      setAddDialogOpen(true);
    },
    [cancelAddDialog],
  );

  const commitAddDraft = useCallback(async (): Promise<boolean> => {
    if (addSavingRef.current) return false;
    addSavingRef.current = true;
    setAddSaving(true);
    setAddCommitError(null);
    try {
      const result = await editor.commit();
      if (result.status === "invalid") {
        setAddDraftErrorField(result.field);
        return false;
      }
      // 过去只发起异步添加就关闭弹窗，失败后输入也丢了；以实际保存完成作为结束边界。
      await onAddModel(result.model);
      setAddDialogOpen(false);
      editor.reset(createEmptyModel());
      return true;
    } catch (error) {
      setAddCommitError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      addSavingRef.current = false;
      setAddSaving(false);
    }
  }, [editor, onAddModel]);
  /**
   * 批量添加：整批只上锁一次。
   *
   * addSavingRef 原本是单条提交的重入锁（commitAddDraft 进入上锁、finally 释放）。顺序 await 的
   * 批量如果在每个 model id 上各走一次 commitAddDraft，第二条就会被第一条留下的锁直接拒绝
   * （commitAddDraft 首行 `if (addSavingRef.current) return false`），批量必然只成功一个。
   * 所以这里在入口处一次性上锁：期间 handleAddDialogOpenChange 依旧拒绝关闭对话框、
   * commitAddDraft 依旧拒绝重入，原有单条防重入语义完全保留，只是锁的持有范围从「一条」变成「一批」。
   *
   * 每条走完整的「解析推荐基线 → 投影草稿 → 提交」链路，而不是直接把裸 createEmptyModel 交给
   * 上游：勾选清单里允许用户给每个模型单独填上下文窗口 / 最大输出，这两个字段必须经与单条保存
   * 完全相同的提交函数才能既写进 Personal 覆盖、又能被缺省时回落到推荐值。
   */
  const handleAddModels = useCallback(
    async (items: readonly ProviderModelBatchItemInput[]) => {
      if (addSavingRef.current) {
        return { added: 0, failed: items.map((item) => item.modelId) };
      }
      addSavingRef.current = true;
      setAddSaving(true);
      setAddCommitError(null);
      const failed: string[] = [];
      // 「已经加过」必须与「真的失败」分开报。以前两者混在 failed 里，用户看到
      // 「已添加 0 个，2 个失败」，而那两个模型其实第一次就加成功了，他只能去猜
      // 是不是模型 ID 没填 —— 病因从来没被说出来过。
      const skipped: string[] = [];
      const existingIds = new Set(models.map((model) => model.modelId));
      let added = 0;
      try {
        for (const item of items) {
          if (existingIds.has(item.modelId)) {
            skipped.push(item.modelId);
            continue;
          }
          try {
            // 先向 Host 取该模型的推荐基线：inheritedConfig 里带着 contextWindow /
            // maxOutputTokens / optionSpecs。少了这一步，projectModelDraft 补不出
            // optionSpecs，reasoningLevelValues 会为空数组，提交必然 invalid。
            const resolution = await resolveAddModelConfig(item.modelId);
            const baseModel: ProviderSettingsFormModel = {
              ...createEmptyModel(),
              modelId: item.modelId,
              inheritedConfig: resolution.inheritedConfig,
              config: resolution.inheritedConfig,
            };
            // 行里改过的档位由对话框整体带过来（contextWindow / maxOutputTokens /
            // 模态 / 能力 / 推理档位都可能在行内被改）。没带草稿的行走纯推荐值。
            const batchDraft: ProviderModelDraftValues = {
              ...createProviderModelDraftValues(baseModel),
              ...item.draft,
            };
            const result = resolveProviderModelDraftCommit({
              currentModel: baseModel,
              draft: projectModelDraft(batchDraft, baseModel),
            });
            if (result.status === "invalid") {
              failed.push(item.modelId);
              continue;
            }
            await onAddModel(result.model);
            added += 1;
            // 同一批里出现重复 id 时也要挡住第二次，别指望刷新前的 models 列表。
            existingIds.add(item.modelId);
          } catch {
            // 上游解析失败、或 Host 侧拒绝（例如同一模型已被别的窗口加上），走到这里。
            // 一条失败不能中断整批，只如实记录失败 id 交给对话框汇总提示。
            failed.push(item.modelId);
          }
        }
      } finally {
        addSavingRef.current = false;
        setAddSaving(false);
      }
      return { added, failed, skipped };
    },
    [models, onAddModel, resolveAddModelConfig],
  );
  const addDraftErrorMessage = addDraftErrorField
    ? intl.formatMessage({
        id: `settings.modelProvider.modelMetadata.invalid.${addDraftErrorField}`,
      })
    : null;
  /**
   * 这个供应商下已经存在的模型 id。
   *
   * 单独 memo 一份再往下传：对话框把「已添加」的行做成不可勾选，这个数组会进
   * 它两个 useCallback 的依赖，每次渲染换一个新数组会把回调也换掉。
   */
  const existingModelIds = useMemo(
    () => models.map((model) => model.modelId),
    [models],
  );

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <span className="text-ui-base text-foreground-subtle">
          {intl.formatMessage({ id: "settings.modelProvider.models" })}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="default"
          className="rounded-lg"
          data-testid={TID_MODEL_PROVIDER_ADD_MODEL_BUTTON}
          onClick={openAddDialog}
        >
          <Plus data-icon="inline-start" aria-hidden="true" />
          {intl.formatMessage({ id: "settings.modelProvider.addModel" })}
        </Button>
      </div>
      {models.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-input-border bg-input">
          <SortableProviderModelList
            modelIds={models.map((model) => model.modelId)}
            sortableModelIds={models.map((model) => model.modelId)}
            onReorder={onReorderModelIds}
            renderModel={(_modelId, index) => {
              const model = models[index]!;
              const inputFormat = model.config.properties?.inputFormat;
              const outputFormat = model.config.properties?.outputFormat;
              const completeProperties =
                model.config.properties?.contextWindow != null &&
                inputFormat?.supportsText != null &&
                inputFormat.supportsImage != null &&
                inputFormat.supportsVideo != null &&
                inputFormat.supportsAudio != null &&
                inputFormat.supportsPdf != null &&
                outputFormat?.supportsText != null;
              return (
                <>
                  <ModelRowInput
                    key={`${providerId}/${model.modelId}`}
                    providerId={providerId}
                    providerName={providerName}
                    providerEnabled={providerEnabled}
                    providerAccess={providerAccess}
                    inputTestId={testId(TID_MODEL_PROVIDER_MODEL_INPUT, String(index))}
                    deleteTestId={testId(TID_MODEL_PROVIDER_MODEL_DELETE_BUTTON, String(index))}
                    model={model}
                    onCommit={(value, basedOnRevision) =>
                      onModelCommit(model.modelId, value, basedOnRevision)
                    }
                    onResolveDraft={(nextModelId, personalConfig) =>
                      providerSettingsService.resolveModelConfig({
                        providerId,
                        originalModelId: model.modelId,
                        modelId: nextModelId,
                        personalConfig: structuredClone(personalConfig),
                      })
                    }
                    settingsRevision={settingsRevision}
                    onDelete={!model.builtin ? () => onDeleteModel(model.modelId) : undefined}
                    onEnabledChange={(enabled) => {
                      void Promise.resolve(onModelEnabledChange?.(model.modelId, enabled)).catch(
                        () => undefined,
                      );
                    }}
                    onTest={onTestModel}
                  />
                  {!completeProperties && (
                    <div className="px-3 pb-2 text-ui-sm text-destructive">
                      {model.issues?.[0]?.message ??
                        intl.formatMessage({ id: "settings.modelProvider.modelConfigIncomplete" })}
                    </div>
                  )}
                </>
              );
            }}
          />
        </div>
      ) : (
        <div className="mt-1 flex h-12 items-center justify-start gap-2 rounded-lg border border-dashed border-border px-4 text-left text-ui-base text-foreground-subtle">
          <InfoIcon className="size-4 shrink-0" aria-hidden="true" />
          {intl.formatMessage({ id: "settings.modelProvider.modelsEmpty" })}
        </div>
      )}
      <>
        <ProviderModelMetadataDialog
          onRestore={() => {
            setAddDraftErrorField(null);
            setAddCommitError(null);
            void editor
              .restore()
              .catch((error) =>
                setAddCommitError(error instanceof Error ? error.message : String(error)),
              );
          }}
          mode="add"
          open={addDialogOpen}
          draft={addDraft}
          draftErrorMessage={addCommitError ?? addDraftErrorMessage}
          draftErrorField={addDraftErrorField}
          inheritedConfig={editor.inheritedConfig}
          overrideFields={editor.overrides}
          onOpenChange={handleAddDialogOpenChange}
          onDraftChange={updateAddDraft}
          onCommit={commitAddDraft}
          saving={addSaving}
          modelConfigResolutionPending={editor.pending}
          modelDefaultsLoaded={editor.defaultsLoaded}
          onFetchModels={onListProviderModels}
          // 批量能力由必填的 onAddModel 顺序派生，所以这里总是透传；对话框侧 onAddModels
          // 仍是可选 prop，其他直接渲染该对话框的宿主（如行内编辑态）自然不出现批量入口。
          onAddModels={handleAddModels}
          // 展开某个候选行时才去解析它的推荐基线；解析结果只用于行内 placeholder 与
          // 推理档位选项，不写任何覆盖。
          onResolveModelConfig={async (modelId) => (await resolveAddModelConfig(modelId)).inheritedConfig}
          // 已经加过的模型由对话框标成「已添加」并拒绝勾选：重复添加的结局是一句
          // 没有病因的「失败」，而用户根本没做错什么。
          existingModelIds={existingModelIds}
          onModelIdBlur={() => {
            void editor.flush().catch(() => undefined);
          }}
        />
      </>
    </div>
  );
}
