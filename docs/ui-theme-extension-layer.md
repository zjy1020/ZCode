# 外观扩展层（theme-ext）

> 状态：已实现（3.17.2 上验证通过）
> 相关代码：`packages/ui/src/theme-ext/`
> 上游来源：DeepSeek Harness 主题插件 `dsh-everforest@1.4.0`（MIT，作者 FormalistBlue）

## 1. 要解决的问题

ZCode 的「外观」页面原有能力只有四项：界面主题（浅/深/系统）、界面字号、代码主题（shiki 内置
主题列表）、代码字号。相对成熟的主题插件生态，缺三块：

1. **正文字体族完全不可配置**。`packages/ui/src/styles.css` 全文没有一条 `font-family`
   声明（只有 `--font-mono` 一个变量），正文字体完全由 Tailwind v4 的默认栈提供，
   Web 端另由 `packages/web/index.html` 的 `body { font-family: Inter, … }` 覆盖。
2. **配色只有深浅两态**，没有第三方配色包的位置——`Theme` 是五个字符串字面量的封闭联合
   （`packages/ui/src/useTheme.ts:3`），`isTheme()` 是白名单，`applyTheme` 只 toggle
   `dark` / `theme-zai-light` / `theme-zai-dark` 三个 class。
3. **Markdown 正文只有一种颜色**。`--color-*` token 里没有「标题色 / 强调色 / 行内代码色」，
   标题、粗体、行内代码、链接全部继承 `--color-foreground`，所以“换个主题”只换底色，
   正文永远是一片同色的灰绿。

## 2. 范围

包含：

- 配色包（color pack）注册表与运行时切换，含「对比强度」变体；
- 界面字体族、代码字体族；
- Markdown 富文本着色（标题六色、强调、行内代码、链接、列表符号、引用块、分隔线、
  表格底纹/斑马纹/悬停行、任务列表复选框、选区）；
- **代码块语法高亮跟随配色包**：由上游调色板现算 shiki 主题对象，接到
  `packages/ui/src/lib/shikiHighlighter.ts` 这条高亮路径上（机制见 §8）；
- 与上述能力配套的「外观」设置项。

不包含（明确留给后续）：

- **围栏代码块（聊天正文里的 ``` 代码块）**。它不经过 `lib/shikiHighlighter.ts`，
  而是 `message.tsx` → `CodeBlock` → `CodeViewer` → `@pierre/diffs` 自建的 shiki，
  主题是具名字符串（`packages/ui/src/lib/codePreviewPreferences.ts:9-20` 的
  `CODE_PREVIEW_THEME_OPTIONS`），扩展层改不到。接法与两处已知坑见 §8.4。
- 图标替换、首屏 loading 配色、深浅切换动画、表格列宽拖拽记忆。上游插件有，本移植暂不做。

## 3. 机制：为什么可以零改动上游 CSS

`styles.css:145` 的 `@theme { … }` 会把变量落到 `:root`，与 `.dark` / `.theme-zai-*`
同为一个 class 的特异性 (0,1,0)；而写在 `document.documentElement` 上的**内联**声明
在层叠中高于任何选择器匹配。因此：

> 把 `--color-*` 写成根元素内联样式，即可整包替换配色，`styles.css` 一行都不用改。

这个机制在仓库里已有先例：`packages/ui/src/lib/uiFontSize.ts:20-27` 就是这么覆盖
`--ui-font-size` 的，且 571 个文件依赖 `calc(var(--ui-font-size) ± Npx)` 派生链。

两条前提（升级时要复核）：

- 目标声明**没有 `!important`**。当前 `styles.css` 里的 `!important` 只出现在
  html/body/#root 背景、`[data-document-hidden]` 的动画禁用、focus 轮廓三处，
  没有任何 `font-family` 或 `--font-*` 用了它。
- `@theme` **不能变成 `@theme inline`**。后者会把变量值内联进工具类，变量覆盖立即失效。

字体变量刻意**不注册 `@property`**：注册后非法值会被静默丢弃并回落到 `initial-value`，
表现为「设置不生效且不报错」。仓库目前只有 `--zcode-scrollbar-thumb` 一处 `@property`。

## 4. 模块划分

| 文件 | 职责 |
| --- | --- |
| `types.ts` | `ColorPack` / `ThemeExtSettings` / `AppliedThemeSnapshot` 等契约 |
| `color.ts` | 色彩数学：hex/rgb、`alpha`、`mix`、色阶插值、WCAG 亮度与对比度、CIE L\*，以及对比度守卫 `meetsContrast` / `guardTo` / `safeTint` |
| `fonts.ts` | 字体族字符串规范化（拒绝 `\<>{};:!()`，通用族名不加引号）+ 兜底栈拼装 |
| `settings.ts` | 持久化到 `localStorage["zcode-theme-ext/v1"]`，读写全部 try/catch |
| `registry.ts` | 配色包注册表；`nativeColorPack` 的 `tokens()` 恒返回空表，等于「摘掉全部覆盖」 |
| `markdown.ts` | Markdown 角色键、`--zcode-md-*` 变量名、静态样式表 |
| `runtime.ts` | **唯一的 DOM 边界**：写内联变量、注入/移除 Markdown 样式表、跟随明暗切换、跨窗口同步 |
| `useThemeExt.ts` | React 绑定（设置页用，因此不需要给 `AppearanceSectionContent` 加 props） |
| `packs/everforest/` | Everforest 调色板、token 映射、Markdown 角色、变体预览 |
| `UPGRADE.md` | 升级 ZCode 后如何重放这套改动（含上游接入点清单与离线自检步骤） |

## 5. 上游接入点（只有 5 处）

1. `packages/ui/src/index.ts` —— `import { installThemeExt }` + `installThemeExt()`。
   注意 `export { x } from "…"` 不在当前作用域建立绑定，必须另写一条 `import`。
2. `packages/ui/src/settingsCodePreview.tsx` —— 外观页的六个设置项。
3. `packages/ui/src/i18n/locales/{zh-CN,en-US}.ts` —— 对应 i18n key。
4. `packages/ui/src/components/ai-elements/message.tsx` —— `responseClassName` 里加一个
   `zcode-md` 标记 class，作为 Markdown 样式表的作用域锚点（Streamdown 的 props 没有
   index 签名，不能传任意属性，但根节点会原样带上传入的 `className`）。
5. `packages/ui/src/lib/shikiHighlighter.ts` —— 解析主题时先问一句
   `getCodeThemeOverride()`（桥见 `packages/ui/src/lib/codeThemeBridge.ts`，新增文件，
   无依赖）。这一处只加「问一句」的分支：没有 provider 时行为与本移植前完全一致。

`installThemeExt()` 幂等、在非 DOM 环境直接返回，并且用 `MutationObserver` 监听根元素
`class` 变化来跟随明暗切换，所以**不需要**在 `applyTheme` 里插调用。

## 6. 设置项与持久化

界面设置：界面主题 → 配色方案 → 对比强度（可视化档位卡片）→ 界面字号 → 界面字体。
代码设置：浅色代码主题 → 深色代码主题 → 显示行号 → 长行自动换行 → 代码字号 → 代码字体。

扩展层自己的设置走**独立存储键** `zcode-theme-ext/v1`，与 ZCode 自身的 `zcode-theme`、
`zcode-ui-font-size-px` 分开：移除扩展层只需删一个键，不会影响原生设置。

跨窗口同步现状与后续接法（要接 `store` 的 `state:` 频道该改哪几行）记在 `UPGRADE.md` §7。

## 7. 已知取舍

- **首屏一帧原生配色**。扩展层在模块加载期应用，而 Web 端的引导脚本
  （`packages/web/index.html:16-109`）只处理原生主题，不认扩展层设置。
- **Web 端界面字体要双写**。桌面端正文继承自 `html`，Web 端 `body` 有自己的
  `font-family` 声明，所以 `writeFonts()` 同时写 `--font-sans`、`root.style.fontFamily`
  与 `body.style.fontFamily`。
- **代码字体只改 `--font-mono` 一个变量**。全仓 447 处 `font-mono` 类会一起跟随，
  包括路径、标识符、快捷键、模型 ID、commit hash——这是有意的，避免「代码字体只对
  代码块生效、其他地方仍是原来那套」的半生效状态。
- **Markdown 角色表的对比度门槛是 3:1**（承载正文的染色面仍是 4.5:1）。浅色主题下
  Everforest 的紫/蓝/青在奶油色画布上到不了 4.5:1，硬守会让六个标题全部塌成正文墨色。
- **角色表必须全量提供**。缺任何一个角色，整张样式表都不注入——因为样式表引用全部 20 个
  变量，缺一个就会让那一条声明在计算值阶段回退成 `inherit`/`initial`，属于「悄悄半生效」。

## 8. 代码块语法高亮跟随主题

### 8.1 机制：一个恒定主题名 + 一组 CSS 变量

依赖方向是硬约束：`theme-ext/` 是上层、`packages/ui/src/lib/` 是叶子库，
只允许「上层 → 叶子」，叶子库 import 扩展层会让「摘掉扩展层」变成编译错误。
但「代码块用哪套配色」必须由扩展层决定，于是双方各持一半，桥放在中间：

| 文件 | 角色 |
| --- | --- |
| `packages/ui/src/lib/codeThemeBridge.ts`（新增） | 中立桥：存一个 provider 函数（`setCodeThemeProvider` / `getCodeThemeOverride`）与恒定主题名 `CODE_THEME_VARIABLES_NAME = "everforest-tokens"`，另带 `getCodeThemeVariablesName` / `getCodeThemeRevision` / `subscribeCodeTheme` / `notifyCodeThemeChanged`。不引 DOM、不引 shiki、不引扩展层。 |
| `packages/ui/src/theme-ext/codeTheme.ts`（新增） | 纯函数：`everforestCodeTheme(scheme, strength)` 生成 shiki 主题对象；`everforestCodeThemeVariables(scheme, strength)` 生成根元素要写的 `--diffs-*` 变量表。无 DOM、无副作用。 |
| `packages/ui/src/theme-ext/runtime.ts` | `applyThemeExt` 里多写一步 `writeCodeThemeVariables(...)`（独立账本，切回 `native` 时清空），并在 apply 末尾 `notifyCodeThemeChanged()`；`installThemeExt()` 注册 provider、`uninstallThemeExt()` 注销。 |
| `packages/ui/src/lib/shikiHighlighter.ts` | 解析主题时先问桥：有覆盖就用覆盖（`highlighter.loadTheme` 认这个对象），没有就走 shiki 自带主题。 |
| `packages/ui/src/lib/diffsHighlighterEngine.ts` | `ensureCodeThemeVariablesRegistered()` 在主线程注册变量主题（幂等）；`createDiffsWorkerHighlighterOptions` 在扩展层接管时把两个槽位都解析成**同一个**恒定名。 |
| `packages/ui/src/root/DiffsWorkerPoolProvider.tsx` | 订阅修订号，切包/切档时重建 `highlighterOptions`，`WorkerRenderOptionsSync` 随即把新渲染参数同步给 worker。 |
| `packages/ui/src/lib/codePreviewPreferences.ts` | 新增 `CodePreviewThemeName`、`resolveCodePreviewTheme` / `resolveCodePreviewThemePair`：扩展层接管时返回恒定名，否则返回设置页选的自带主题。 |

**为什么是「恒定名字 + 变量」而不是「每档一个主题」**：

1. `@pierre/diffs` 的 `registerCustomTheme` 对同名重复注册只打一条 `console.error` 然后返回，
   按档位起名就要注册六个近似主题；
2. 主题名参与 worker 池的 `renderOptions`，名字恒定意味着切档**不需要**重建 worker、
   也不需要重新初始化高亮器；
3. `createCssVariablesTheme` 生成的每个 token 颜色本身就是 `var(--diffs-token-<槽>)`，
   与扩展层「往 `documentElement` 写内联自定义属性」的手法天然同源——变量在根元素写一份，
   两个高亮引擎（shiki 与 `@pierre/diffs`）读的是同一批值，配色只有一处来源。

**两条路径的一致性来自同一个「颜色来源」**：`codeTheme.ts` 里 18 个语义槽先算出守卫后的
hex，shiki 主题把它当 `var(…)` 的兜底值，`@pierre/diffs` 变量表把它当变量值本身。
实测（shiki 3.23）token 颜色里的 `var(...)` 会被**原样透传**到渲染结果，所以这条约定成立。

优先级：**扩展层接管 > 调用方传入的具名主题**。扩展层未安装（或配色包是 `native`）时，
两条路径都回到原行为：shiki 走 `github-light`/`github-dark`，`@pierre/diffs` 走设置页选的
10 个自带主题。

### 8.2 12 个变量槽与 18 个语义槽的收拢

`@pierre/diffs` 的 CSS 变量主题只认 12 个 token 槽 + `foreground`/`background`（变量名
`--diffs-token-*` 与 `--diffs-foreground` / `--diffs-background`；**键名不带前缀**地写进
`registerCustomCSSVariableTheme` 的 `variableDefaults`，前缀由库自己拼）。
因此 18 个语义槽必须收拢，映射写在 `codeTheme.ts` 的 `CODE_SCOPE_ROLES[].diffsVariable` 里：

| 语义槽 | `--diffs-*` 变量 |
| --- | --- |
| comment | `--diffs-token-comment` |
| keyword | `--diffs-token-keyword` |
| string | `--diffs-token-string` |
| number / constant、variable、property | `--diffs-token-constant` |
| function、type / class | `--diffs-token-function` |
| attribute | `--diffs-token-parameter` |
| punctuation | `--diffs-token-punctuation` |
| tag、regexp | `--diffs-token-string-expression` |
| link | `--diffs-token-link` |
| operator | `--diffs-foreground` |
| diff 增 / 删 / 改 | `--diffs-token-inserted` / `-deleted` / `-changed` |
| invalid | 无槽（只在 shiki 侧生效） |

**一个变量只有一个值**，所以共用变量的角色色相必须一致——收拢后的色相以上游 shiki 槽映射
为准（`dsh-everforest/src/tokens.js:779-789`）：comment / punctuation = grey1、
constant = purple、function = green、keyword = blue、link = headerBlue、parameter = orange、
string / string-expression = yellow、diff 增删改 = green / red / orange，operator 用主文字色。
shiki 侧的 `var(--diffs-<槽>, hex)` 一旦变量生效读的就是那个值，兜底 hex 只在变量缺失时才
露面；两处不一致会出现「代码看着是紫的、`@pierre/diffs` 渲染成红的」这种只能靠肉眼发现的
问题，所以 `CODE_SCOPE_ROLES` 里同 `diffsVariable` 的条目必须写同一个 `slot`。

diff 行底纹另有三个 `-color-override` 变量：`--diffs-addition-color-override`、
`--diffs-deletion-color-override`、`--diffs-modified-color-override`。它们是
`@pierre/diffs` 里 `--diffs-<x>-base: var(--diffs-<x>-color-override, light-dark(…))` 链的
最外层，必须写——CSS 变量主题的 `colors` 里那些 `var(...)` 会被 shiki 归一化成
`#00000011` 这类占位色，不写 override 的话增删行底纹会变成一层透明黑。

### 8.3 缓存键与修订号：切档必须重画

- **shiki 路径**：主题名 = `` `everforest-${scheme}-${strength}` ``（如 `everforest-dark-soft`），
  它同时是 shiki 主题名、highlighter 缓存键（`` `${name}:${language}` ``）与 token 缓存键
  （`` `${name}:${language}:${长度}:${首100字符}:${末100字符}` ``）的一部分，所以必须随明暗与
  档位变化，否则切档会命中上一档的结果。
- **`@pierre/diffs` 路径**：名字恒定，能变的只有变量值，所以靠**修订号**驱动重画。
  修订号 = `` `${packId}:${scheme}:${strength}` ``（桥的 `ShikiThemeOverride.revision`），
  由 `hooks/useCodeThemeRevision.ts`（`useSyncExternalStore`）暴露给组件：
  `code-viewer.tsx` 把它拼进 `file.cacheKey`（`@pierre/diffs` 按 key 复用已渲染 token），
  `DiffsWorkerPoolProvider` 把它当作 options 的依赖。
- **主题对象每次现算都是新对象**，但 shiki 按**名字**注册与缓存、`@pierre/diffs` 按**名字**
  查注册表，所以同一档位不会重复注册，也不会串档。

### 8.4 与设置页「代码配色」下拉的关系

下拉本身**不动**（`CODE_PREVIEW_THEME_OPTIONS` 仍是 shiki 自带的 10 个主题）：
扩展层接管时代码配色由覆盖层决定，卡片里两个下拉下方会出现一行说明
（i18n key `settings.appearance.codeThemeFollowsPack`）；配色包切回 `native`
（= 关闭扩展层）时说明行消失，用户仍然自由选择这 10 个主题。
说明行的显示条件与桥完全同源：`supportsEverforestCodeTheme(packId)`。

设置页自己的主题预览仍走**纯函数** `getCodePreviewTheme(mode, settings)`，即如实显示用户
选的那个主题——接管与否是运行期状态，不该混进设置值的语义里。

### 8.5 已知边界

- **Streamdown 那条路不受影响**。`components/ai-elements/message.tsx:1508-1512` 把
  `[lightTheme, darkTheme]` 作为 `shikiTheme` 传给 Streamdown（它自带一份 shiki），
  自定义名字它不认识，所以这里保持传设置页的自带主题名。
- **围栏代码块的着色点**是 `message.tsx` → `CodeBlock` → `CodeViewer` → `@pierre/diffs`；
  接管点收在 `code-viewer.tsx` 内（`getCodeThemeVariablesName() ?? theme`），
  调用方不需要知道扩展层的存在。
- **invalid 槽在 `@pierre/diffs` 侧没有对应变量**，那个颜色只在 shiki 路径生效。
- **diff 底纹三项用上游原色**（`fg.green` / `fg.red` / `fg.blue`），不承载文字，因此不过
  4.5:1 守卫——它们只是背景混合的原料。
- **已经画出来的高亮不会自己重画**：靠修订号 + `file.cacheKey` 解决，但只覆盖订阅了
  `useCodeThemeRevision()` 的组件（`code-viewer.tsx`、`DiffsWorkerPoolProvider`）；
  其它直接把主题名写进 options 的地方（`lib/patchDiffOptions.ts` 等）会在下一次渲染时跟上。

## 9. 验证

- `pnpm run typecheck` / `pnpm run lint` 必须通过。
- 离线行为自检（不依赖 vitest 项目配置）：
  - `_smoke/theme-ext.smoke.mts` —— 162 个 token × 4 变体 × 2 方案、六档背景与上游
    调色板逐条比对、14 个承载文字表面的 WCAG AA、字体规范化用例；
  - `_smoke/markdown.smoke.mts` —— 20 个角色的完整性、每个角色在其所有可能背景上的
    对比度、染色面上的正文对比度、样式表变量名与角色键一一对应；
  - `_smoke/code-theme.smoke.mts` —— 六档代码主题（2 明暗 × 3 档位）的名字唯一性与
    `type`/透明背景、任务书点名的 19 个 scope 全覆盖且互不抢占、每条规则颜色（`var(…)` 的
    兜底 hex 和变量表里的值）在 `--color-card` 与 `--color-background` 上的 4.5:1、
    语义槽去重后不塌成单色、**12 个 `--diffs-token-*` 槽全覆盖**且每槽是 hex、
    三个 `--diffs-*-color-override` 都存在、六档变量表互不相同，以及**两条路径同源**：
    shiki 规则里 `var(--diffs-x, hex)` 的兜底值必须等于变量表里 `--diffs-x` 的值、
    `colors.foreground` 必须等于 `--diffs-foreground`、只有 `invalid` 一条走裸 hex。
    它与前两个脚本不同：导入的是 `_smoke/code-theme-src/` 副本，由
    `node _smoke/code-theme.prepare.mjs` 从真源码现生成（复制 + 改写说明符扩展名）。

  三个脚本都直接导入 `packages/ui/src/theme-ext/` 的**真源码副本**（只改写 import
  说明符扩展名），跑法与注意事项见 `UPGRADE.md` §8。
