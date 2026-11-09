# 外观扩展层（theme-ext）—— 移植与升级说明

这一层是**独立于 ZCode 上游代码**的外观扩展：配色主题与界面/代码字体都以「纯数据 + 注册表 + 应用函数」的形式放在本目录里，效果最终只落在 `document.documentElement` 的内联 CSS 自定义属性上。

因此 ZCode 升级到新版本后，**不需要重新读一遍上游实现**：把本目录整体拷过去，再重放下面「上游接入点」列出的少数几处即可。

---

## 1. 为什么用内联 CSS 变量

| 事实 | 出处（`ZCode-3.17.2/` 相对路径） |
| --- | --- |
| 主题是一组 CSS 自定义属性，声明在 `:root` 与 `.dark` / `.theme-zai-light` / `.theme-zai-dark` 三个 class 块里 | `packages/ui/src/styles.css:78`、`:343`、`:517`、`:683` |
| 这些 class 声明**都没有 `!important`**（全仓 `!important` 只出现在根背景、动效暂停、焦点环三处） | `packages/ui/src/styles.css:73`、`:96-97`、`:130-132`、`:136-140` |
| 根元素上的**行内声明在层叠中高于任何选择器匹配**，所以内联写同名变量必定胜出 | CSS Cascade 规范 |
| 上游自己就用这个手法覆盖界面字号（写内联 `--ui-font-size`），且被 571 个文件的 `calc(var(--ui-font-size) ± Npx)` 派生链消费 | `packages/ui/src/lib/uiFontSize.ts:20-27`、`packages/ui/src/styles.css:152-164` |
| `@theme` 是普通 `@theme`（非 `@theme inline`），所以 `.font-mono` 生成 `font-family: var(--font-mono)`，改一个变量 447 处类用法一起跟随（含 `@pierre/diffs` 的 Shadow DOM，custom property 会继承穿透） | `packages/ui/src/styles.css:145`、`:148-150`；`packages/ui/src/components/ui/code-viewer.tsx:721`、`packages/ui/src/components/ui/diff-viewer.tsx:72` |

**结论**：这一层完全不改 `styles.css`，也就不存在「上游改了样式文件、我的补丁冲突」这种升级成本。

两个必须记住的反向约束：

1. **不要给字体变量加 `@property`。** 全仓只有 `packages/ui/src/styles.css:2365-2369` 一处 `@property`（滚动条）。给 `--font-sans` / `--font-mono` 注册 `@property` 后，非法内联值会被静默丢弃并回落 `initial-value`，表现为「设置不生效且控制台无报错」。
2. **不要用 `!important` 写字体/颜色。** 一旦上游或我们自己加了 author `!important`，行内非 `!important` 声明会被击败，覆盖随即失效。

---

## 2. 目录结构

```
packages/ui/src/theme-ext/
├── UPGRADE.md              ← 本文件
├── index.ts                ← 对外 barrel
├── types.ts                ← ColorPack / ThemeExtSettings / AppliedThemeSnapshot 等契约
├── color.ts                ← 色彩数学（hex/rgb、alpha、mix、ramp 插值、WCAG 亮度与对比度、CIE L*、对比度守卫 guardTo / safeTint）
├── fonts.ts                ← 字体族字符串规范化 + 兜底栈拼装（用户族名前置到上游栈之前）
├── settings.ts             ← 持久化（localStorage 单键、容错、变更事件）
├── registry.ts             ← 配色包注册表（原生 + 随包主题）
├── markdown.ts             ← Markdown 富文本着色：角色键、`--zcode-md-*` 变量、静态样式表
├── runtime.ts              ← 唯一 DOM 边界：写内联变量、注入/移除 Markdown 样式表、跟随明暗切换、到处同步
├── useThemeExt.ts          ← React 绑定（设置页用，不需要新增 props）
└── packs/
    └── everforest/
        ├── palette.ts      ← Everforest 6 档调色板原始数据（浅/深 × 柔和/中等/强烈）
        ├── tokens.ts       ← 调色板 → ZCode 162 个 `--color-*` token 的映射 + `everforestMarkdownRoles()`
        └── index.ts        ← 组装成 ColorPack（变体 auto/soft/medium/hard + 预览色板 + Markdown 角色 + 变体预览条）
```

---

## 3. 上游接入点（全量，只有 5 处）

升级 ZCode 后按顺序核对这 5 处即可，其余全部在扩展层内部自洽。

### 3.1 装配（必需，1 行）

`packages/ui/src/index.ts` 末尾：

```ts
// 外观扩展层：随 UI 包一起装配（幂等、可在任意窗口安全重复调用）。
export { installThemeExt, uninstallThemeExt, isThemeExtInstalled, setThemeExtSettings, getThemeExtSnapshot }
  from "./theme-ext/runtime.js";
import { installThemeExt } from "./theme-ext/runtime.js";

installThemeExt();
```

`installThemeExt()` 自带 `typeof document === "undefined"` 守卫，在非浏览器环境直接返回，因此放在 barrel 里是安全的。它做四件事：

1. 读持久化设置并应用一次；
2. `MutationObserver` 监听根元素 `class` 变化 → 跟随明暗切换重放（上游 `applyTheme` 必然 toggle `dark` / `theme-zai-light` / `theme-zai-dark`，见 `packages/ui/src/useTheme.ts:58-70`，所以**不需要**在上游插入任何调用）；
3. 订阅同文档变更事件；
4. 订阅 `storage` 事件与 `window` focus → 覆盖「另一个窗口改了设置」。

> 注意：`export { x } from "…"` 只在导出侧建立绑定，**不会**在当前作用域声明 `x`，所以调用点必须另有一条 `import { installThemeExt } from "./theme-ext/runtime.js";`，否则是 `ReferenceError`。
>
> 若上游把 `packages/ui/src/index.ts` 的导出结构调整了，这行仍然有效（它只要求这个文件被任一入口引用到）。

装配时机可能早于 `<body>` 存在、或早于样式表就绪（此时 Web 端 `body` 的字体盖不上、原生 `--font-*` 也读不到）。`installThemeExt()` 因此在 `document.readyState === "loading"` 或缺少 `body` 时额外挂一次 `DOMContentLoaded` 重放；`captureNativeFontStacks()` 也只在读到非空值时才落缓存，允许稍后重试，不会永久塌到硬编码兜底栈。

### 3.2 设置页 UI（可选，只在要改外观面板时需要）

`packages/ui/src/settingsCodePreview.tsx` 里新增了四行设置项。它们全部通过 `useThemeExt()` 读写，**没有新增任何 props**，所以 `SettingsPage.tsx` 不用改。

升级后如果这个文件被重写，按下面四处重新插入即可：

| 设置项 | 位置 | 控件 |
| --- | --- | --- |
| 配色方案 | 「界面设置」卡片，紧跟「界面主题」之后 | `Select`，选项来自 `themeExt.packs`，含 `detail` 色板条 |
| 对比强度 | 紧跟「配色方案」，仅当所选包 `variants.length > 0` 时渲染 | `Select`，选项来自 `activeColorPack.variants` |
| 界面字体 | 「界面设置」卡片，紧跟「界面字号」之后 | `FontFamilyInput`（`controlLayout="wide"`） |
| 代码字体 | 「代码设置」卡片，紧跟「代码字号」之后 | `FontFamilyInput`（`controlLayout="wide"`） |

同时需要保留 `resolveMessage()` / `FontFamilyInput` / `ColorPackSwatches` 三个本地组件，以及 `getColorPack` / `resolveColorPackVariantId` 两个 import。

**纯数据回退**：即使忘了补 3.3 的 i18n，`resolveMessage()` 会检出「`formatMessage` 原样返回 id」，回退到 `ColorPack.label` / `ColorPackVariant.label`，界面仍然可读。

### 3.3 i18n（可选，2 个文件）

`packages/ui/src/i18n/locales/zh-CN.ts` 与 `en-US.ts` 各加同一组 key（扩展层用到的全部 key）：

```
settings.appearance.colorPack
settings.appearance.colorPackDescription
settings.appearance.colorPack.<packId>              // native / everforest
settings.appearance.colorPackStrength
settings.appearance.colorPackStrengthDescription
settings.appearance.colorPackStrength.<variantId>   // auto / soft / medium / hard
settings.appearance.uiFontFamily
settings.appearance.uiFontFamilyDescription
settings.appearance.uiFontFamilyPlaceholder
settings.appearance.codeFontFamily
settings.appearance.codeFontFamilyDescription
settings.appearance.codeFontFamilyPlaceholder
```

`IntlProvider.formatMessage` 找不到 key 时原样返回 id（`packages/ui/src/i18n/IntlProvider.tsx:104-118`），所以漏 key 不会白屏，只会显示 id 字符串。

### 3.4 Markdown 作用域 class（可选，只在要移植 Markdown 富文本着色时需要）

`packages/ui/src/components/ai-elements/message.tsx` 的 `responseClassName`（约 `:1478-1486`）里加一个标记 class：

```ts
const responseClassName = cn(
  "size-full text-ui-base leading-[1.75] tracking-wide [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "zcode-md", // ← 外观扩展层的 Markdown 作用域锚点
  className,
);
```

这一行是整套 Markdown 着色**唯一**的上游触点：扩展层的样式表全部以 `.zcode-md` 为前缀，
只作用于消息正文，不会碰到设置页、插件 UI、侧栏等其他地方的 Markdown。

为什么加在 `className` 而不是 `data-*` 属性上：`responseClassName` 最终传给 `<Streamdown>`，
而 Streamdown 的 `StreamdownProps` 没有 index 签名（不接受任意属性），但它的根节点会原样
带上传入的 `className`。升级后如果这个变量被改名或挪走，用
`grep -n "zcode-md" packages/ui/src/components/ai-elements/message.tsx` 定位即可。

---

## 3.5 Markdown 富文本着色（**不移植就退回原生单色**）

ZCode 的 `--color-*` token 里没有「标题色 / 强调色 / 行内代码色」，Markdown 正文的
标题、粗体、行内代码、链接全部继承 `--color-foreground`。所以只覆盖 token 的话，
换主题后正文是一片同色的灰绿。上游 dsh-everforest 单独给 Markdown 算了一套角色色，
扩展层按同样思路实现：

| 文件 | 职责 |
| --- | --- |
| `markdown.ts` | 角色键清单、变量名前缀、`--zcode-md-*` 转换、**静态样式表** |
| `packs/everforest/tokens.ts` 的 `everforestMarkdownRoles()` | 由调色板算角色色（6 个标题 + 强调 + 行内代码 + 链接 + 表格底纹…） |
| `runtime.ts` | 写内联变量 + 注入/移除 `<style id="zcode-theme-ext-markdown">` |

两条容易踩的硬约束：

1. **样式表必须跟着主题包一起进出**。样式表里写的是 `color: var(--zcode-md-h1)`，
   变量未定义时 CSS 会在**计算值阶段**把这条声明判为非法并回退成 `inherit`
   （`background-color` 回退成 `initial`），既改坏原生外观又不报任何错。
2. **角色表必须全量**。`runtime.ts` 用
   `providedMarkdownRoles(roles).length === MARKDOWN_ROLE_KEYS.length` 判断是否注入；
   只提供一部分角色时整张样式表都不注入，避免「悄悄半生效」。

对比度门槛刻意用 **3:1** 而不是 4.5:1（照搬上游的取舍）：浅色主题下 Everforest 的
紫 / 蓝 / 青在奶油色画布（`#FFFBEF`）上到不了 4.5:1，硬守会让六个标题全部塌成正文墨色、
颜色彻底消失。承载正文的染色面（表格斑马纹、引用块填充）则仍按 4.5:1 守卫。

`markdown.smoke.mts` 会校验：角色表完整性、每个角色在其所有可能背景上的对比度、
染色面上的正文对比度、样式表变量名与角色键一一对应。

---

### 3.6 代码块语法高亮（可选）

配色靠**一个恒定主题名 + 一组 CSS 变量**下发，所以「移植」= 让这四个消费者都认识这个名字：

| 文件 | 要加的东西 |
| --- | --- |
| `packages/ui/src/lib/codeThemeBridge.ts`（**新增**） | 中立桥：provider + 恒定名 `CODE_THEME_VARIABLES_NAME`（`"everforest-tokens"`）+ 修订号（`subscribeCodeTheme` / `getCodeThemeRevision`）。不引 DOM / shiki / 本层。 |
| `packages/ui/src/theme-ext/codeTheme.ts`（**新增**） | 纯函数：`everforestCodeTheme(scheme, strength)`（shiki 主题对象，token 色是 `var(--diffs-token-*, 守卫后的 hex)`）与 `everforestCodeThemeVariables(scheme, strength)`（根元素要写的 `--diffs-*` 表）。 |
| `packages/ui/src/theme-ext/runtime.ts` | `applyThemeExt` 里多写一步 `writeCodeThemeVariables(...)`（独立账本，切回 `native` 时清空）+ 末尾 `notifyCodeThemeChanged()`；`installThemeExt()` / `uninstallThemeExt()` 注册与注销 provider。 |
| `packages/ui/src/lib/shikiHighlighter.ts` | `getResolvedCodeTheme()` 开头问一句 `getCodeThemeOverride()`：有覆盖就用覆盖（走 `createHighlighter({ themes: [对象] })`），其余分支原样保留。 |
| `packages/ui/src/lib/diffsHighlighterEngine.ts` | `ensureCodeThemeVariablesRegistered()`（主线程、幂等，`registerCustomCSSVariableTheme("everforest-tokens", defaults)`）+ `createDiffsWorkerHighlighterOptions` 里把两个槽位解析成那个恒定名。 |
| `packages/ui/src/lib/codePreviewPreferences.ts` | `CodePreviewThemeName` + `resolveCodePreviewTheme` / `resolveCodePreviewThemePair`（接管时返回恒定名）。 |
| `packages/ui/src/components/ui/code-viewer.tsx` | `resolvedTheme = getCodeThemeVariablesName() ?? theme`；`file.cacheKey` 拼修订号；`resolveCodeViewerColorScheme` 对恒定名按根元素 `dark` class 判明暗。 |
| `packages/ui/src/root/DiffsWorkerPoolProvider.tsx` | 选项依赖里加 `useCodeThemeRevision()`。 |

变量键是**裸键**（`token-comment`，不是 `--diffs-token-comment`）——`registerCustomCSSVariableTheme`
内部把它交给 shiki 的 `createCssVariablesTheme`，前缀由库自己拼；写成带前缀的键会被静默忽略。
只认 12 个 token 槽 + `foreground` / `background`，18 个语义槽要收拢（表见
`docs/ui-theme-extension-layer.md` §8.2）。

机制、缓存键、修订号与已知边界见仓库根目录 `docs/ui-theme-extension-layer.md` §8。

## 4. 新增一个配色主题

1. 建 `packs/<id>/`，导出 `ColorPack`；
2. 在 `registry.ts` 的 `EXTERNAL_COLOR_PACKS` 里加一项；
3. （可选）补 3.3 的 i18n key。

硬约束（`types.ts:22-28` 有注释，`tokens.ts` 里有 `assertSameTokenKeys()` 可断言）：

> 同一个 `variantId` 下，`tokens("light", v)` 与 `tokens("dark", v)` 必须返回**完全相同的 key 集合**。

原因：内联变量在切换明暗时不会自动清空，只在一个方案里出现的 key 会残留并在另一方案下继续生效。

---

## 5. 移植 Everforest 时做的删减

来源：`C:\Users\YBY\.dsh\profiles\desktop\node_modules\dsh-everforest`（v1.4.0，MIT，作者 FormalistBlue）。**只读参考，未修改该目录**。

| 上游（DSH 插件） | 本目录 | 说明 |
| --- | --- | --- |
| `src/color.js` | `color.ts` | 语义一一对应，加了类型与中文注释 |
| `src/palette.js` | `packs/everforest/palette.ts` | 数据逐条照抄（含全部 hex），深冻结 |
| `src/tokens.js` | `packs/everforest/tokens.ts` | 命名空间从 `--dsw-*`（217 个）换成 ZCode 的 `--color-*`（162 个）；保留三层映射策略与对比度守卫 |
| `src/state.js` | `settings.ts` | 存储键换成 `zcode-theme-ext/v1`；同样「解析失败静默降级」 |
| `index.js`（Host 半：Loader 行、`cordis.patch.yml` 持久化、`webserver/index-inject` 首屏注入） | `runtime.ts` | **整套丢掉**。ZCode 没有对应的 Host 扩展点，改为纯前端 localStorage + 内联变量 |
| `client.js` 里的设置表单 / Markdown 着色 / 侧栏高亮 / 表格列宽记忆 / 聚光灯动画 | 未移植 | 依赖 DSH 自身的组件与 DOM 结构，属于上游私有实现，搬过来只会绑死版本 |
| `src/tokens.js` 的 41 条 `COMPAT_ALIASES` | 未移植 | 那是给「猜错 token 名的第三方插件」兜底的桥接表，ZCode 里没有这个生态 |

### 已知取舍

- **首屏有一帧原生配色**：设置页初始化只在 `packages/web/index.html:16-109` 与 `packages/desktop/src/renderer/src/main.tsx:77-101` 里读 `zcode-theme`，不带本扩展层的键。要消除这一帧，需要往这两处各加一次「读 localStorage → 写内联变量」的内联脚本；我们刻意没动它们，以保持扩展层零侵入。当前表现：应用启动后极短时间内是原生配色，随后被扩展层覆盖。
- **Web 端界面字体双写**：桌面端正文来自 Tailwind preflight 的 `--font-sans`，Web 端正文来自 `packages/web/index.html:122-127` 常驻 head 的 `body { font-family: Inter, … }`。`runtime.ts` 的 `writeFonts()` 因此同时写 `documentElement` 与 `document.body` 的行内 `font-family`，两条路径都覆盖。
- **代码字体只改 `--font-mono`**：仓库里约 447 处 `font-mono` 类已经全部收敛到这一个变量（路径、ID、快捷键、模型名、commit hash 也在其中）。这是「一处生效」和「只作用于代码块」之间的取舍，选了前者。

---

## 6. 调试与卸载

```js
// 应用了哪些 token
document.documentElement.getAttribute("data-zcode-theme-ext")   // "everforest:dark:auto"
getThemeExtSnapshot()                                            // tokenCount / 生效字体栈
localStorage.getItem("zcode-theme-ext/v1")

// 完全卸回原生外观
uninstallThemeExt();
localStorage.removeItem("zcode-theme-ext/v1");
```

---

## 7. 跨窗口同步（当前实现与后续接法）

当前实现：`settings.ts` 用 `localStorage` + `storage` 事件 + `window` focus 重读。同一源（同 partition）的窗口之间自动同步；Electron 里不同 `BrowserWindow` 若不共享分区，则不自动同步。

上游已有的正规通路（如需改成它）：`packages/ui/src/store/index.ts:244-251` 的 `BROADCAST_FIELDS` + `state:` 频道，配合 `applyingBroadcast` 防回环（规范见 `packages/ui/AGENTS.md`）。接法是把颜色包 id、变体 id、两个字体字段加进 `BROADCAST_FIELDS`，并在 `:524-561` 的接收分支与 `:563-569` 的收尾里各补一次 `applyThemeExt()`；**这会侵入上游 store，只在确实需要跨窗口同步时做。**

---

## 8. 离线自检（不依赖 `node_modules`）

仓库还没装依赖、跑不了 `pnpm typecheck` / `vitest` 时，用仓库外的独立自检脚本验证扩展层本体：

```powershell
$src = "ZCode-3.17.2\packages\ui\src\theme-ext"
$dst = "_smoke\theme-ext"
Copy-Item "$src\*" $dst -Recurse -Force          # 复制一份
# 把 .js 后缀的 ESM specifier 改写成 .ts（否则 Node 解析不了）
Get-ChildItem $dst -Recurse -File -Include *.ts | ForEach-Object {
  $t = Get-Content $_.FullName -Raw
  $t = [regex]::Replace($t, 'from "(\.{1,2}/[^"]+)\.js"', 'from "$1.ts"')
  Set-Content -Path $_.FullName -Value $t -NoNewline -Encoding utf8
}
cd _smoke
node --experimental-strip-types --no-warnings theme-ext.smoke.mts
```

断言覆盖：162 个 token × 4 变体 × 2 明暗（key 数、key 集合一致、值都是合法颜色/渐变、`--lucide-subtlest-opacity` 是 0~1 数值）、六档 `--color-background` 与上游 `palette.js` 期望值逐条比对、14 个承载文字的表面与 `--color-foreground` 的对比度 ≥ 4.5（WCAG AA）、`previewColors` 全为 hex、未知包/未知变体的回退、字体族规范化的 9 个用例、设置归一与合并。全过时输出 `ALL PASS`。

### 8.1 代码主题（`codeTheme.ts`）自检

`codeTheme.ts` 依赖 `color.ts` / `types.ts` / `packs/everforest/*`，所以自检脚本用一条
现成命令生成副本再跑（复制 `.ts`、把相对说明符的 `.js` 改回 `.ts`）：

```powershell
cd D:\项目\DSH\Zcode开源重构
node --no-warnings _smoke\code-theme.prepare.mjs      # -> _smoke\code-theme-src\
node --no-warnings --experimental-strip-types _smoke\code-theme.smoke.mts
```

断言覆盖：六档主题名唯一且等于 `everforest-${scheme}-${strength}`、`theme.type` 与 scheme
一致、`colors.background` 与首条兜底规则的 `background` 都是 `#00000000`、
`colors.foreground` 是 hex、规则数 = 1 兜底 + 18 语义槽、**没有 scope 被两条规则抢占**、
19 个点名 scope 全覆盖、每条规则的颜色在 `--color-card` 与 `--color-background` 上
≥ 4.5:1、同档位前景色去重后 ≥ 5 种（守卫没把主题压成单色）。全过时输出 `ALL PASS`。
