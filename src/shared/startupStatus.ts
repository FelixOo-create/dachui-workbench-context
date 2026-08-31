import type { ToolStatusResult } from "./types";

export const STARTUP_STATUS_SYNC_TIMEOUT_MS = 15000;

export function hasPendingStartupTargets(statuses: ToolStatusResult[], startupToolIds: string[]): boolean {
  const byToolId = new Map(statuses.map((status) => [status.toolId, status]));
  return startupToolIds.some((toolId) => {
    const status = byToolId.get(toolId);
    return !status || status.status === "stopped" || status.status === "starting";
  });
}

export function shouldContinueStartupStatusSync(
  statuses: ToolStatusResult[],
  startupToolIds: string[],
  now: number,
  deadline: number,
): boolean {
  return now < deadline && hasPendingStartupTargets(statuses, startupToolIds);
}
