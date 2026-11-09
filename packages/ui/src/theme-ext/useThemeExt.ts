/**
 * 主题扩展层 —— React 绑定。
 *
 * 设置页只需要 `useThemeExt()` 就能拿到「当前配色包 / 变体 / 字体」并直接写入，
 * 因此 `settingsCodePreview.tsx` 的签名与调用方（`SettingsPage.tsx`）都不用改，
 * 扩展层也就不必往上游 store 里加字段。跨窗口同步按需接到宿主广播（见 UPGRADE.md）。
 */

import { useCallback, useEffect, useState } from "react";
import { COLOR_PACKS } from "./registry.js";
import {
  getThemeExtSnapshot,
  installThemeExt,
  readColorScheme,
  setThemeExtSettings,
  subscribeThemeExtSnapshot,
} from "./runtime.js";
import { loadThemeExtSettings, subscribeThemeExtChange } from "./settings.js";
import type {
  AppliedThemeSnapshot,
  ColorPack,
  ThemeExtSettings,
  ThemeExtSettingsPatch,
} from "./types.js";

export interface ThemeExtController {
  readonly settings: ThemeExtSettings;
  readonly snapshot: AppliedThemeSnapshot | null;
  /** 当前生效的明暗，供预览卡片使用。 */
  readonly scheme: "light" | "dark";
  readonly packs: readonly ColorPack[];
  /** 合并式更新；同步生效并落盘。 */
  readonly update: (patch: ThemeExtSettingsPatch) => void;
}

export function useThemeExt(): ThemeExtController {
  const [settings, setSettings] = useState<ThemeExtSettings>(() => loadThemeExtSettings());
  const [snapshot, setSnapshot] = useState<AppliedThemeSnapshot | null>(() => getThemeExtSnapshot());

  useEffect(() => {
    // 幂等：正常路径下 App 启动时已经装过，这里兜住「设置页先加载」的情况。
    installThemeExt();
    return subscribeThemeExtSnapshot(setSnapshot);
  }, []);

  useEffect(() => subscribeThemeExtChange(setSettings), []);

  const update = useCallback<ThemeExtController["update"]>((patch) => {
    // setThemeExtSettings 内部已经 emit 变更事件，上面那个订阅会把新值同步回来；
    // 这里先本地 set 一次，避免依赖事件往返造成的一帧延迟。
    setSettings((current) => ({ ...current, ...patch, fonts: { ...current.fonts, ...patch.fonts } }));
    setThemeExtSettings(patch);
  }, []);

  return {
    settings,
    snapshot,
    scheme: snapshot?.scheme ?? readColorScheme(),
    packs: COLOR_PACKS,
    update,
  };
}
