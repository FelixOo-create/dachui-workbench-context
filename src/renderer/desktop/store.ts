import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  DesktopFileGroup,
  DesktopFilesState,
  DesktopHostState,
  DesktopLayout,
  DesktopSceneDefinition,
  DesktopSceneId,
  FocusTimerState,
  WeatherState,
  WidgetManifest,
} from "../../shared/desktop";
import type { ToolDefinition } from "../../shared/types";
import { DESKTOP_SCENES, createDefaultDesktopLayout } from "../../shared/desktopManifest";
import { api } from "../api";

export type ThemePreference = "dark" | "light";

interface DesktopStoreState {
  loading: boolean;
  theme: ThemePreference;
  scenes: DesktopSceneDefinition[];
  manifests: WidgetManifest[];
  layout: DesktopLayout;
  host: DesktopHostState;
  focusTimer: FocusTimerState;
  weather: WeatherState;
  desktopFiles: DesktopFilesState | null;
  dockTools: ToolDefinition[];
  toggleTheme: () => void;
  setTheme: (theme: ThemePreference) => void;
  hydrate: () => Promise<void>;
  setActiveScene: (sceneId: DesktopSceneId) => Promise<void>;
  toggleHidden: () => Promise<void>;
  toggleEditMode: () => Promise<void>;
  resetLayout: () => Promise<void>;
  saveLayout: (layout: DesktopLayout) => Promise<void>;
  setGroups: (groups: DesktopFileGroup[]) => Promise<void>;
  refreshDesktopFiles: () => Promise<void>;
}

const INITIAL_LAYOUT = createDefaultDesktopLayout();
const INITIAL_HOST: DesktopHostState = {
  mode: "windowed-preview",
  message: "加载中",
  boundDisplayId: null,
  editMode: false,
  displays: [],
};
const INITIAL_FOCUS: FocusTimerState = {
  phase: "idle",
  durationSeconds: 25 * 60,
  remainingSeconds: 25 * 60,
  endsAt: null,
  updatedAt: new Date().toISOString(),
  segments: [],
  sessionId: null,
  activityId: null,
  categoryId: null,
  plannedSeconds: 25 * 60,
};
const INITIAL_WEATHER: WeatherState = {
  status: "idle",
  city: "未配置",
  temperature: null,
  weatherText: "待加载",
  humidity: null,
  uvIndex: null,
  updatedAt: null,
};

export const useDesktopStore = create<DesktopStoreState>()(
  persist(
    (set, get) => ({
      loading: true,
      theme: "dark",
      scenes: DESKTOP_SCENES,
      manifests: [],
      layout: INITIAL_LAYOUT,
      host: INITIAL_HOST,
      focusTimer: INITIAL_FOCUS,
      weather: INITIAL_WEATHER,
      desktopFiles: null,
      dockTools: [],
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
      setTheme: (theme) => set({ theme }),
      hydrate: async () => {
        const [scenes, manifests, layout, host, focus, weather, files, tools] = await Promise.all([
          api.desktop.getScenes(),
          api.desktop.getWidgets(),
          api.desktop.getLayout(),
          api.desktop.getHostState(),
          api.desktop.focusTimerGet(),
          api.desktop.getWeather(),
          api.desktop.getDesktopFiles().catch(() => null),
          api.listTools().catch(() => [] as ToolDefinition[]),
        ]);
        set({
          loading: false,
          scenes,
          manifests,
          layout,
          host,
          focusTimer: focus,
          weather,
          desktopFiles: files,
          dockTools: tools.slice(0, 8),
        });
        api.desktop.onHostState((next) => set({ host: next }));
        api.desktop.onLayout((next) => set({ layout: next }));
        api.desktop.onFocusTimer((next) => set({ focusTimer: next }));
        api.desktop.onWeather((next) => set({ weather: next }));
      },
      setActiveScene: async (sceneId) => {
        const next = await api.desktop.setActiveScene(sceneId);
        set({ layout: next });
      },
      toggleHidden: async () => {
        const next = await api.desktop.setHidden(!get().layout.hidden);
        set({ layout: next });
      },
      toggleEditMode: async () => {
        const nextHost = await api.desktop.setEditMode(!get().host.editMode);
        const nextLayout = await api.desktop.getLayout();
        set({ host: nextHost, layout: nextLayout });
      },
      resetLayout: async () => {
        const next = await api.desktop.resetLayout();
        set({ layout: next });
      },
      saveLayout: async (layout) => {
        const displayPlacements = layout.rememberedDisplayId ? { ...layout.displayPlacements, [layout.rememberedDisplayId]: layout.placements.map((placement) => ({ ...placement })) } : layout.displayPlacements;
        const next = await api.desktop.saveLayout({ ...layout, displayPlacements });
        set({ layout: next });
      },
      setGroups: async (groups) => {
        const next = await api.desktop.saveDesktopGroups(groups);
        set({ desktopFiles: next });
      },
      refreshDesktopFiles: async () => {
        const next = await api.desktop.refreshDesktopFiles();
        set({ desktopFiles: next });
      },
    }),
    {
      name: "dachui-workbench-desktop",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ theme: state.theme }),
    },
  ),
);
