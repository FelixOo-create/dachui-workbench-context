import type { DesktopLayout, DesktopLayoutPreset, DesktopSceneId, WidgetManifest, WidgetPlacement } from "../../shared/desktop";

export interface PanelSize {
  colSpan: number;
  rowSpan: number;
}

export function getPanelSize(placement: WidgetPlacement, defaults: Record<string, PanelSize>): PanelSize {
  if (Number.isInteger(placement.colSpan) && placement.colSpan >= 1 && placement.colSpan <= 12
    && Number.isInteger(placement.rowSpan) && placement.rowSpan >= 1 && placement.rowSpan <= 12) {
    return { colSpan: placement.colSpan, rowSpan: placement.rowSpan };
  }
  return defaults[placement.widgetId] ?? { colSpan: 3, rowSpan: 4 };
}

export function placementsForScene(layout: DesktopLayout, sceneId: DesktopSceneId): WidgetPlacement[] {
  return layout.placements
    .filter((item) => item.sceneId === sceneId && !item.hidden)
    .slice()
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
}

export function sceneHasPlacements(layout: DesktopLayout, sceneId: DesktopSceneId): boolean {
  return layout.placements.some((item) => item.sceneId === sceneId && !item.hidden);
}

export function updatePlacement(layout: DesktopLayout, widgetId: string, patch: Partial<Pick<WidgetPlacement, "hidden" | "colSpan" | "rowSpan">>): DesktopLayout {
  return { ...layout, placements: layout.placements.map((item) => item.widgetId === widgetId ? { ...item, ...patch } : item) };
}

export function resizePlacement(layout: DesktopLayout, widgetId: string, colDelta: number, rowDelta: number): DesktopLayout {
  return updatePlacement(layout, widgetId, {
    colSpan: Math.max(1, Math.min(12, (layout.placements.find((item) => item.widgetId === widgetId)?.colSpan ?? 3) + colDelta)),
    rowSpan: Math.max(1, Math.min(12, (layout.placements.find((item) => item.widgetId === widgetId)?.rowSpan ?? 3) + rowDelta)),
  });
}

export function reorderPlacement(layout: DesktopLayout, sceneId: DesktopSceneId, widgetId: string, direction: -1 | 1): DesktopLayout {
  const ordered = layout.placements.filter((item) => item.sceneId === sceneId).slice().sort((a, b) => a.order - b.order);
  const index = ordered.findIndex((item) => item.widgetId === widgetId);
  const other = ordered[index + direction];
  if (index < 0 || !other) return layout;
  const current = ordered[index];
  const currentOrder = current.order;
  const nextOrder = other.order;
  return { ...layout, placements: layout.placements.map((item) => item.widgetId === current.widgetId ? { ...item, order: nextOrder } : item.widgetId === other.widgetId ? { ...item, order: currentOrder } : item) };
}

function spanForPreset(preset: DesktopLayoutPreset, index: number, count: number, manifest: WidgetManifest): PanelSize {
  if (preset === "split") return { colSpan: 6, rowSpan: index < 2 ? 6 : 3 };
  if (preset === "triple") return { colSpan: 4, rowSpan: index < 3 ? 6 : 3 };
  if (preset === "quad") return { colSpan: 6, rowSpan: 4 };
  if (preset === "hero") return index === 0 ? { colSpan: 8, rowSpan: 7 } : { colSpan: 4, rowSpan: 3 };
  if (preset === "smart") {
    if (count === 1) return { colSpan: 12, rowSpan: Math.min(8, manifest.maxSpan.row) };
    if (count === 2) return { colSpan: 6, rowSpan: 7 };
    if (count === 3) return { colSpan: 4, rowSpan: 6 };
    return { colSpan: manifest.preferredSpan.col, rowSpan: manifest.preferredSpan.row };
  }
  return { colSpan: manifest.preferredSpan.col, rowSpan: manifest.preferredSpan.row };
}

export function applyLayoutPreset(layout: DesktopLayout, manifests: WidgetManifest[], preset: DesktopLayoutPreset): DesktopLayout {
  if (preset === "free") return { ...layout, preset, previousPlacements: layout.placements.map((placement) => ({ ...placement })) };
  const manifestById = new Map(manifests.map((manifest) => [manifest.id, manifest]));
  const visible = layout.placements.filter((placement) => placement.sceneId === "today" && !placement.hidden).slice().sort((a, b) => {
    const priority = (manifestById.get(b.widgetId)?.priority ?? 0) - (manifestById.get(a.widgetId)?.priority ?? 0);
    return priority || a.order - b.order;
  });
  const updates = new Map(visible.map((placement, index) => {
    const manifest = manifestById.get(placement.widgetId);
    if (!manifest) return [placement.widgetId, placement] as const;
    const span = spanForPreset(preset, index, visible.length, manifest);
    return [placement.widgetId, { ...placement, order: index, colSpan: Math.max(manifest.minSpan.col, Math.min(manifest.maxSpan.col, span.colSpan)), rowSpan: Math.max(manifest.minSpan.row, Math.min(manifest.maxSpan.row, span.rowSpan)) }] as const;
  }));
  return { ...layout, preset, previousPlacements: layout.placements.map((placement) => ({ ...placement })), placements: layout.placements.map((placement) => updates.get(placement.widgetId) ?? placement) };
}

export function undoLayoutPreset(layout: DesktopLayout): DesktopLayout {
  if (!layout.previousPlacements) return layout;
  return { ...layout, preset: "free", placements: layout.previousPlacements.map((placement) => ({ ...placement })), previousPlacements: null };
}
