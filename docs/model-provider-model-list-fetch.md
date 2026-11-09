# 从上游拉取模型列表（Add Model 免手填）

## 范围

自定义供应商的「添加模型」过去必须手写 model id。本文记录新增的「向上游 `GET /models`
拉取可选模型列表，点击填入」能力，覆盖桌面端与独立 Server 的本机 Host；手机 `/remote`
的 home 侧栏没有 workspace bridge，显式返回 `provider-unavailable`。

本能力**只读**：不发任何写请求，不写 `provider_config.json`，也不要求 model 已经存在——
它存在的意义正是为了让用户不必猜 model id 该填什么。

## 数据契约

`packages/shared/src/model-provider-types.ts:84` 新增条目类型：

```ts
export interface ProviderModelListItem {
  readonly modelId: string;
  /** 上游若给了人类可读名（Anthropic 的 `display_name`），原样带回。 */
  readonly displayName?: string;
}
```

`packages/shared/src/model-provider-types.ts:97` 的结果与 `ModelConnectivityResult` 同构
（`success` 判别 + `error.code`），理由见文件内注释：调用方需要把
`unsupported-api-format` 与 `missing-credentials` 当「正常分支」呈现（提示手填），
而不是弹红；如果换成独立的 `supported: false` 字段，调用方就要同时判两个字段。

```ts
export type ProviderModelListResult =
  | { readonly success: true; readonly models: readonly ProviderModelListItem[] }
  | {
      readonly success: false;
      readonly error: {
        readonly message: string;
        readonly code?:
          | "provider-unavailable"
          | "missing-credentials"
          | "unsupported-api-format"
          | "upstream-unreachable";
      };
    };
```

## 服务边界

能力挂在**已有的** `IProviderSettingsService` 上，不新建 service：

- `packages/services/src/model-provider/providerFacadeServices.ts:77`
  `listProviderModels(input: ProviderSettingsModelListRequest): Promise<ProviderModelListResult>`。
- 内部类型 `ProviderSettingsModelListInput`（`:106`，`{ providerId, baseUrl, apiType, apiKey?, headers? }`）、
  `ProviderSettingsModelListRequest`（`:116`，`{ providerId }`）、
  `ProviderSettingsModelLister`（`:120`）。
- 工厂 `createProviderSettingsService` 的第 4 个位置参数 `listModels?`（`:142`）。
- 实现 `:239`：`ensureReady()` → 未装配 lister 时抛
  `当前 Environment 未装配供应商模型列表能力` → `facade.waitForProviderOperations()` →
  从 `facade.getView().providers[]` 读 `enabled` / `effectiveConfig.api.baseUrl` /
  `effectiveConfig.api.type` / `effectiveConfig.access.apiKey` / `effectiveConfig.api.headers`。

**为什么不新建 `model-catalog` service**：`provider-settings` 频道已经存在于
`packages/shared/src/channels.ts`、`packages/services/src/accessor.ts`、
`packages/client/src/remoteServiceAccess.ts`、手机白名单
（`packages/desktop/src/host/windowHostAttachmentRpcPolicy.ts:50`）与远程 workspace 合同
（`remoteWorkspaceRpcContract.ts` / `remoteWorkspaceServiceCollection.ts`），
而 `ProxyChannel.toService`（`packages/rpc/src/proxy-channel.ts:136-140`）是**按属性名动态分派**的，
没有方法级登记表。因此给已有接口加方法只需改 3 个文件；新建 service 要同步 6 张登记表。

**不需要 `workspacePath`**：baseUrl / apiType / apiKey 出自本机全局的 Provider 配置视图，
与被测模型是否已在 registry 里无关，因此不走 CLI 的 `provider/testModelConnectivity` 协议面。
代价（明确接受）：CLI / TUI 面拿不到这个能力。

## 实现

`packages/services/src/model-provider/providerModelCatalog.ts`（新增）：
`createProviderModelLister({ apiClient })` → `ProviderSettingsModelLister`。

- 复用 services 层唯一的 HTTP 出口：`packages/services/src/providers/api/` 的
  `readApiJson` + `normalizeApiKeyForHeader`，`apiClient` 由 `packages/services/src/node.ts:1371`
  用 `createNodeApiClient({ fetchImpl: hostApiNetworkTransport.fetch, ... })` 建（因此继承
  设置里的 HTTP 代理与 CA 配置）。
- `PROVIDER_MODELS_REQUEST_TIMEOUT_MS = 15_000`（`:21`），对齐同目录
  `accountProjectTokenClient.ts` 的 15s 范式。
- `buildProviderModelsUrl`（`:41`）：去尾斜杠 → 末尾不是 `/v1` 就补 → 接 `/models`。
  规则与 adapter 的 `normalizeAnthropicBaseURL`
  （`apps/zcode-cli/packages/adapters/src/model/model-execution.ts:466-490`）一致；
  只有 `anthropic-messages` 追加 `?limit=1000`（Anthropic 的 `/v1/models` 默认只回 20 条，
  OpenAI 形状不接受该参数）。
- `buildProviderModelsHeaders`（`:72`）：`anthropic-messages` 同时发 `x-api-key`、
  `anthropic-version: 2023-06-01` 与 `authorization: Bearer`（与 adapter 的
  `withAnthropicAuthorizationHeader` 同口径，兼容只认其中一种的网关）；
  `openai-*` 只发 `authorization`。配置里显式写的自定义头最后覆盖。
- `readProviderModelItems`（`:128`）：兼容 `{data:[{id,display_name}]}`、`{data:["id"]}`、
  `{models:[...]}`、`{result:[...]}` 与裸数组；`id`/`name`/`model` 三个字段名都认；
  去重保序。
- 失败分类：401/403 → `missing-credentials`；404/405/501 → `unsupported-api-format`；
  其余 → `upstream-unreachable`（消息取上游原文）。
- **空列表 vs 认不出，必须分开**（`isModelListEnvelope`，`:140`）：拿到 200 之后
  - 信封认得（是数组，或对象里 `data`/`models`/`result` 是数组）但**一条都读不出** →
    **`success: true, models: []`**。这是「供应商确实说这个 Key 名下 0 个模型」，
    不是「这家没有列表接口」；
  - 连信封都不是 → `unsupported-api-format`（自建网关没实现 `/models`），UI 提示手填。

  这条边界是 2026-11-08 实测出来的，起因是用户报「没有模型列表」：他的供应商是本地
  Agent2API 网关（`http://127.0.0.1:3065/v1/models`），三种凭证三种结果 ——
  不带凭证 `200` 返回 57 个模型；带不存在的 Key（`sk-anything`）`401`；带**有效但未被
  授权任何模型**的 Key（`qwertyuiop`）`200 {"data":[],"first_id":null,"has_more":false,"last_id":null}`。
  旧实现把第三种也归成 `unsupported-api-format`，于是 UI 说「该供应商没有提供模型列表接口，
  请手动填写模型 ID」—— 用户按这句话只会去换供应商，而真正的修法是到网关后台给这个 Key 授权模型。
- 日志用 `createServiceLogger("provider-model-catalog")`，失败时 `warn`；**认得的空列表也 `warn`**
  （`listProviderModels empty url=…`，正常不该出现，值得留痕）。**不落 apiKey、不落 headers**
  （URL 不含密钥，可留作排查线索）。

装配：`providerRuntime.ts` 的 `ProviderRuntimeOptions`（`:36`）/`ProviderRuntimeDependencies`（`:44`）
各加 `listModels?`，构造器透传（`:115`），`createProviderRuntime` 解构（`:210`）后继续传（`:219`）；
`packages/services/src/node.ts:490` import，`:1639` 装配 `listModels: createProviderModelLister({ apiClient })`。
Provider 注册点（`.register(IProviderSettingsService, providerRuntime.providerSettings)`）不变。

## UI

链路与「测试连接」同形：

| 位置 | 改动 |
| --- | --- |
| `packages/ui/src/hooks/useModelProviders.ts:232` | `listProviderModels(providerId)`，直接转发；**不需要解析 workspacePath**（对比 `:182` 的 `testModelConnectivity`） |
| `packages/ui/src/settings/ModelProviderSection.tsx` | 解构 + `handleListProviderModels` + `onListProviderModels=` |
| `packages/ui/src/settings/model-provider-section/Detail.tsx` | 可选 prop，**只在自定义供应商分支**（`<InlineEditableProviderCard>` 的 custom 处）透传 |
| `InlineEditableProviderCard.tsx` | `handleListProviderModels`：先 `commitPendingDraft("model-list")` 把卡片里的 Provider 草稿落盘，再拿已保存的 Base URL / Key / 格式去拉取 |
| `ProviderCardSections.tsx` | 可选 prop `onListProviderModels`，透传给对话框的 `onFetchModels` |
| `ProviderModelMetadataDialog.tsx` | `mode === "add"` 时在 model ID 输入行右侧渲染「获取模型列表」按钮；成功后把候选渲染成**每行一个模型**的可选清单 + 一个**独立筛选框** |

**只给自定义供应商传**：预置/套餐供应商的模型来自 CDN 与套餐，没有可查询的上游模型端点，
传进去只会让用户点了拿到必然失败的结果。

### 候选清单的行语义

一行 = 一个候选模型，只有两个可点区域：

| 区域 | 行为 |
| --- | --- |
| 行左侧的模型名（含自绘勾选方格） | 切换该行的勾选态（`aria-pressed` / `data-selected`），**不写模型 ID 输入框** |
| 行右侧的箭头（`data-fetched-model-expand`） | 展开/收起**该行自己的**参数区，展开即自动勾选；同时只允许展开一行 |

**已经加过的模型必须先认出来**（`data-fetched-model-added`，徽标 `data-fetched-model-added-badge`）。
宿主把该供应商现有的模型 id 通过 `existingModelIds` 传进对话框，命中的行渲染成「已添加」：
勾选方格常亮、徽标提示、整行 `cursor-default`、不渲染右侧箭头，`toggleSelectedModel` 与
`expandModelRow` 双双提前 return。这条不是锦上添花 —— 2026-11-08 用户就是被它坑的：
他第一次批量添加其实**成功了**（日志里 22:23:36 / 22:23:37 两条 `addPersonalModel OK`，
`provider_config.json` 里也确实落了那两条 `providerModelRules`），但他没意识到已经加好，
又选同样两个模型点了一次，于是 `onAddModel` 抛错、被 catch 记进 `failed`，汇总成
「已添加 0 个，2 个失败：…」，而他唯一能猜到的病因是「模型 ID 为空」。

**筛选框必须独立于模型 ID 输入框**（`data-fetch-models-filter`）。早期实现图省事，直接拿
`draft.idValue` 当筛选词，而点候选行又会把 model id 写进输入框 —— 结果点第一个模型之后列表
立刻自筛成只剩那一条，表现为「添加了第一个模型之后就再也选不中第二个」。现在筛选词是独立
state，输入框回归「手填单个模型」的原语义。

**参数区（上下文窗口 / 最大输出 Token / 高级配置）不再常驻在对话框底部**：有候选列表时，
它整体搬到每一行的箭头后面（`ProviderModelParamsFields` 同时供行内与底部复用）；没有列表时
（手动填 ID、或 mode === "edit"）才在底部以默认收起的 `ModelParamsDisclosure`（「参数设置」）
出现。行内参数区的 placeholder 与推理档位选项来自该模型自己的推荐基线，由宿主通过
`onResolveModelConfig(modelId)` 懒解析（只在展开某一行时才发请求，结果只喂给 UI，不写覆盖）。

### 批量添加

勾选若干行后，**对话框底部的主按钮直接切成「添加 N 个模型」**
（`data-testid="model-provider-add-selected-models"`，计数行 `data-selected-models-count`），
不必再去清单里找次要按钮。

批量提交链路（`ProviderCardSections.tsx` 的 `handleAddModels`）与单条保存**完全同构**，
逐条执行：`resolveAddModelConfig(modelId)` 取推荐基线 → 把基线的 `inheritedConfig` 同时
当作 `inheritedConfig` 与 `config` 装配出临时 model → 用行里投影好的草稿
（`{...createProviderModelDraftValues(baseModel), ...item.draft}`）→ `projectModelDraft` 投影 →
`resolveProviderModelDraftCommit` 提交 → `onAddModel(result.model)`。

`ProviderModelBatchItemInput` 因此携带的是**整份投影草稿**（`{ modelId, draft? }`），
而不是零散的 `contextWindowValue` / `maxOutputTokensValue` 两个字段 —— 行内高级配置里改过的
模态、能力、推理档位也一并落盘。

三个必须遵守的约束：

1. **不能把裸 `createEmptyModel()` 直接交给 `onAddModel`**（早期批量实现就是这么做的）：
   它没有 `inheritedConfig`，`resolveProviderModelDraftCommit` 取不到推荐的
   `contextWindow` 会判 `invalid: contextWindow`，`projectModelDraft` 也补不出
   `optionSpecs` 导致 `reasoningLevelValues` 为空。
2. **必须经 `projectModelDraft`**（`ProviderModelDraftState.ts:16`）而不是把原始草稿直接交给
   commit：`reasoningLevelValuesValue` / `reasoningLevelMapValue` 靠它从
   `currentModel.config.optionSpecs` 补齐。
3. **整批只上一次 `addSavingRef` 锁**：该 ref 是单条提交的重入锁，若每条各走一次
   `commitAddDraft`，第二条会被第一条留下的锁直接拒绝。

**已存在 ≠ 失败**：`handleAddModels` 返回 `{ added, failed, skipped }` 三段，其中 `skipped` 是
「这个供应商下已经有这个模型了」。以前两者混在 `failed` 里，用户拿到的是「已添加 0 个，2 个失败」
—— 那两个模型其实第一次就加成功了，而他从头到尾没做错任何事。

对话框按三段拼提示（`；` 连接，`hint` 色调；只有真有失败项时才用 `error` 色调）：

- `added > 0` → 「已添加 N 个模型」（`fetchModelsAddSelectedDone`）
- `skipped.length > 0` → 「N 个已经加过了，已跳过」（`fetchModelsAddSelectedExisting`）
- `failed.length > 0` → 「N 个添加失败：a，b」（`fetchModelsAddSelectedFailed`）—— **必须带上失败的
  model id**，否则用户拿到一个没有病因的「失败」，只能自己编一个。

`failed` 为空时清空勾选（「全是已存在」也没有要重试的东西）；有失败项时**只保留失败项的勾选**
（连同该行的草稿与展开态），已成功与已存在的都摘掉，避免用户重试时把成功项再提交一遍。

**「不支持」与「空列表」都不是错误**：`unsupported-api-format`（自建网关没实现 `/models`）、
`fetchModelsEmpty`（信封认得但 0 条 —— 这个 Key 名下没有可用模型）与 `missing-credentials`
（还没填 Key）都用弱化色提示，不显示为错误红。三句文案必须各说各的病因：
- 空列表 → 「这个 API Key 在当前供应商下没有任何可用模型（供应商返回了空列表）。请到供应商后台给该 Key 授权模型，或直接手动填写模型 ID。」
- 不支持 → 「该供应商没有提供模型列表接口，请手动填写模型 ID。」
- 缺 Key → 「请先填写并保存 API Key，再获取模型列表。」

配套的交互约束：**列表拉到 0 条时参数区必须展开**（`paramsCollapsedByDefault` 判据是
「实际拿到的候选数 > 0」而不是「有没有拉取入口」）。列表空 = 用户只能手填 ID，此时参数区
若还收在「参数设置」折叠条里，他连上下文窗口都改不了，看上去就像「这个对话框根本加不了模型」。

另外三条（2026-11-08 用户实测反馈后补）：

- **整行都是勾选热区**。只把模型名做成按钮时，名字与右侧箭头之间的空白点了没有反应，
  用户会以为「选不了」，然后在 ID 空着的情况下直接按「保存」，被「模型 ID 不能为空」挡回来
  —— 明明列表就在眼前。箭头按钮必须 `event.stopPropagation()`，否则点展开会连带把勾选翻掉。
- **候选列表可见、一个都没勾、ID 也空着时按「保存」，不要走 ID 校验**，直接提示
  「请先点一下要添加的模型（可多选）」（`fetchModelsPickFirst`）。这时用户缺的是「得先点一个」
  这一步，拿字段级报错回他只会让他反复试。
- 模型名用 `text-ui-base`（正文尺寸），**不是 `text-ui-xs`**（正文 -4px，比旁边的说明文字还小）。
  这一屏的主体信息是模型 ID，字号不能比辅助文字更弱。

## i18n

`packages/ui/src/i18n/locales/zh-CN.ts` 与 `en-US.ts` 的 `settings.modelProvider.` 段新增：
`fetchModels`、`fetchModelsLoading`、`fetchModelsCount`、`fetchModelsEmpty`、
`fetchModelsUnsupported`、`fetchModelsMissingCredentials`、`fetchModelsFilterPlaceholder`、
`fetchModelsExpandParams`、`fetchModelsSelected`、`fetchModelsAddSelected`、
`fetchModelsAddSelectedDone`、`fetchModelsAddSelectedExisting`、`fetchModelsAddSelectedFailed`、
`fetchModelsAlreadyAdded`、`fetchModelsEditorHint`、`fetchModelsPickFirst`、`modelParams`。

`fetchModelsAddSelectedPartial`（「已添加 {added} 个，{failed} 个失败：{names}」）已删除：它是
「一个数字同时表达三种结局」的写法，正是那句让用户误判的「已添加 0 个，2 个失败」的来源。

行内参数区复用既有的 `contextWindow` / `maxOutputTokens` 作为输入框的 placeholder 与
`aria-label`，不另立文案。

## 尚未覆盖

- 分页：只取一页（`anthropic-messages` 用 `limit=1000` 已覆盖常见规模）。
- 批量提交里的**推理档位映射**（`reasoningLevelMapValue`）沿用该模型的推荐基线，行内只能改
  档位集合（`reasoningLevelValues`），不能逐档改名；需要改名仍得添加后打开编辑弹窗。
- CLI / TUI 与 V4 协议面：如需支持，要另加 `provider/listModels` 方法与结果 schema。
- 手机 `/remote`：`packages/web/src/main.tsx:711` 的 home-only 桩显式返回
  `provider-unavailable`；接上 workspace bridge 后才可能可用。
- 自动化测试：`providerFacadeServices` / `providerSettingsConnectivity` 目前无直接单测。
  E2E 可照 `packages/desktop/test/e2e/settings/provider-connectivity-prompt.test.ts:27-72`
  的本机假上游模式，给同一台 `node:http.createServer` 加一条 `GET /v1/models` 路由。
