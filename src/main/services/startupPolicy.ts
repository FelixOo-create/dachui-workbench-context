import type { ToolDefinition } from "../../shared/types";

export type StartupRunner = (toolId: string) => Promise<unknown>;

/** 应用进程内只运行一次 Workbench 启动策略，并隔离单个工具的失败。 */
export class StartupPolicyRunner {
  private applied = false;

  async apply(tools: ToolDefinition[], run: StartupRunner): Promise<void> {
    if (this.applied) return;
    this.applied = true;
    const selected = tools.filter((tool) => tool.startupPolicy === "on-workbench-start");
    await Promise.all(selected.map(async (tool) => {
      try {
        await run(tool.id);
      } catch {
        // 启动失败由 RuntimeManager 写入 error 状态；不能阻塞其他工具或工作台。
      }
    }));
  }
}
