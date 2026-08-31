import { describe, expect, it, vi } from "vitest";
import { createDefaultDesktopLayout } from "../src/shared/desktopManifest";
import type { DesktopLayoutService } from "../src/main/services/desktopLayout";
import { DesktopHostController } from "../src/main/services/desktopHost";

vi.mock("electron", () => {
  const display = {
    id: 1,
    label: "Test display",
    bounds: { x: 0, y: 0, width: 1440, height: 900 },
    workArea: { x: 0, y: 0, width: 1440, height: 860 },
    scaleFactor: 1,
  };
  return {
    screen: {
      getPrimaryDisplay: () => display,
      getAllDisplays: () => [display],
      on: vi.fn(),
      removeListener: vi.fn(),
    },
  };
});

function createWindow() {
  return {
    isDestroyed: vi.fn(() => false),
    setBounds: vi.fn(),
    setSkipTaskbar: vi.fn(),
    setResizable: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
  };
}

function createLayout(targetDisplayId: string | null = null): DesktopLayoutService {
  let state = createDefaultDesktopLayout("2026-08-29T00:00:00.000Z");
  state = { ...state, targetDisplayId };
  return {
    load: () => state,
    patch: (patch) => {
      state = { ...state, ...patch };
      return state;
    },
    selectDisplay: (displayId) => {
      state = { ...state, rememberedDisplayId: displayId };
      return state;
    },
  } as DesktopLayoutService;
}

describe("simulated desktop host", () => {
  it("initializes as a fullscreen simulated desktop without click-through", () => {
    const window = createWindow();
    const host = new DesktopHostController(window as never, createLayout(), { platform: "win32" });

    const state = host.initialize();

    expect(state.mode).toBe("simulated");
    expect(state.boundDisplayId).toBe("1");
    expect(window.setBounds).toHaveBeenCalledWith({ x: 0, y: 0, width: 1440, height: 860 });
    expect(window.setSkipTaskbar).toHaveBeenCalledWith(false);
    expect(window.setResizable).toHaveBeenCalledWith(false);
    expect(window.show).toHaveBeenCalled();
    host.dispose();
  });

  it("falls back to windowed preview on non-Windows platforms", () => {
    const window = createWindow();
    const host = new DesktopHostController(window as never, createLayout(), { platform: "darwin" });

    const state = host.initialize();

    expect(state.mode).toBe("windowed-preview");
    expect(window.setSkipTaskbar).not.toHaveBeenCalled();
    host.dispose();
  });

  it("switches edit mode without changing click-through", () => {
    const window = createWindow();
    const host = new DesktopHostController(window as never, createLayout(), { platform: "win32" });
    host.initialize();

    expect(host.setEditMode(true).editMode).toBe(true);
    expect(host.getState().editMode).toBe(true);

    expect(host.setEditMode(false).editMode).toBe(false);
    host.dispose();
  });

  it("repositions the desktop when the target display changes", () => {
    const window = createWindow();
    const host = new DesktopHostController(window as never, createLayout(), { platform: "win32" });
    host.initialize();

    const state = host.setTargetDisplay("1");

    expect(state.boundDisplayId).toBe("1");
    expect(window.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 1440, height: 860 });
    host.dispose();
  });

  it("falls back to the primary display when the selected display disappears", () => {
    const window = createWindow();
    const layout = createLayout("missing-display");
    const host = new DesktopHostController(window as never, layout, { platform: "win32" });

    const state = host.initialize();

    expect(state.boundDisplayId).toBe("1");
    expect(layout.load().targetDisplayId).toBeNull();
    expect(layout.load().rememberedDisplayId).toBe("1");
    host.dispose();
  });
});
