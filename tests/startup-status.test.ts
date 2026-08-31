import { describe, expect, it } from "vitest";
import { hasPendingStartupTargets, shouldContinueStartupStatusSync } from "../src/shared/startupStatus";

describe("startup status synchronization", () => {
  it("polls when the initial target is stopped and stops after a terminal status", () => {
    expect(hasPendingStartupTargets([{ toolId: "bat", status: "stopped", checkedAt: "now" }], ["bat"])).toBe(true);
    expect(hasPendingStartupTargets([{ toolId: "bat", status: "starting", checkedAt: "now" }], ["bat"])).toBe(true);
    expect(hasPendingStartupTargets([{ toolId: "bat", status: "running", checkedAt: "now" }], ["bat"])).toBe(false);
    expect(hasPendingStartupTargets([{ toolId: "bat", status: "error", message: "启动失败", checkedAt: "now" }], ["bat"])).toBe(false);
  });

  it("keeps missing targets pending only within the bounded window", () => {
    expect(hasPendingStartupTargets([], ["bat"])).toBe(true);
    expect(shouldContinueStartupStatusSync([{ toolId: "bat", status: "stopped", checkedAt: "now" }], ["bat"], 14999, 15000)).toBe(true);
    expect(shouldContinueStartupStatusSync([{ toolId: "bat", status: "stopped", checkedAt: "now" }], ["bat"], 15000, 15000)).toBe(false);
  });
});
