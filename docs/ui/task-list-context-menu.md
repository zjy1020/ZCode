# Task List Context Menu

任务列表项新增右键菜单，统一承接 task 级快捷操作，避免把所有动作都堆到 hover 按钮或 Header more。

## 当前菜单项

- Pin task
- Rename task
- Archive task
- Mark as unread
- Open in Finder / File Explorer / File Manager
- Copy path
- Copy log path
- Go to config

## 交互说明

- `Pin task` 会持久化到 task 元数据，刷新或恢复后仍保持置顶；已置顶项菜单会显示 `Unpin task`
- 已置顶任务会常驻在列表顶部的独立 `Pinned` 分组里，不再和普通任务混排；折叠态下也始终可见
- `Rename task` 使用弹窗完成，支持 `Enter` 提交、取消关闭
- `Archive task` 会把任务标记为 archived，并从默认任务列表中隐藏
- 任务行 hover 时展示行内归档入口；**单击即归档**，任务随即从默认列表隐藏。这里原本是“首击进入二次确认态、二次击才归档”，2026-11-08 按产品反馈改成单击直执：确认态只在按钮位置换成一个红色“确认”，用户点一下看到的是“按钮变了”而不是“任务没了”，既没有真正起到防误触的作用，又要每次归档都点两下。误归档的成本远低于此，任务仍可从归档视图恢复。
- **任务还在跑时归档要先问一句**（2026-11-09）：单击归档会先看该行是不是正在生成（`isTaskListRowRunning`，即 sessions-index 的 `phase` 是 `prewarming`/`running`）。是的话不直接归档，而是弹一个确认框，说明「这个任务正在运行」，给两个选择：
  - **取消**：什么都不做，任务继续跑；
  - **停止并归档**（destructive）：先发 `stop` 命令把前台执行停下来，再归档。停止走 `IZCodeTaskService.stopGeneration({ taskId, workspacePath, workspaceIdentity })`，与 composer 里的停止按钮同一条 V4 `stop` command 通道；归档本身仍是 `archive` mutation。
  为什么不在后端拦：`archiveTask`（`zcodeTaskServiceAdapter.ts:3069`）只写 `archived: true` 并广播 `task_archived`，它看不见会话是否还在跑；而归档会立刻 `removeTaskState` 把主区会话状态清掉，正在生成的这轮就无声无息地没了。放在 UI 侧拦，用户能在同一处决定「停还是不停」。
  **刻意只认 `phase`，不认 `isTaskListRowActive`**：后者把「已收口但还挂着后台工作」也算作活动，而归档并不会停掉那份后台工作（它属于 CLI），拿它当判据只会让用户误以为归档会杀后台任务。另外这类会话在 CLI 里可能已经卸载，`stop` 找不到 record 会失败，反而把本来能归档的任务卡住。
  停止失败时**不**继续归档，抛 `taskList.archiveStopFailed`——半停半归档的中间态比不做更糟，用户至少要知道这一轮还活着。不传 `expectedForegroundExecutionId`（侧栏拿不到 pane 的 `activeWorks` 快照），CLI 侧因此把 `idle`/`mismatch` 当作 noop 而不是错误（`session-flow.ts:323-330` 的守卫只在显式带 id 时生效）；ACK 的 `noop` 也算成功（`zcodeV4HostCommand.ts:118-127`）。没有实时 phase（历史任务、已完成任务）时行为完全不变，仍是单击即归档。
  **已知缺口**：手机远控那条入口（`useWebRemoteControlRendererActions.ts:92-103`）仍直接走 `archive` mutation，不经过这里的确认。它跑在非 React 的异步函数里，要让手机端也问一句得先把确认框做成可在手机壳层渲染的形态，本轮未做。
- `Mark as unread` 会持久化到 task 元数据；重新启动 app 后仍保留蓝点，打开该任务时再自动清除
- 重命名会持久化到 `tasks-index.sqlite` 并同步更新运行中 task 的内存 meta；恢复和快照回写必须遵守 [Task Title Authority](./task-title-authority.md)，避免 raw session snapshot 把手动标题还原成自动标题
- pin / unread / archive 也会同步更新运行中 task 的内存 meta，避免后续 session 持久化把旧状态写回来
- `Copy path` 指向 task 的持久化快照文件路径
- `Copy log path` 指向 task 对应的原生日志路径；ZCode Agent 使用按日期滚动的结构化 JSONL 日志
- `Go to config` 会复用当前持久化的编辑器偏好；如果无法直接用编辑器打开，则回退到文件管理器
