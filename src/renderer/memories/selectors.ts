import type { MemoryEntry, MemoryMediaType } from "../../shared/memories";

export type MemoryFilter = "all" | MemoryMediaType;

export interface MemoryYearSummary {
  year: string;
  total: number;
  categories: Record<MemoryMediaType, number>;
  months: number[];
  topTags: Array<{ tag: string; count: number }>;
}

export function filterMemoryEntries(entries: MemoryEntry[], filter: MemoryFilter, query: string): MemoryEntry[] {
  const needle = query.trim().toLocaleLowerCase();
  return entries.filter((entry) => {
    if (filter !== "all" && entry.mediaType !== filter) return false;
    if (!needle) return true;
    return [entry.title, entry.creator, entry.shortReview, entry.review, ...entry.tags]
      .join(" ")
      .toLocaleLowerCase()
      .includes(needle);
  });
}

export function memoryTypeCounts(entries: MemoryEntry[]): Record<MemoryFilter, number> {
  return {
    all: entries.length,
    book: entries.filter((entry) => entry.mediaType === "book").length,
    movie: entries.filter((entry) => entry.mediaType === "movie").length,
    series: entries.filter((entry) => entry.mediaType === "series").length,
  };
}

export function memoryYears(entries: MemoryEntry[]): Array<{ year: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const year = entry.completedOn.slice(0, 4);
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  return [...counts].map(([year, count]) => ({ year, count })).sort((a, b) => b.year.localeCompare(a.year));
}

export function commonMemoryTags(entries: MemoryEntry[], limit = 3): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of entries) for (const tag of entry.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "zh-CN"))
    .slice(0, limit);
}

export function buildMemoryYearSummary(entries: MemoryEntry[], year: string): MemoryYearSummary {
  const scoped = entries.filter((entry) => entry.completedOn.startsWith(year));
  const months = Array.from({ length: 12 }, () => 0);
  for (const entry of scoped) {
    const month = Number(entry.completedOn.slice(5, 7));
    if (month >= 1 && month <= 12) months[month - 1] += 1;
  }
  return {
    year,
    total: scoped.length,
    categories: {
      book: scoped.filter((entry) => entry.mediaType === "book").length,
      movie: scoped.filter((entry) => entry.mediaType === "movie").length,
      series: scoped.filter((entry) => entry.mediaType === "series").length,
    },
    months,
    topTags: commonMemoryTags(scoped, 5),
  };
}

export function sortTimelineEntries(entries: MemoryEntry[]): MemoryEntry[] {
  return [...entries].sort((a, b) => b.completedOn.localeCompare(a.completedOn) || b.createdAt.localeCompare(a.createdAt));
}

export function clampTimelineIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(length - 1, Math.max(0, index));
}

export function timelineOffset(index: number, activeIndex: number): number {
  return index - activeIndex;
}
