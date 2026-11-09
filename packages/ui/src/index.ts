export { App } from "./App.js";
export { AppErrorBoundary, ScopedErrorBoundary } from "./ErrorBoundary.js";
export type { ScopedErrorBoundaryVariant } from "./ErrorBoundary.js";
export { Button, buttonVariants } from "./components/ui/button.js";
export { DesktopWindowFrame } from "./DesktopWindowFrame.js";
export { WebRemoteControlDialog } from "@/web-remote-control/index.js";
export {
  WebRemoteControlFeatureProvider,
  useWebRemoteControlFeatureEnabled,
} from "./WebRemoteControlFeatureProvider.js";
export {
  AssistantCodeCommentFeatureProvider,
  useAssistantCodeCommentFeatureEnabled,
} from "./AssistantCodeCommentFeatureProvider.js";
export { Root } from "./Root.js";
export { UpdateStatusWindowRoot } from "./UpdateStatusWindowRoot.js";
export type { WebRemoteControlTerminalTransportState } from "./root/types.js";
export { setWebRemoteControlTerminalTransportState } from "./webRemoteControlTerminalTransportState.js";
export { ConfirmDialogHost } from "./ConfirmDialog.js";
export { Terminal } from "./Terminal.js";
export { GitGraphPane } from "./git-graph/GitGraphPane.js";
export { layoutGitGraph } from "./git-graph/layout.js";
export type {
  GitGraphCommit,
  GitGraphLayout,
  GitGraphLayoutEdge,
  GitGraphLayoutOptions,
  GitGraphLayoutRow,
  GitGraphRef,
  GitGraphRefKind,
} from "./git-graph/layout.js";
export { SSHDialog, RemoteConnectionDialog } from "./SSHDialog.js";
export { useTheme } from "./useTheme.js";
export type { Theme } from "./useTheme.js";
export { useTestActions } from "./test-actions.js";
export type { TestActions } from "./test-actions.js";
export { StoreProvider, useZCodeStore } from "./store/StoreProvider.js";
export type { ZCodeState } from "./store/index.js";
export {
  bindRemoteWorkspacePath,
  getRemoteWorkspaceSession,
  registerBaseWorkspaceServices,
  registerRemoteWorkspaceSession,
  unbindRemoteWorkspacePath,
  unregisterRemoteWorkspaceSession,
  useRemoteWorkspaceSessionStore,
} from "./store/remoteWorkspaceSessionStore.js";
export {
  REMOTE_WORKSPACE_DISCONNECTED_ERROR_CODE,
  createRemoteWorkspaceDisconnectedError,
} from "./lib/remoteWorkspaceServiceError.js";
export {
  getSourceSettingsServices,
  registerSourceSettingsServices,
  useSourceSettingsServices,
} from "./store/sourceSettingsServiceStore.js";

// Hooks —— 统一的服务和平台操作访问层
export {
  ServiceProvider,
  useServices,
  useWorkspaceServices,
  PlatformProvider,
  usePlatform,
  useSelectDirectory,
  useConnectRemote,
  useReaddir,
  useSystemInfo,
  useIntranetProbe,
  useTerminal,
  useSettings,
  useRecentProjects,
  useConfirmDialog,
  useCredentials,
  useAuthToken,
  useGitRepository,
  useGitActions,
} from "./hooks/index.js";

export { ZCodeIntlProvider, useZCodeIntl, LocaleSwitcher } from "./i18n/index.js";
export { ResourceManagerApp } from "./resource-manager/ResourceManagerApp.js";
export type {
  ResourceManagerAppProps,
  ResourceManagerTab,
} from "./resource-manager/ResourceManagerApp.js";
export type { IntlInstance } from "./i18n/index.js";
export {
  FileDisplayInline,
  createFileDisplayDom,
  getFileDisplayPath,
  resolveFileDisplayDescriptor,
  setDefaultFileDisplayBasePath,
} from "./lib/fileDisplay.js";
export type { FileDisplayDescriptor, FileDisplayOptions } from "./lib/fileDisplay.js";
export { playTaskNotificationSound } from "./lib/taskNotificationSound.js";
export { installDocumentHiddenMotionPause } from "./lib/documentHiddenMotionPause.js";
export {
  applyUiFontSizePx,
  loadUiFontSizePx,
  subscribeToUiFontSizeStorageChanges,
} from "./lib/uiFontSize.js";
export { reportUiLaunchToInput } from "./lib/uiPerfArmsTelemetry.js";
export {
  RendererUserActionTelemetry,
  runUserAction,
  runUserActionAsync,
  setUserActionTelemetry,
  startUserAction,
} from "./lib/userActionTelemetry.js";
export {
  CORE_USER_ACTION_FEATURES,
  SETTINGS_USER_ACTION_FEATURES,
  USER_ACTION_CATALOG,
} from "./lib/userActionTraceCatalog.js";
export { setReactErrorArmsReporter } from "./lib/reactErrorArmsTelemetry.js";
export { recordArmsCustomEventForE2E } from "./lib/armsCustomEventObservability.js";
export { generateMobileDeviceFingerprint, setStreamClientId } from "./lib/streamClientId.js";
export { GlobalDatabaseStartupLoading } from "./root/GlobalDatabaseStartupLoading.js";

// 外观扩展层：随 UI 包一起装配（幂等、可在任意窗口安全重复调用）。
// 它只把配色与字体写成根元素上的内联 CSS 变量，不依赖任何上游服务；
// 升级 ZCode 后的重放步骤、以及卸载方式见 src/theme-ext/UPGRADE.md。
// 走 `theme-ext/index.js` 这个自包含入口而不是逐个深链子模块：上游升级后
// 「整个目录拷回来 + 这一处的导出名单不变」就能迁移，深链会让迁移面随文件数扩散。
export {
  installThemeExt,
  uninstallThemeExt,
  isThemeExtInstalled,
  setThemeExtSettings,
  getThemeExtSnapshot,
} from "./theme-ext/index.js";
// 注意：`export { x } from "..."` 只在导出侧建立绑定，不会在当前作用域声明 `x`，
// 所以下面这个调用点必须另有一条 import，否则是 ReferenceError。
import { installThemeExt } from "./theme-ext/index.js";

// 唯一的自动装配点：web 与 desktop 的 renderer 启动时都会 import 本入口，
// 因此在这里装上即可，不必改各端的 main.tsx。调用是幂等的、且在没有 DOM 的
// 环境里直接返回，重复 import 不会叠加副作用。
installThemeExt();
export { LocalTtftObserver, setLocalTtftObserver } from "@/v4/telemetry/local-ttft/contract.js";
export { ensurePendingTaskDraft } from "@/v4/composer/composerDraftStore.js";
