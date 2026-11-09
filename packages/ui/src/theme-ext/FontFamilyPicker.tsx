/**
 * 主题扩展层 —— 字体族选择器。
 *
 * 为什么要有它：原来的字体项是一个自由文本输入框，用户既不知道系统里装了哪些字体，
 * 又必须一字不差地打出族名——打错一个字符只会静默回退到默认字体，看不出哪里错了。
 * 这里把系统已装字体列出来（并用该字体自身渲染预览），同时保留自定义输入：
 * 字体族允许写整段栈（如 `Inter, 微软雅黑`），系统列表里不可能有这种组合。
 *
 * 数据来源是 Chromium 的 Local Font Access API（`window.queryLocalFonts`）；
 * Electron 渲染进程默认放行 `local-fonts` 权限，实测可返回 371 个字面 / 128 个族。
 * 环境没有这个 API、用户拒绝授权、或调用抛错时，一律退化成「只能自定义输入」，
 * 不能让「读不到系统字体」变成「改不了字体」。
 *
 * 组件自身不引 i18n、不访问 `window.zcode`、不打日志：所有可见文案都从 props 传入，
 * 因此它既能被设置页使用，也能被其它宿主（Web 端设置面板等）直接复用。
 */

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.js";
import { Input } from "@/components/ui/input.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import { cn } from "@/components/lib/utils.js";

/**
 * Local Font Access API 的形状。
 *
 * TS 6.0.2 的 `lib.dom.d.ts` 里还没有这个 API 的声明（该文件搜不到 `queryLocalFonts`），
 * 所以在本文件里补一个最小声明：只声明用得到的 `family`，其余字面信息（style、
 * postscriptName 等）不声明就不用维护。可选属性表达「Electron / 旧 Chromium 可能没有」。
 */
interface LocalFontData {
  readonly family: string;
}

declare global {
  interface Window {
    queryLocalFonts?: () => Promise<LocalFontData[]>;
  }
}

/**
 * 系统字体枚举结果，模块级缓存。
 *
 * 为什么要缓存：一次枚举要几百毫秒（371 个字面），而设置页有两个选择器，
 * 每次打开弹层都重枚举会明显卡顿。
 * 为什么把「失败」也缓存住：再次调用很可能再次弹一次授权框，用户已经拒绝过就别反复打扰；
 * 降级模式本身仍然可用（自定义输入 + 恢复默认），刷新页面后可以重新尝试。
 * 用 Promise 而不是结果值，是为了让两个选择器同时打开时共用同一次枚举。
 */
let fontFamiliesRequest: Promise<readonly string[] | null> | null = null;

async function enumerateFontFamilies(): Promise<readonly string[] | null> {
  // 先判断能力，再调用：不是每个宿主都跑在支持该 API 的 Chromium 上。
  if (typeof window.queryLocalFonts !== "function") {
    return null;
  }
  try {
    const faces = await window.queryLocalFonts();
    // 同一族会有多份字面（regular/bold/italic…），去重后按字母序排；
    // 排序是为了让列表顺序稳定，不受系统安装顺序影响。
    return Array.from(new Set(faces.map((face) => face.family))).sort((a, b) => a.localeCompare(b));
  } catch {
    // 用户拒绝授权或权限策略禁止。不区分原因：对用户来说结果都是「列表用不了」。
    return null;
  }
}

function loadFontFamilies(): Promise<readonly string[] | null> {
  fontFamiliesRequest ??= enumerateFontFamilies();
  return fontFamiliesRequest;
}

interface FontFamilyPickerProps {
  /** 当前字体族字符串；空串表示用默认字体。 */
  value: string;
  /** 触发器上没值时显示的占位文案（一般给默认字体栈示例）。 */
  placeholder: string;
  /** 触发器的无障碍名称。 */
  ariaLabel: string;
  /** 自定义输入框的占位文案。 */
  customPlaceholder: string;
  /** 搜索框占位文案。 */
  searchPlaceholder: string;
  /** 搜不到任何条目时的文案。 */
  emptyLabel: string;
  /** 正在读系统字体时的文案。 */
  loadingLabel: string;
  /** 「自定义字体族…」这一项的文案。 */
  customLabel: string;
  /** 读不到系统字体时的提示文案。 */
  unavailableLabel: string;
  /** 「恢复默认」这一项的文案。 */
  useDefaultLabel: string;
  /** 取值回调；空串表示恢复默认。 */
  onValueChange: (value: string) => void;
}

export function FontFamilyPicker({
  value,
  placeholder,
  ariaLabel,
  customPlaceholder,
  searchPlaceholder,
  emptyLabel,
  loadingLabel,
  customLabel,
  unavailableLabel,
  useDefaultLabel,
  onValueChange,
}: FontFamilyPickerProps) {
  const [open, setOpen] = useState(false);
  const [families, setFamilies] = useState<readonly string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);

  // 外部（另一个窗口 / 广播 / 明暗切换重放）改了值就回填草稿，避免草稿把新值顶掉。
  // 这是改造前那个输入框就有的行为，自定义输入必须保持同等语义。
  if (lastValue !== value) {
    setLastValue(value);
    setDraft(value);
  }

  useEffect(() => {
    // 打开弹层时才枚举：设置页渲染出来不代表用户会动字体，先不付这份开销。
    // `unavailable` 已为真时不再重试，与上面「失败也缓存」的决定保持一致。
    if (!open || families !== null || unavailable) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    void loadFontFamilies().then((loaded) => {
      if (cancelled) {
        return;
      }
      setFamilies(loaded);
      setUnavailable(loaded === null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, families, unavailable]);

  const commitDraft = () => {
    const next = draft.trim();
    if (next !== value) {
      onValueChange(next);
    }
  };

  const trimmedValue = value.trim();
  const hasValue = trimmedValue.length > 0;
  const systemFamilies = families ?? [];
  const isValueInSystemList = systemFamilies.some(
    (family) => family.toLowerCase() === trimmedValue.toLowerCase(),
  );
  // 系统列表里没有当前值时补一条：用户手打过（或多族栈）的时候，
  // 列表里必须能看到「现在用的是哪个」，否则选择器看起来像丢了状态。
  const showCurrentOnlyItem = hasValue && !isValueInSystemList;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          // 关闭时收起自定义输入：重新打开应回到列表优先的默认视图。
          setCustomMode(false);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="lg"
          aria-label={ariaLabel}
          className="w-full min-w-0 justify-between"
        >
          <span
            className={cn(
              "min-w-0 truncate text-left",
              !hasValue && "text-foreground-subtle",
            )}
          >
            {hasValue ? value : placeholder}
          </span>
          <ChevronDown className="size-3.5 text-foreground-subtle" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={8}
        className="w-80 gap-0 p-0"
        onEscapeKeyDown={(event) => {
          // 正在编辑自定义字体时，Escape 只取消这次编辑，不关闭整个弹层——
          // 否则用户按 Escape 想撤回输入，结果连列表一起没了。
          if (customMode) {
            event.preventDefault();
            setCustomMode(false);
            setDraft(value);
          }
        }}
      >
        <Command className="bg-transparent p-0 text-foreground">
          <CommandInput placeholder={searchPlaceholder} className="h-8" />
          {customMode ? (
            <div className="border-b border-border p-1">
              <Input
                autoFocus
                type="text"
                size="sm"
                value={draft}
                placeholder={customPlaceholder}
                aria-label={ariaLabel}
                className="w-full min-w-0"
                onChange={(event) => setDraft(event.currentTarget.value)}
                onBlur={commitDraft}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    // cmdk 的根节点会无条件吃掉 Enter 并派发「选中当前项」，
                    // 不截断冒泡的话，在自定义输入里回车会顺手选中列表里高亮的那一项。
                    event.preventDefault();
                    event.stopPropagation();
                    commitDraft();
                    setOpen(false);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    setCustomMode(false);
                    setDraft(value);
                  }
                }}
              />
            </div>
          ) : null}
          {loading ? (
            <div className="px-2.5 py-2 text-ui-base text-foreground-subtle">{loadingLabel}</div>
          ) : null}
          {unavailable ? (
            <div className="border-b border-border px-2.5 py-2 text-ui-base text-foreground-subtle">
              {unavailableLabel}
            </div>
          ) : null}
          <CommandList className="max-h-60 overscroll-contain">
            <CommandEmpty className="px-2.5 py-6 text-foreground-subtle">{emptyLabel}</CommandEmpty>
            <CommandGroup className="p-1">
              <CommandItem
                value={customLabel}
                className="min-h-8 cursor-pointer px-2 text-ui-base"
                onSelect={() => {
                  setCustomMode(true);
                  setDraft(value);
                }}
              >
                <span className="truncate">{customLabel}</span>
              </CommandItem>
              {hasValue ? (
                <CommandItem
                  value={useDefaultLabel}
                  className="min-h-8 cursor-pointer px-2 text-ui-base"
                  onSelect={() => {
                    onValueChange("");
                    setOpen(false);
                  }}
                >
                  <span className="truncate">{useDefaultLabel}</span>
                </CommandItem>
              ) : null}
              {showCurrentOnlyItem ? (
                <CommandItem
                  value={value}
                  data-checked="true"
                  className="min-h-8 cursor-pointer px-2 text-ui-base"
                  onSelect={() => {
                    setOpen(false);
                  }}
                >
                  <span className="truncate" style={{ fontFamily: value }}>
                    {value}
                  </span>
                </CommandItem>
              ) : null}
              {systemFamilies.map((family) => {
                const selected = family.toLowerCase() === trimmedValue.toLowerCase();
                return (
                  <CommandItem
                    key={family}
                    value={family}
                    data-checked={selected ? "true" : undefined}
                    className="min-h-8 cursor-pointer px-2 text-ui-base"
                    onSelect={() => {
                      onValueChange(family);
                      setOpen(false);
                    }}
                  >
                    {/* 用字体族自身渲染这一行：选之前就能看出长什么样，这正是选择器的价值。 */}
                    <span className="truncate" style={{ fontFamily: family }}>
                      {family}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
