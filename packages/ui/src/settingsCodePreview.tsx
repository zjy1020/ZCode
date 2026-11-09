import type { Theme } from "@/useTheme.js";
import { useState } from "react";
import { resolveTheme } from "@/useTheme.js";
import { Card, CardContent } from "@/components/ui/card.js";
import { Input } from "@/components/ui/input.js";
import { cn } from "@/components/lib/utils.js";
import { Switch } from "@/components/ui/switch.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import {
  getThemeOptionLabel,
  SettingsRow,
  ThemePreviewCard,
  ThemeSelect,
} from "@/settings/SettingsPageParts.js";
import { getCodePreviewTheme } from "@/lib/codePreviewPreferences.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { CodePreviewSettings } from "@/store/index.js";
import { THEME_MODES } from "@/settings/settingsPageConfig.js";
import { MAX_UI_FONT_SIZE_PX, MIN_UI_FONT_SIZE_PX } from "@/lib/uiFontSize.js";
import { useThemeExt } from "@/theme-ext/useThemeExt.js";
import { getColorPack, resolveColorPackVariantId } from "@/theme-ext/registry.js";
import type { ColorPack } from "@/theme-ext/types.js";
import { FontFamilyPicker } from "@/theme-ext/FontFamilyPicker.js";
import { supportsEverforestCodeTheme } from "@/theme-ext/codeTheme.js";

/**
 * 按 id 取翻译，缺失时回退到调用方给的默认值。
 *
 * `IntlProvider.formatMessage` 在没找到 key 时会原样返回 id，所以这里用
 * 「返回值等于 id」判断缺失，让新增主题包即使没补 i18n 也能正常显示。
 */
function resolveMessage(
  intl: ReturnType<typeof useZCodeIntl>["intl"],
  id: string,
  fallback: string,
): string {
  const message = intl.formatMessage({ id });
  return message === id ? fallback : message;
}

function FontSizeInput({
  value,
  min,
  max,
  ariaLabel,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  ariaLabel: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  const commit = () => {
    const parsed = draft.trim() === "" ? Number.NaN : Number(draft);
    const nextValue = Number.isFinite(parsed)
      ? Math.min(max, Math.max(min, Math.round(parsed)))
      : value;
    setDraft(String(nextValue));
    if (nextValue !== value) {
      onChange(nextValue);
    }
  };

  return (
    <div className="relative w-28">
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={draft}
        aria-label={ariaLabel}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setDraft(String(value));
          }
        }}
        className="pr-8 text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-ui-lg text-foreground-subtle">
        px
      </span>
    </div>
  );
}

/** 配色包的色板预览：画布、两级表面、正文，以及若干强调色。 */
function ColorPackSwatches({ pack, scheme, variantId }: {
  pack: ColorPack;
  scheme: "light" | "dark";
  variantId: string;
}) {
  const colors = pack.previewColors(scheme, variantId);
  return (
    <div className="flex items-center gap-1.5">
      {colors.map((color, index) => (
        <span
          key={`${color}-${index}`}
          className="size-5 rounded-md ring-1 ring-border"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

/**
 * 「对比强度」的可视化选择器。
 *
 * 原来这里是一个下拉框，只能读到「柔和 / 中等 / 强烈」三个词，看不出差别。改成
 * 每个档位一张小卡：卡片上半部是该档位**整条中性色阶**（画布 → 边框），点一下直接
 * 生效。四张卡并排时整条色阶的深浅/冷暖差一眼能比出来。
 *
 * 注意别只画两三格：四档的差别是整条色阶一起变，挑两格会看起来完全一样。
 */
function ColorPackVariantPicker({
  options,
  value,
  onChange,
}: {
  options: readonly {
    id: string;
    label: string;
    /** 变体等效到哪一档（例如「跟随默认」在当前明暗下等效于「强烈」）。 */
    note?: string;
    colors: readonly string[];
  }[];
  value: string;
  onChange: (variantId: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {options.map((option) => {
        const isActive = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.id)}
            className={cn(
              "flex min-w-[104px] flex-1 cursor-pointer flex-col gap-2 rounded-lg border border-border bg-card px-2 py-2 text-left transition-colors hover:border-border-hover",
              isActive && "border-brand ring-1 ring-brand",
            )}
          >
            {option.colors.length > 0 ? (
              <span className="flex h-5 overflow-hidden rounded-[3px] ring-1 ring-border">
                {option.colors.map((color, index) => (
                  <span
                    key={`${color}-${index}`}
                    className="flex-1"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                ))}
              </span>
            ) : null}
            <span
              className={cn(
                "text-ui-xs",
                isActive ? "text-foreground" : "text-foreground-subtle",
              )}
            >
              {option.label}
              {option.note ? (
                <span className="text-foreground-subtlest"> · {option.note}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function AppearanceSectionContent({
  codePreviewSettings,
  setCodePreviewSettings,
  theme,
  setTheme,
  uiFontSizePx,
  setUiFontSizePx,
}: {
  codePreviewSettings: CodePreviewSettings;
  setCodePreviewSettings: (settings: Partial<CodePreviewSettings>) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  uiFontSizePx: number;
  setUiFontSizePx: (fontSizePx: number) => void;
}) {
  const { intl } = useZCodeIntl();
  const activePreviewMode = resolveTheme(theme);
  // 主题扩展层：配色包与字体都来自它，本组件不新增 props，调用方无需改动。
  const themeExt = useThemeExt();
  const activeColorPack = getColorPack(themeExt.settings.colorPackId);
  const activeVariantId = resolveColorPackVariantId(
    activeColorPack,
    themeExt.settings.colorPackVariantId,
  );
  // 当前配色包自带代码主题时，上面两个「代码配色」下拉不再决定代码块颜色，
  // 需要在设置项下面说明；`native` 关闭了这个接管，下拉恢复生效。
  const codeThemeFollowsPack = supportsEverforestCodeTheme(activeColorPack.id);

  return (
    <>
      <div className="min-w-0 space-y-3">
        <div>
          <h3 className="text-ui-lg font-semibold text-foreground">
            {intl.formatMessage({ id: "settings.appearance.interfaceTitle" })}
          </h3>
          <p className="mt-1 text-ui-base leading-6 text-foreground-subtle">
            {intl.formatMessage({
              id: "settings.appearance.interfaceDescription",
            })}
          </p>
        </div>
        <Card className="border border-border bg-card py-0 shadow-none">
          <CardContent className="space-y-0 px-0">
            <SettingsRow
              label={intl.formatMessage({ id: "settings.themeMode" })}
              description={intl.formatMessage({
                id: "settings.themeModeDescription",
              })}
              control={
                <Select value={theme} onValueChange={(value) => setTheme(value as Theme)}>
                  <SelectTrigger size="lg" className="w-[260px] min-w-0 justify-between">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {THEME_MODES.map(({ mode, icon: Icon }) => (
                      <SelectItem key={mode} value={mode}>
                        <div className="flex items-center gap-2">
                          <Icon className="size-4" />
                          {intl.formatMessage({
                            id: `settings.themeMode.${mode}`,
                          })}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
            <SettingsRow
              label={resolveMessage(intl, "settings.appearance.colorPack", "配色方案")}
              description={resolveMessage(
                intl,
                "settings.appearance.colorPackDescription",
                "界面配色主题；扩展层只覆盖颜色，不改动布局与结构。",
              )}
              control={
                <Select
                  value={activeColorPack.id}
                  onValueChange={(value) => themeExt.update({ colorPackId: value })}
                >
                  <SelectTrigger size="lg" className="w-[260px] min-w-0 justify-between">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {themeExt.packs.map((pack) => (
                      <SelectItem key={pack.id} value={pack.id}>
                        {resolveMessage(intl, `settings.appearance.colorPack.${pack.id}`, pack.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
              detail={
                <ColorPackSwatches
                  pack={activeColorPack}
                  scheme={themeExt.scheme}
                  variantId={activeVariantId}
                />
              }
            />
            {activeColorPack.variants.length ? (
              <SettingsRow
                label={resolveMessage(intl, "settings.appearance.colorPackStrength", "对比强度")}
                description={resolveMessage(
                  intl,
                  "settings.appearance.colorPackStrengthDescription",
                  "背景明暗层次：柔和最轻，强烈对比最大。点选即生效。",
                )}
                controlLayout="wide"
                control={
                  <ColorPackVariantPicker
                    options={activeColorPack.variants.map((variant) => {
                      // 「跟随默认」这类变体要说清楚它等效成哪一档，否则用户点完
                      // 发现颜色跟某一档一模一样，会以为设置没生效。
                      const effectiveId =
                        activeColorPack.effectiveVariantId?.(themeExt.scheme, variant.id) ??
                        variant.id;
                      const effectiveVariant = activeColorPack.variants.find(
                        (candidate) => candidate.id === effectiveId,
                      );
                      const note =
                        effectiveVariant && effectiveVariant.id !== variant.id
                          ? resolveMessage(
                              intl,
                              `settings.appearance.colorPackStrength.${effectiveVariant.id}`,
                              effectiveVariant.label,
                            )
                          : undefined;
                      return {
                        id: variant.id,
                        label: resolveMessage(
                          intl,
                          `settings.appearance.colorPackStrength.${variant.id}`,
                          variant.label,
                        ),
                        ...(note ? { note } : {}),
                        colors:
                          activeColorPack.variantPreview?.(themeExt.scheme, variant.id) ?? [],
                      };
                    })}
                    value={activeVariantId}
                    onChange={(value) => themeExt.update({ colorPackVariantId: value })}
                  />
                }
              />
            ) : null}
            <SettingsRow
              label={intl.formatMessage({ id: "settings.uiFontSize" })}
              description={intl.formatMessage({
                id: "settings.uiFontSizeDescription",
              })}
              control={
                <FontSizeInput
                  key={uiFontSizePx}
                  min={MIN_UI_FONT_SIZE_PX}
                  max={MAX_UI_FONT_SIZE_PX}
                  value={uiFontSizePx}
                  onChange={setUiFontSizePx}
                  ariaLabel={intl.formatMessage({ id: "settings.uiFontSize" })}
                />
              }
            />
            <SettingsRow
              controlLayout="wide"
              label={resolveMessage(intl, "settings.appearance.uiFontFamily", "界面字体")}
              description={resolveMessage(
                intl,
                "settings.appearance.uiFontFamilyDescription",
                "界面正文使用的字体族，可填多个并用逗号分隔；留空恢复默认。",
              )}
              control={
                <FontFamilyPicker
                  value={themeExt.settings.fonts.uiFontFamily}
                  placeholder={resolveMessage(
                    intl,
                    "settings.appearance.uiFontFamilyPlaceholder",
                    "Inter, 微软雅黑",
                  )}
                  ariaLabel={resolveMessage(intl, "settings.appearance.uiFontFamily", "界面字体")}
                  customPlaceholder={resolveMessage(
                    intl,
                    "settings.appearance.uiFontFamilyPlaceholder",
                    "Inter, 微软雅黑",
                  )}
                  searchPlaceholder={resolveMessage(
                    intl,
                    "settings.appearance.fontPickerSearch",
                    "搜索系统字体…",
                  )}
                  emptyLabel={resolveMessage(
                    intl,
                    "settings.appearance.fontPickerEmpty",
                    "没有匹配的字体",
                  )}
                  loadingLabel={resolveMessage(
                    intl,
                    "settings.appearance.fontPickerLoading",
                    "正在读取系统字体…",
                  )}
                  customLabel={resolveMessage(
                    intl,
                    "settings.appearance.fontPickerCustom",
                    "自定义字体族…",
                  )}
                  unavailableLabel={resolveMessage(
                    intl,
                    "settings.appearance.fontPickerUnavailable",
                    "当前环境读不到系统字体，只能手动输入字体族。",
                  )}
                  useDefaultLabel={resolveMessage(
                    intl,
                    "settings.appearance.fontPickerUseDefault",
                    "恢复默认",
                  )}
                  onValueChange={(value) => themeExt.update({ fonts: { uiFontFamily: value } })}
                />
              }
            />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <div className="min-w-0 space-y-3">
          <div>
            <h3 className="text-ui-lg font-semibold text-foreground">
              {intl.formatMessage({ id: "settings.appearance.codeTitle" })}
            </h3>
            <p className="mt-1 text-ui-base leading-6 text-foreground-subtle">
              {intl.formatMessage({
                id: "settings.appearance.codeDescription",
              })}
            </p>
          </div>
          <Card className="border border-border bg-card py-0 shadow-none [&_[data-slot=select-trigger]]:w-full">
            <CardContent className="space-y-0 px-0">
              <SettingsRow
                label={intl.formatMessage({ id: "settings.lightTheme" })}
                description={intl.formatMessage({
                  id: "settings.lightThemeDescription",
                })}
                control={
                  <ThemeSelect
                    value={codePreviewSettings.lightTheme}
                    onValueChange={(value) => setCodePreviewSettings({ lightTheme: value })}
                  />
                }
              />
              <SettingsRow
                label={intl.formatMessage({ id: "settings.darkTheme" })}
                description={intl.formatMessage({
                  id: "settings.darkThemeDescription",
                })}
                control={
                  <ThemeSelect
                    value={codePreviewSettings.darkTheme}
                    onValueChange={(value) => setCodePreviewSettings({ darkTheme: value })}
                  />
                }
              />
              {codeThemeFollowsPack ? (
                <p className="border-t border-border px-4 py-3 text-ui-sm leading-5 text-foreground-subtle">
                  {intl.formatMessage({ id: "settings.appearance.codeThemeFollowsPack" })}
                </p>
              ) : null}
              <SettingsRow
                label={intl.formatMessage({ id: "settings.showLineNumbers" })}
                description={intl.formatMessage({
                  id: "settings.showLineNumbersDescription",
                })}
                control={
                  <Switch
                    checked={codePreviewSettings.showLineNumbers}
                    onCheckedChange={(checked) =>
                      setCodePreviewSettings({ showLineNumbers: checked })
                    }
                  />
                }
              />
              <SettingsRow
                label={intl.formatMessage({ id: "settings.wrapLongLines" })}
                description={intl.formatMessage({
                  id: "settings.wrapLongLinesDescription",
                })}
                control={
                  <Switch
                    checked={codePreviewSettings.wrapLongLines}
                    onCheckedChange={(checked) =>
                      setCodePreviewSettings({ wrapLongLines: checked })
                    }
                  />
                }
              />
              <SettingsRow
                label={intl.formatMessage({ id: "settings.fontSize" })}
                description={intl.formatMessage({
                  id: "settings.fontSizeDescription",
                })}
                control={
                  <FontSizeInput
                    key={codePreviewSettings.fontSizePx}
                    min={12}
                    max={20}
                    value={codePreviewSettings.fontSizePx}
                    onChange={(fontSizePx) => setCodePreviewSettings({ fontSizePx })}
                    ariaLabel={intl.formatMessage({ id: "settings.fontSize" })}
                  />
                }
              />
              <SettingsRow
                controlLayout="wide"
                label={resolveMessage(intl, "settings.appearance.codeFontFamily", "代码字体")}
                description={resolveMessage(
                  intl,
                  "settings.appearance.codeFontFamilyDescription",
                  "代码块、差异视图与等宽文本使用的字体族；留空恢复默认。",
                )}
                control={
                  <FontFamilyPicker
                    value={themeExt.settings.fonts.codeFontFamily}
                    placeholder={resolveMessage(
                      intl,
                      "settings.appearance.codeFontFamilyPlaceholder",
                      "JetBrains Mono, Consolas",
                    )}
                    ariaLabel={resolveMessage(intl, "settings.appearance.codeFontFamily", "代码字体")}
                    customPlaceholder={resolveMessage(
                      intl,
                      "settings.appearance.codeFontFamilyPlaceholder",
                      "JetBrains Mono, Consolas",
                    )}
                    searchPlaceholder={resolveMessage(
                      intl,
                      "settings.appearance.fontPickerSearch",
                      "搜索系统字体…",
                    )}
                    emptyLabel={resolveMessage(
                      intl,
                      "settings.appearance.fontPickerEmpty",
                      "没有匹配的字体",
                    )}
                    loadingLabel={resolveMessage(
                      intl,
                      "settings.appearance.fontPickerLoading",
                      "正在读取系统字体…",
                    )}
                    customLabel={resolveMessage(
                      intl,
                      "settings.appearance.fontPickerCustom",
                      "自定义字体族…",
                    )}
                    unavailableLabel={resolveMessage(
                      intl,
                      "settings.appearance.fontPickerUnavailable",
                      "当前环境读不到系统字体，只能手动输入字体族。",
                    )}
                    useDefaultLabel={resolveMessage(
                      intl,
                      "settings.appearance.fontPickerUseDefault",
                      "恢复默认",
                    )}
                    onValueChange={(value) => themeExt.update({ fonts: { codeFontFamily: value } })}
                  />
                }
              />
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <div>
            <h3 className="text-ui-base font-semibold text-foreground">
              {intl.formatMessage({ id: "settings.previewSectionTitle" })}
            </h3>
            <p className="mt-1 text-ui-base leading-6 text-foreground-subtle">
              {intl.formatMessage({ id: "settings.previewDescription" })}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ThemePreviewCard
              mode="light"
              title={intl.formatMessage({ id: "settings.previewLight" })}
              themeName={getThemeOptionLabel(codePreviewSettings.lightTheme)}
              theme={getCodePreviewTheme("light", codePreviewSettings)}
              isActive={activePreviewMode === "light"}
              showLineNumbers={codePreviewSettings.showLineNumbers}
              wrapLongLines={codePreviewSettings.wrapLongLines}
              fontSizePx={codePreviewSettings.fontSizePx}
            />
            <ThemePreviewCard
              mode="dark"
              title={intl.formatMessage({ id: "settings.previewDark" })}
              themeName={getThemeOptionLabel(codePreviewSettings.darkTheme)}
              theme={getCodePreviewTheme("dark", codePreviewSettings)}
              isActive={activePreviewMode === "dark"}
              showLineNumbers={codePreviewSettings.showLineNumbers}
              wrapLongLines={codePreviewSettings.wrapLongLines}
              fontSizePx={codePreviewSettings.fontSizePx}
            />
          </div>
        </div>
      </div>
    </>
  );
}
