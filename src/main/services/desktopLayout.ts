import fs from "node:fs";
import path from "node:path";
import { DESKTOP_LAYOUT_VERSION, DESKTOP_SCENE_IDS, type DesktopLayout, type DesktopLayoutPreset, type DesktopSceneId, type WidgetPlacement } from "../../shared/desktop";
import { createDefaultDesktopLayout, DESKTOP_WIDGETS, normalizeLegacyDefaultHomeLayout } from "../../shared/desktopManifest";

const MAX_PLACEMENTS = 120;
const GRID_COLUMNS = 12;
const MAX_ROW_SPAN = 12;

function isSceneId(value: unknown): value is DesktopSceneId {
  return typeof value === "string" && DESKTOP_SCENE_IDS.includes(value as DesktopSceneId);
}

function integerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function validatePlacement(value: unknown, knownWidgets: Set<string>): value is WidgetPlacement {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<WidgetPlacement>;
  return typeof item.widgetId === "string"
    && knownWidgets.has(item.widgetId)
    && isSceneId(item.sceneId)
    && integerInRange(item.order, 0, MAX_PLACEMENTS - 1)
    && integerInRange(item.colSpan, 1, GRID_COLUMNS)
    && integerInRange(item.rowSpan, 1, MAX_ROW_SPAN)
    && typeof item.hidden === "boolean";
}

const PRESETS = new Set<DesktopLayoutPreset>(["smart", "split", "triple", "quad", "hero", "free"]);

export function migrateDesktopLayout(value: unknown): DesktopLayout | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (input.version !== 3 && input.version !== DESKTOP_LAYOUT_VERSION) return null;
  const base = input as unknown as DesktopLayout;
  const migratePlacements = (placements: WidgetPlacement[]) => placements.map((placement) => placement.widgetId === "desktop.files" ? { ...placement, widgetId: "desktop.shortcuts" } : placement);
  const migratedPlacements = Array.isArray(base.placements) ? migratePlacements(base.placements) : [];
  const migratedDisplays = base.displayPlacements && typeof base.displayPlacements === "object"
    ? Object.fromEntries(Object.entries(base.displayPlacements).map(([displayId, placements]) => [displayId, Array.isArray(placements) ? migratePlacements(placements) : []]))
    : {};
  return {
    ...base,
    version: DESKTOP_LAYOUT_VERSION,
    placements: migratedPlacements,
    preset: PRESETS.has(base.preset as DesktopLayoutPreset) ? base.preset as DesktopLayoutPreset : "free",
    previousPlacements: Array.isArray(base.previousPlacements) ? migratePlacements(base.previousPlacements) : null,
    displayPlacements: migratedDisplays,
  };
}

export function validateDesktopLayout(value: unknown): value is DesktopLayout {
  if (!value || typeof value !== "object") return false;
  const layout = value as Partial<DesktopLayout>;
  const knownWidgets = new Set(DESKTOP_WIDGETS.map((widget) => widget.id));
  return layout.version === DESKTOP_LAYOUT_VERSION
    && isSceneId(layout.activeScene)
    && typeof layout.hidden === "boolean"
    && typeof layout.editMode === "boolean"
    && (layout.targetDisplayId === null || typeof layout.targetDisplayId === "string")
    && (layout.rememberedDisplayId === null || typeof layout.rememberedDisplayId === "string")
    && Array.isArray(layout.placements)
    && layout.placements.length <= MAX_PLACEMENTS
    && layout.placements.every((placement) => validatePlacement(placement, knownWidgets))
    && PRESETS.has(layout.preset as DesktopLayoutPreset)
    && (layout.previousPlacements === null || (Array.isArray(layout.previousPlacements) && layout.previousPlacements.every((placement) => validatePlacement(placement, knownWidgets))))
    && layout.displayPlacements !== null
    && typeof layout.displayPlacements === "object"
    && Object.values(layout.displayPlacements).every((placements) => Array.isArray(placements) && placements.every((placement) => validatePlacement(placement, knownWidgets)))
    && typeof layout.updatedAt === "string";
}

export class DesktopLayoutService {
  private readonly filePath: string;
  private readonly backupPath: string;

  constructor(dataRoot: string) {
    const directory = path.join(dataRoot, "desktop");
    this.filePath = path.join(directory, "layout.json");
    this.backupPath = path.join(directory, "layout.valid.json");
    fs.mkdirSync(directory, { recursive: true });
  }

  private readValid(filePath: string): DesktopLayout | null {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const migrated = migrateDesktopLayout(parsed);
      return migrated && validateDesktopLayout(migrated) ? migrated : null;
    } catch {
      return null;
    }
  }

  load(): DesktopLayout {
    const current = this.readValid(this.filePath);
    if (current) {
      const normalized = normalizeLegacyDefaultHomeLayout(current);
      if (normalized !== current) this.write(normalized);
      return normalized;
    }
    const backup = this.readValid(this.backupPath);
    if (backup) {
      const normalized = normalizeLegacyDefaultHomeLayout(backup);
      this.write(normalized);
      return normalized;
    }
    return this.reset();
  }

  save(input: DesktopLayout): DesktopLayout {
    const next: DesktopLayout = { ...input, version: DESKTOP_LAYOUT_VERSION, updatedAt: new Date().toISOString() };
    if (!validateDesktopLayout(next)) throw new Error("桌面布局无效，已拒绝保存");
    this.write(next);
    return next;
  }

  reset(): DesktopLayout {
    const layout = createDefaultDesktopLayout();
    this.write(layout);
    return layout;
  }

  patch(patch: Partial<Pick<DesktopLayout, "activeScene" | "hidden" | "editMode" | "targetDisplayId" | "rememberedDisplayId">>): DesktopLayout {
    return this.save({ ...this.load(), ...patch });
  }

  selectDisplay(displayId: string): DesktopLayout {
    const current = this.load();
    if (current.rememberedDisplayId === displayId) return current;
    const displayPlacements = { ...current.displayPlacements };
    if (current.rememberedDisplayId) displayPlacements[current.rememberedDisplayId] = current.placements.map((placement) => ({ ...placement }));
    const placements = displayPlacements[displayId]?.map((placement) => ({ ...placement })) ?? current.placements;
    return this.save({ ...current, rememberedDisplayId: displayId, placements, displayPlacements });
  }

  private write(layout: DesktopLayout): void {
    const text = `${JSON.stringify(layout, null, 2)}\n`;
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, text, "utf8");
    fs.renameSync(temporary, this.filePath);
    fs.writeFileSync(this.backupPath, text, "utf8");
  }
}
