import { useCallback, useContext, useMemo } from "react";
import { mutateProjectTask, type ProjectTaskMutation } from "@/project-sidebar/task-mutation.js";
import type { ProjectTask } from "@/project-sidebar/contract.js";
import { ProjectTaskListContext } from "@/project-sidebar/ProjectTaskListContext.js";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { useResolvedRemoteWorkspaceSessionId } from "@/hooks/useResolvedRemoteWorkspaceSessionId.js";
import { useZCodeSessionStore } from "@/store/zcodeSessionStore.js";
import { useConfirmDialogStore } from "@/store/confirmDialogStore.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { isTaskListRowRunning } from "@/v4/taskListRowActivity.js";
import { toast } from "@/components/ui/toast.js";
import { logger } from "@/logger.js";

/** UI 命令适配：复用原 Host 入口，成功后仅处理本窗口展示，不保存会话事实。 */
export function useProjectTaskActions(task: ProjectTask, refresh: () => Promise<void>) {
  const { zcodeTaskService: service, windowControllerService: controller } =
    useBaseWorkspaceServices();
  const { onPin } = useContext(ProjectTaskListContext);
  const removeTaskState = useZCodeSessionStore((state) => state.removeTaskState);
  const requestChoice = useConfirmDialogStore((state) => state.requestChoice);
  const { intl } = useZCodeIntl();
  /** 让用户选「取消 / 停止并归档」；只允许一个确认框，重复点击直接当作取消。 */
  const confirmStopAndArchive = useCallback(async () => {
    if (useConfirmDialogStore.getState().pendingRequest) {
      return false;
    }
    const choice = await requestChoice({
      title: intl.formatMessage({ id: "taskList.archiveRunningTitle" }),
      description: intl.formatMessage({ id: "taskList.archiveRunningDescription" }),
      confirmLabel: intl.formatMessage({ id: "taskList.archiveRunningConfirm" }),
      cancelLabel: intl.formatMessage({ id: "common.cancel" }),
      // 停止会丢掉这一轮的生成过程，按不可恢复动作处理：危险色 + 不接 Enter。
      confirmVariant: "destructive",
      intent: "task-running-archive",
      testId: "task-running-archive-dialog",
    });
    return choice === "confirm";
  }, [intl, requestChoice]);
  const remoteSessionId = useResolvedRemoteWorkspaceSessionId(
    task.workspacePath,
    undefined,
    task.workspaceIdentity,
  );
  const target = useMemo(
    () => ({
      workspacePath: task.workspacePath,
      workspaceIdentity: task.workspaceIdentity,
      taskId: task.taskId,
    }),
    [task.workspacePath, task.workspaceIdentity, task.taskId],
  );
  const mutate = useCallback(
    (mutation: ProjectTaskMutation) =>
      mutateProjectTask({ service, controller }, target, mutation, remoteSessionId),
    [service, controller, target, remoteSessionId],
  );
  const report = useCallback(
    (kind: string, error: unknown) => {
      logger.error("[project-sidebar] 任务操作失败", { ...target, kind, error });
      toast(intl.formatMessage({ id: `taskList.${kind}Failed` }));
    },
    [intl, target],
  );
  const rename = useCallback(
    async (_id: string, title: string) => {
      const result = await mutate({ kind: "rename", title });
      await refresh();
      return result ?? null;
    },
    [mutate, refresh],
  );
  const pin = useCallback(
    async (_id: string, pinned: boolean) => {
      try {
        const commit = async () => {
          const result = await mutate({ kind: "pin", pinned });
          await refresh();
          return result ?? null;
        };
        if (onPin) {
          await onPin(task, pinned, commit);
          return null;
        }
        return await commit();
      } catch (error) {
        report("pin", error);
        return null;
      }
    },
    [mutate, refresh, onPin, task, report],
  );
  const archive = useCallback(async () => {
    try {
      // 归档会立刻 removeTaskState 把主区会话状态清掉。回合还在生成时这等于静默掐断
      // 这一轮，所以先让用户在「取消 / 停止并归档」里明确选一次。
      // 判定只认 sessions-index 的实时 phase（prewarming/running）：已完成但还挂着后台
      // 工作的任务，归档不会停掉那份后台工作，此时弹框只会让用户以为归档会杀后台任务。
      if (!task.archived && isTaskListRowRunning(task)) {
        const confirmed = await confirmStopAndArchive();
        if (!confirmed) {
          return null;
        }
        logger.info("[project-sidebar] archive running task", { ...target, action: "stop" });
        try {
          await service.stopGeneration({
            taskId: task.taskId,
            workspacePath: task.workspacePath,
            workspaceIdentity: task.workspaceIdentity,
          });
        } catch (error) {
          // 停止失败就不归档：半停半归档比什么都不做更糟，至少要让用户知道这轮还活着。
          logger.error("[project-sidebar] 停止运行中任务失败，取消归档", { ...target, error });
          toast(intl.formatMessage({ id: "taskList.archiveStopFailed" }));
          return null;
        }
      }
      const result = await mutate({ kind: "archive", archived: !task.archived });
      // 重构漏掉了归档后的 UI 清理，导致侧栏消失而主区继续显示；与 Header 保持同一语义。
      if (!task.archived) removeTaskState(task.workspacePath, task.taskId, task.workspaceIdentity);
      await refresh();
      return result ?? null;
    } catch (error) {
      report("archive", error);
      return null;
    }
  }, [
    mutate,
    refresh,
    task,
    removeTaskState,
    report,
    confirmStopAndArchive,
    service,
    target,
    intl,
  ]);
  const unread = useCallback(
    async (_id: string, value: boolean) => {
      try {
        const result = await mutate(
          value ? { kind: "mark-unread" } : { kind: "mark-read", expectedUnreadAt: task.unreadAt },
        );
        await refresh();
        return result ?? null;
      } catch (error) {
        report("markAsUnread", error);
        return null;
      }
    },
    [mutate, refresh, task.unreadAt, report],
  );
  return { remoteSessionId, rename, pin, archive, unread };
}
