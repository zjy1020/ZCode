import type { ProviderApiType } from "@zcode/provider";
import {
  ApiError,
  type ApiClient,
  type ProviderModelListItem,
  type ProviderModelListResult,
} from "@zcode/shared";
import { createServiceLogger } from "../logger/serviceLogger.js";
import { normalizeApiKeyForHeader, readApiJson } from "../providers/api/index.js";
import type {
  ProviderSettingsModelListInput,
  ProviderSettingsModelLister,
} from "./providerFacadeServices.js";

const log = createServiceLogger("provider-model-catalog");

/**
 * 拉取模型列表的超时。对齐同目录 `accountProjectTokenClient.ts` 的 15s：
 * 一次 GET 不该拖住设置页，且超时后用户还能继续手填。
 */
const PROVIDER_MODELS_REQUEST_TIMEOUT_MS = 15_000;

/** Anthropic Messages 网关要求显式版本头，不传会被 400。 */
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Anthropic 的 `/v1/models` **默认只回 20 条**（官方分页默认值），
 * 不显式放大 limit 会导致「列表看着不全」这种最难排查的假象。
 * 1000 是它允许的上限；自建网关一般忽略这个参数。
 */
const ANTHROPIC_MODELS_PAGE_LIMIT = 1000;

/**
 * 把配置里的 Base URL 拼成模型端点。
 *
 * 关键约束：**必须和真正发起对话时用的 base 一致**，否则会出现「能列模型但不能聊天」
 * （或反过来）的怪现象。而这两种形状的规则并不相同：
 *
 * - `anthropic-messages`：adapter 会交给 AI SDK，SDK 往 baseURL 后面接 `/messages`，
 *   所以 adapter 先用 `normalizeAnthropicBaseURL`
 *   （`apps/zcode-cli/packages/adapters/src/model/model-execution.ts:466-490`）
 *   把不以 `/v1` 结尾的 base 补成 `/v1`。这里照抄同一规则，再在 `/v1` 下取 `/models`。
 * - `openai-*`：adapter 把 baseURL **原样**交给 SDK（`model-execution.ts:409`，没有归一化）。
 *   所以国内常见形态 `https://open.bigmodel.cn/api/paas/v4` 就补出
 *   `/api/paas/v4/models`，而**不能**硬塞一层 `/v1`。设置页的 placeholder
 *   （`https://api.example.com/v1`）也表明用户本来就是带版本段填的。
 *
 * 返回 null 表示配置根本不可用（空串、非法 URL、非 http(s) 协议）。
 */
function buildProviderModelsUrl(baseUrl: string, apiType: ProviderApiType): string | null {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  if (apiType === "anthropic-messages") {
    const base = pathname.toLowerCase().endsWith("/v1") ? pathname : `${pathname.replace(/\/$/, "")}/v1`;
    url.pathname = `${base}/models`;
    // Anthropic 的 /v1/models 默认只回 20 条，显式要一页大的；
    // OpenAI 形状不接受这个参数，带上反而可能被严格实现判 400。
    url.searchParams.set("limit", String(ANTHROPIC_MODELS_PAGE_LIMIT));
  } else {
    url.pathname = `${pathname.replace(/\/$/, "")}/models`;
  }
  return url.toString();
}

/**
 * 组装请求头。
 *
 * Anthropic 兼容网关有的只认 `x-api-key`、有的只认 `authorization`，
 * 与 adapter 的 `withAnthropicAuthorizationHeader` 同样两个都发；
 * OpenAI 形状只发 `authorization`。配置里显式写的自定义头最后覆盖。
 */
function buildProviderModelsHeaders(
  input: Pick<ProviderSettingsModelListInput, "apiType" | "apiKey" | "headers">,
): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  const apiKey = input.apiKey ? normalizeApiKeyForHeader(input.apiKey) : "";
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
    if (input.apiType === "anthropic-messages") {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = ANTHROPIC_VERSION;
    }
  }
  if (input.headers) {
    for (const [name, value] of Object.entries(input.headers)) {
      const key = name.trim();
      if (key && typeof value === "string") {
        headers[key] = value;
      }
    }
  }
  return headers;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toModelItem(value: unknown): ProviderModelListItem | null {
  if (typeof value === "string") {
    const modelId = value.trim();
    return modelId ? { modelId } : null;
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  // 兼容面：OpenAI 用 `id`，Anthropic 用 `id` + `display_name`，
  // 部分自建网关用 `name` 或 `model`。宁可多认几个字段，也别让用户看到空列表。
  const rawId = record.id ?? record.name ?? record.model;
  const modelId = typeof rawId === "string" ? rawId.trim() : "";
  if (!modelId) {
    return null;
  }
  const rawDisplay =
    typeof record.display_name === "string"
      ? record.display_name
      : typeof record.displayName === "string"
        ? record.displayName
        : undefined;
  const displayName = rawDisplay?.trim();
  return displayName ? { modelId, displayName } : { modelId };
}

/**
 * 判断响应正文是不是一个「模型列表信封」。
 *
 * 为什么单拎出来：空列表和「根本不是列表」都会让 `readProviderModelItems` 返回 0 条，
 * 但这两件事对用户的意思**完全相反**，混为一谈会把人指向错误的修法。
 *
 * 实测（Agent2API 本地网关 `http://127.0.0.1:3065/v1/models`，2026-11-08）：
 * - 不带凭证 → `200 {"data":[57 个模型]}`；
 * - 带一个不存在/形状不对的 Key（如 `sk-anything`）→ `401`；
 * - 带**有效但未被授权任何模型**的 Key → `200 {"data":[],"first_id":null,"has_more":false,"last_id":null}`。
 *
 * 也就是说 `{"data":[]}` 是「这个 Key 没有可用模型」而不是「这家没有列表接口」。
 * 前者要引导用户去供应商后台给 Key 开权限（或换 Key），后者才只能手填。
 */
function isModelListEnvelope(payload: unknown): boolean {
  if (Array.isArray(payload)) {
    return true;
  }
  const container = asRecord(payload);
  if (!container) {
    return false;
  }
  return (
    Array.isArray(container.data) ||
    Array.isArray(container.models) ||
    Array.isArray(container.result)
  );
}

/** 把上游响应正文归一成条目表，去重并保持上游顺序。 */
function readProviderModelItems(payload: unknown): readonly ProviderModelListItem[] {
  const container = asRecord(payload);
  const rawList: unknown = Array.isArray(payload)
    ? payload
    : container
      ? (container.data ?? container.models ?? container.result)
      : undefined;
  if (!Array.isArray(rawList)) {
    return [];
  }
  const seen = new Set<string>();
  const items: ProviderModelListItem[] = [];
  for (const entry of rawList) {
    const item = toModelItem(entry);
    if (item && !seen.has(item.modelId)) {
      seen.add(item.modelId);
      items.push(item);
    }
  }
  return items;
}

/**
 * 依据上游错误判定语义码。
 *
 * `unsupported-api-format` 与 `missing-credentials` 是设置页要当「正常分支」呈现的两种
 * （提示用户手填），所以不能被归进笼统的网络失败里。
 */
function classifyFailure(error: unknown): NonNullable<
  Extract<ProviderModelListResult, { success: false }>["error"]["code"]
> {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return "missing-credentials";
    }
    if (error.status === 404 || error.status === 405 || error.status === 501) {
      return "unsupported-api-format";
    }
  }
  return "upstream-unreachable";
}

function failureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to fetch the model list from the provider.";
}

/**
 * 构造 lister 的参数。
 *
 * 与下面四个符号一样刻意**不导出**：本模块对外的唯一入口是 `createProviderModelLister`，
 * 其余都是实现细节。knip 会把「导出了但没人 import」的符号报成 unused exports，
 * 保持内部实现不导出能让死代码检查只盯真正的公共面。
 */
interface CreateProviderModelListerOptions {
  readonly apiClient: ApiClient;
}

/**
 * 构造「拉取供应商模型列表」的实现。
 *
 * 只读：不发任何写请求，也不要求 Model 已经存在——它存在的意义正是为了让用户
 * 不必手猜 model id。配置本身（baseUrl/apiType/apiKey）由调用方从配置视图里读出，
 * 这里只负责拼请求、归一响应、把失败翻译成语义码。
 */
export function createProviderModelLister(
  options: CreateProviderModelListerOptions,
): ProviderSettingsModelLister {
  return async (input) => {
    const url = buildProviderModelsUrl(input.baseUrl, input.apiType);
    if (!url) {
      return {
        success: false,
        error: {
          code: "provider-unavailable",
          message: "This provider has no usable Base URL configured yet.",
        },
      };
    }
    const apiKey = input.apiKey ? normalizeApiKeyForHeader(input.apiKey) : "";
    // Anthropic 形状连 `/v1/models` 都要求鉴权，缺 Key 时直接给语义码，
    // 不必浪费一次必然 401 的往返。
    if (!apiKey && input.apiType === "anthropic-messages") {
      return {
        success: false,
        error: {
          code: "missing-credentials",
          message: "This provider needs an API key before its model list can be fetched.",
        },
      };
    }
    try {
      const payload = await readApiJson<unknown>(options.apiClient, url, {
        method: "GET",
        headers: buildProviderModelsHeaders(input),
        timeoutMs: PROVIDER_MODELS_REQUEST_TIMEOUT_MS,
      });
      const models = readProviderModelItems(payload);
      if (models.length === 0) {
        if (isModelListEnvelope(payload)) {
          // 信封认得、内容为空：这是**成功**的查询，只是这个 Key 名下没有模型。
          // 归成失败会让 UI 谎称「该供应商没有模型列表接口」，把用户往换供应商的死路上带。
          log.warn(`listProviderModels empty url=${url}（该 Key 未被授权任何模型）`);
          return { success: true, models: [] };
        }
        // 连信封都不是：多半是上游返回了非标准包裹，归到「不支持」，
        // 这样 UI 会提示手填而不是显示空列表。
        return {
          success: false,
          error: {
            code: "unsupported-api-format",
            message: "The provider responded but no model entries were recognized.",
          },
        };
      }
      return { success: true, models };
    } catch (error) {
      const code = classifyFailure(error);
      const message = failureMessage(error);
      // 不记 apiKey、不记 headers；URL 本身不含密钥，可以留作排查线索。
      log.warn(`listProviderModels failed code=${code} url=${url}: ${message}`);
      return { success: false, error: { code, message } };
    }
  };
}
