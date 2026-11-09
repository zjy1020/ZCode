import { useId, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { ChevronRightIcon, Loader2Icon } from "lucide-react";
import type { ModelConfigObject } from "@zcode/provider";
import { Input } from "@/components/ui/input.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  type ProviderModelDraftCommitResult,
  type ProviderModelDraftValues,
} from "@/settings/model-provider-section/ProviderModelMetadata.js";
import { ProviderModelInputModalityOptions } from "@/settings/model-provider-section/ProviderModelModalityOptions.js";
import { BooleanModelOption } from "@/settings/model-provider-section/ProviderModelMetadataFields.js";
import {
  ModelSettingsGroup,
  ProviderModelReasoningSettings,
} from "@/settings/model-provider-section/ProviderModelSettingsGroups.js";
import { TECHNICAL_INPUT_ATTRIBUTES } from "@/lib/technicalInputAttributes.js";
import { modelEditorControlStyle } from "@/settings/model-provider-section/modelEditorControlStyle.js";
import {
  ModelConfigHelp,
  ModelConfigInputLabel,
} from "@/settings/model-provider-section/ModelConfigHelp.js";
import { ModelEditorAdvanced } from "@/settings/model-provider-section/ModelEditorAdvanced.js";

/** 聚焦时选中全部内容，数值字段可以直接覆盖输入。 */
function selectFocusedInputText(event: Pick<FocusEvent<HTMLInputElement>, "currentTarget">) {
  event.currentTarget.select();
}

/** 与「高级配置」同款折叠头，用来默认收起「参数设置」。 */
export function ModelParamsDisclosure({
  label,
  defaultExpanded = false,
  pending = false,
  children,
}: {
  label: string;
  defaultExpanded?: boolean;
  /** 推荐基线还在解析时给出可见反馈，免得用户以为参数区是空的。 */
  pending?: boolean;
  children: ReactNode;
}) {
  const contentId = useId();
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div data-model-params="true">
      <button
        type="button"
        data-model-params-trigger="true"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-fit cursor-pointer items-center gap-2 rounded-sm bg-transparent px-2 py-1 text-ui-base text-foreground hover:bg-hover focus-visible:outline-2 focus-visible:outline-primary"
      >
        <ChevronRightIcon
          className={`size-4 transition-transform motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`}
          aria-hidden="true"
        />
        {label}
        {pending ? (
          <Loader2Icon
            className="size-3.5 animate-spin text-foreground-subtle"
            aria-hidden="true"
          />
        ) : null}
      </button>
      <div
        id={contentId}
        inert={!expanded}
        aria-hidden={!expanded}
        className={`-mx-1 grid transition-[grid-template-rows,opacity,visibility] duration-200 motion-reduce:transition-none ${expanded ? "visible grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-4 px-1 pt-3 pb-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * 参数编辑区：上下文窗口 / 最大输出 Token / 高级配置。
 *
 * 手填单个模型时挂在对话框底部（默认收起），批量清单里挂在每一行下面——同一份实现两处
 * 复用，免得「行内能调的范围」和「手动能调的范围」慢慢分叉。
 */
export function ProviderModelParamsFields({
  draft,
  onDraftChange,
  inheritedConfig,
  personalConfig,
  overrideFields,
  errorField = null,
  validationAttempt = 0,
  dialogOpen,
  autoFocusContextWindow = false,
  advancedExpanded = false,
  onEnterKeyDown,
  onCompositionStart,
  onCompositionEnd,
}: {
  draft: ProviderModelDraftValues;
  onDraftChange: (patch: Partial<ProviderModelDraftValues>) => void;
  inheritedConfig?: ModelConfigObject;
  personalConfig?: ModelConfigObject;
  overrideFields?: ReadonlySet<string>;
  errorField?: Extract<ProviderModelDraftCommitResult, { status: "invalid" }>["field"] | null;
  validationAttempt?: number;
  dialogOpen: boolean;
  autoFocusContextWindow?: boolean;
  /**
   * 「高级配置」是否一开始就展开。批量清单的每行参数是「这一个模型的完整参数」，必须一次
   * 给全，所以行内传 true；对话框底部那份手填参数区保持折叠，避免一进对话框就铺满屏。
   */
  advancedExpanded?: boolean;
  onEnterKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
}) {
  const { intl } = useZCodeIntl();
  const contextWindowInputId = useId();
  const maxOutputInputId = useId();
  const smart = draft.useRecommendedConfigValue !== false;
  const overridden = (field: string, legacy = false) =>
    smart && (overrideFields ? overrideFields.has(field) : legacy);
  // 编辑态沿用既有行为：清空模型 ID 后最大输出不可填（没有目标模型就无从谈推荐值）。
  const maxOutputTokensInputDisabled = !draft.idValue.trim();
  return (
    <>
      <ModelSettingsGroup group="tokens">
        <div className="space-y-3">
          <div>
            <div className="mb-1 block text-ui-base text-foreground-subtle">
              <ModelConfigInputLabel field="contextWindow" htmlFor={contextWindowInputId} />
            </div>
            <Input
              {...TECHNICAL_INPUT_ATTRIBUTES}
              id={contextWindowInputId}
              type="text"
              autoFocus={autoFocusContextWindow}
              inputMode="numeric"
              pattern="[0-9]*"
              size="lg"
              value={draft.contextWindowValue}
              data-personal-override={overridden(
                "contextWindowValue",
                personalConfig?.properties?.contextWindow !== undefined,
              )}
              className={modelEditorControlStyle(
                overridden(
                  "contextWindowValue",
                  personalConfig?.properties?.contextWindow !== undefined,
                ),
              )}
              placeholder={
                draft.useRecommendedConfigValue === false ||
                inheritedConfig?.properties?.contextWindow === undefined
                  ? undefined
                  : String(inheritedConfig.properties.contextWindow)
              }
              onChange={(event) => {
                onDraftChange({ contextWindowValue: event.target.value });
              }}
              onFocus={selectFocusedInputText}
              onCompositionStart={onCompositionStart}
              onCompositionEnd={onCompositionEnd}
              onKeyDown={onEnterKeyDown}
            />
          </div>
        </div>
      </ModelSettingsGroup>
      <ModelSettingsGroup group="tokens">
        <div className="space-y-3">
          <div data-model-max-output="true">
            <div className="mb-1 flex items-center gap-2">
              <div className="text-ui-base text-foreground-subtle">
                <ModelConfigInputLabel field="maxOutputTokens" htmlFor={maxOutputInputId} />
              </div>
            </div>
            <Input
              {...TECHNICAL_INPUT_ATTRIBUTES}
              id={maxOutputInputId}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              size="lg"
              value={draft.maxOutputTokensValue}
              data-personal-override={overridden(
                "maxOutputTokensValue",
                personalConfig?.optionSpecs?.maxOutputTokens?.max !== undefined,
              )}
              className={modelEditorControlStyle(
                overridden(
                  "maxOutputTokensValue",
                  personalConfig?.optionSpecs?.maxOutputTokens?.max !== undefined,
                ),
              )}
              placeholder={
                draft.useRecommendedConfigValue === false ||
                inheritedConfig?.optionSpecs?.maxOutputTokens?.max === undefined
                  ? undefined
                  : String(inheritedConfig.optionSpecs.maxOutputTokens.max)
              }
              disabled={maxOutputTokensInputDisabled}
              aria-label={intl.formatMessage({
                id: "settings.modelProvider.maxOutputTokens",
              })}
              onChange={(event) => onDraftChange({ maxOutputTokensValue: event.target.value })}
              onFocus={selectFocusedInputText}
              onCompositionStart={onCompositionStart}
              onCompositionEnd={onCompositionEnd}
              onKeyDown={onEnterKeyDown}
            />
          </div>
        </div>
      </ModelSettingsGroup>
      <ModelEditorAdvanced
        open={dialogOpen}
        errorField={errorField}
        validationAttempt={validationAttempt}
        defaultExpanded={advancedExpanded}
      >
        <ModelSettingsGroup group="modalities">
          <div className="space-y-3">
            <div>
              <div className="mb-1 block text-ui-base text-foreground-subtle">
                {intl.formatMessage({ id: "settings.modelProvider.inputModalities" })}
                <ModelConfigHelp field="inputModalities" />
              </div>
              <ProviderModelInputModalityOptions
                value={draft.inputFormatValue}
                onChange={(inputFormatValue) => onDraftChange({ inputFormatValue })}
                personalValue={personalConfig?.properties?.inputFormat}
                overrideFields={smart ? overrideFields : undefined}
              />
            </div>
          </div>
        </ModelSettingsGroup>
        <ModelSettingsGroup group="capabilities">
          <div>
            <div
              className="mb-1 block text-ui-base text-foreground-subtle"
              data-model-capabilities-label="true"
            >
              {intl.formatMessage({ id: "settings.modelProvider.capabilities" })}
              <ModelConfigHelp field="capabilities" />
            </div>
            <div className="flex flex-wrap gap-2" data-model-capabilities-options="true">
              {(
                [
                  "supportsJsonSchemaOutput",
                  "supportsNativeWebSearch",
                  "supportsMidConversationSystem",
                ] as const
              ).map((property) => {
                const field = `${property}Value` as const;
                return (
                  <BooleanModelOption
                    key={property}
                    label={intl.formatMessage({ id: `settings.modelProvider.${property}` })}
                    selected={draft[field] ?? false}
                    onToggle={() => onDraftChange({ [field]: !(draft[field] ?? false) })}
                    overridden={overridden(
                      field,
                      personalConfig?.properties?.[property] !== undefined,
                    )}
                  />
                );
              })}
            </div>
          </div>
        </ModelSettingsGroup>
        <ProviderModelReasoningSettings
          draft={draft}
          personalConfig={personalConfig}
          overrideFields={smart ? overrideFields : undefined}
          inheritedConfig={inheritedConfig}
          onDraftChange={onDraftChange}
        />
      </ModelEditorAdvanced>
    </>
  );
}
