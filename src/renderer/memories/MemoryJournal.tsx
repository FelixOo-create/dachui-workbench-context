import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Film,
  Grid3X3,
  ImagePlus,
  LayoutGrid,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type PointerEvent,
} from "react";
import type { MemoryEntry, MemoryEntryInput, MemoryMediaType } from "../../shared/memories";
import { memoriesApi } from "./api";
import { blobToDataUrl, findClipboardImageType, validateClipboardImage } from "./coverClipboard";
import {
  buildMemoryYearSummary,
  clampTimelineIndex,
  commonMemoryTags,
  filterMemoryEntries,
  memoryTypeCounts,
  memoryYears,
  sortTimelineEntries,
  timelineOffset,
  type MemoryFilter,
} from "./selectors";
import "./MemoryJournal.css";

type ViewMode = "covers" | "timeline";

const mediaLabels: Record<MemoryMediaType, string> = { book: "书籍", movie: "电影", series: "剧集" };
const mediaEnglish: Record<MemoryMediaType, string> = { book: "BOOK", movie: "FILM", series: "SERIES" };
const mediaIcons = { book: BookOpen, movie: Film, series: Clapperboard };

function localDate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

function shortDate(value: string): string {
  return value.slice(5).replace("-", "月") + "日";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function Rating({ value, compact = false }: { value: number | null; compact?: boolean }) {
  if (value == null) return <span className="memory-unrated">未评分</span>;
  return (
    <span className={compact ? "memory-rating compact" : "memory-rating"} aria-label={`${value} 星`}>
      <span>{"★".repeat(Math.max(1, Math.round(value)))}</span>
      <strong>{value.toFixed(value % 1 ? 1 : 0)}</strong>
    </span>
  );
}

function ResilientImage({ src, alt = "" }: { src: string | null | undefined; alt?: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    setFailed(false);
    const image = imageRef.current;
    setLoaded(Boolean(image?.complete && image.naturalWidth > 0));
  }, [src]);
  if (!src || failed) return null;
  return <img ref={imageRef} className={loaded ? "loaded" : ""} src={src} alt={alt} onLoad={(event) => setLoaded(event.currentTarget.naturalWidth > 0)} onError={() => { setFailed(true); setLoaded(false); }} />;
}

function Cover({ entry, className = "", index = 0 }: { entry: MemoryEntry; className?: string; index?: number }) {
  const Icon = mediaIcons[entry.mediaType];
  return (
    <div className={`memory-v2-cover tone-${index % 6} ${className}`}>
      <div className="memory-v2-cover-fallback"><Icon size={22} /><strong>{entry.title}</strong><small>{mediaLabels[entry.mediaType]}</small></div>
      <ResilientImage src={entry.coverDataUrl} alt={`${entry.title}封面`} />
    </div>
  );
}

export default function MemoryJournal() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(() => { try { return window.localStorage.getItem("workbench.memories.query") ?? ""; } catch { return ""; } });
  const [filter, setFilter] = useState<MemoryFilter>(() => { try { const value = window.localStorage.getItem("workbench.memories.filter"); return value === "book" || value === "movie" || value === "series" ? value : "all"; } catch { return "all"; } });
  const [view, setView] = useState<ViewMode>(() => { try { return window.localStorage.getItem("workbench.memories.view") === "timeline" ? "timeline" : "covers"; } catch { return "covers"; } });
  const [editor, setEditor] = useState<MemoryEntry | null | undefined>(undefined);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [timelineIndex, setTimelineIndex] = useState(0);
  const dragStartX = useRef<number | null>(null);

  const load = async () => {
    setError(null);
    try {
      const next = await memoriesApi.list();
      setEntries(next);
      setSelectedId((current) => current && next.some((entry) => entry.id === current) ? current : next[0]?.id ?? null);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("workbench.memories.query", query);
      window.localStorage.setItem("workbench.memories.filter", filter);
      window.localStorage.setItem("workbench.memories.view", view);
    } catch { /* 界面偏好不可用时不影响纪念册。 */ }
  }, [filter, query, view]);

  const visible = useMemo(() => filterMemoryEntries(entries, filter, query), [entries, filter, query]);
  const counts = useMemo(() => memoryTypeCounts(entries), [entries]);
  const tags = useMemo(() => commonMemoryTags(entries, 3), [entries]);
  const years = useMemo(() => memoryYears(entries), [entries]);
  const timelineEntries = useMemo(() => sortTimelineEntries(visible), [visible]);
  const selected = visible.find((entry) => entry.id === selectedId) ?? visible[0] ?? null;

  useEffect(() => {
    if (!visible.length) return setSelectedId(null);
    if (!visible.some((entry) => entry.id === selectedId)) setSelectedId(visible[0].id);
  }, [selectedId, visible]);

  useEffect(() => {
    const index = timelineEntries.findIndex((entry) => entry.id === selectedId);
    setTimelineIndex(index >= 0 ? index : 0);
  }, [selectedId, timelineEntries]);

  const activeTimelineEntry = timelineEntries[timelineIndex] ?? null;
  const activeYear = activeTimelineEntry?.completedOn.slice(0, 4) ?? selected?.completedOn.slice(0, 4) ?? String(new Date().getFullYear());
  const yearSummary = useMemo(() => buildMemoryYearSummary(entries, activeYear), [activeYear, entries]);
  const previousYearTotal = entries.filter((entry) => entry.completedOn.startsWith(String(Number(activeYear) - 1))).length;

  const selectTimelineIndex = (index: number) => {
    const next = clampTimelineIndex(index, timelineEntries.length);
    setTimelineIndex(next);
    setSelectedId(timelineEntries[next]?.id ?? null);
  };

  useEffect(() => {
    if (view !== "timeline" || editor !== undefined || detailOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest("input, textarea, select")) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); selectTimelineIndex(timelineIndex - 1); }
      if (event.key === "ArrowRight") { event.preventDefault(); selectTimelineIndex(timelineIndex + 1); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailOpen, editor, timelineIndex, timelineEntries.length, view]);

  const remove = async (entry: MemoryEntry) => {
    if (!window.confirm(`删除「${entry.title}」这条纪念记录？`)) return;
    try {
      await memoriesApi.remove(entry.id);
      const next = entries.filter((item) => item.id !== entry.id);
      setEntries(next);
      setSelectedId(next[0]?.id ?? null);
      setDetailOpen(false);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  const upsert = (saved: MemoryEntry) => {
    const next = sortTimelineEntries([saved, ...entries.filter((entry) => entry.id !== saved.id)]);
    setEntries(next);
    setSelectedId(saved.id);
    setEditor(undefined);
  };

  return (
    <div className="memory-v2-page" data-view={view}>
      <header className="memory-v2-heading">
        <div><span className="memory-v2-eyebrow">MEMORY ARCHIVE</span><h1>纪念册</h1><p>把读完、看完和真正想记住的感受，整理成自己的精神档案。</p></div>
        <div className="memory-v2-actions"><label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索作品、作者或标签" /></label><button type="button" onClick={() => setEditor(null)}><Plus size={16} />记录完成</button></div>
      </header>

      {error && <div className="memory-v2-error" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>重试</button></div>}
      {loading ? (
        <div className="memory-v2-state"><LoaderCircle className="spin" size={24} /><strong>正在读取纪念册</strong></div>
      ) : !visible.length ? (
        <div className="memory-v2-state"><BookOpen size={25} /><strong>{entries.length ? "没有匹配的记录" : "还没有完成纪念"}</strong><p>{entries.length ? "调整搜索或分类筛选条件。" : "读完或看完一部作品后，从这里留下第一条记忆。"}</p><button type="button" onClick={() => setEditor(null)}><Plus size={15} />记录完成</button></div>
      ) : view === "covers" ? (
        <CoverWorkspace entries={entries} visible={visible} selected={selected} counts={counts} tags={tags} years={years} filter={filter} onFilter={setFilter} onView={setView} onSelect={setSelectedId} onOpenDetail={() => setDetailOpen(true)} onEdit={(entry) => setEditor(entry)} onDelete={(entry) => void remove(entry)} />
      ) : (
        <TimelineWorkspace entries={timelineEntries} activeIndex={timelineIndex} activeEntry={activeTimelineEntry} summary={yearSummary} previousYearTotal={previousYearTotal} onView={setView} onSelectIndex={selectTimelineIndex} onPointerDown={(event) => { dragStartX.current = event.clientX; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerUp={(event) => { const start = dragStartX.current; dragStartX.current = null; if (start == null) return; const distance = event.clientX - start; if (Math.abs(distance) > 45) selectTimelineIndex(timelineIndex + (distance < 0 ? 1 : -1)); }} />
      )}

      {detailOpen && selected && <MemoryDetail entry={selected} onClose={() => setDetailOpen(false)} onEdit={() => { setEditor(selected); setDetailOpen(false); }} onDelete={() => void remove(selected)} />}
      {editor !== undefined && <MemoryEditor entry={editor} onClose={() => setEditor(undefined)} onSaved={upsert} />}
    </div>
  );
}

function CoverWorkspace({ entries, visible, selected, counts, tags, years, filter, onFilter, onView, onSelect, onOpenDetail, onEdit, onDelete }: {
  entries: MemoryEntry[];
  visible: MemoryEntry[];
  selected: MemoryEntry | null;
  counts: Record<MemoryFilter, number>;
  tags: Array<{ tag: string; count: number }>;
  years: Array<{ year: string; count: number }>;
  filter: MemoryFilter;
  onFilter: (filter: MemoryFilter) => void;
  onView: (view: ViewMode) => void;
  onSelect: (id: string) => void;
  onOpenDetail: () => void;
  onEdit: (entry: MemoryEntry) => void;
  onDelete: (entry: MemoryEntry) => void;
}) {
  const thisYear = String(new Date().getFullYear());
  const thisYearCount = entries.filter((entry) => entry.completedOn.startsWith(thisYear)).length;
  const previousCount = entries.filter((entry) => entry.completedOn.startsWith(String(Number(thisYear) - 1))).length;
  return (
    <div className="memory-v2-cover-workspace">
      <aside className="memory-v2-sidebar memory-v2-panel">
        <header>浏览</header>
        <nav>{(["all", "book", "movie", "series"] as MemoryFilter[]).map((value) => { const Icon = value === "all" ? Grid3X3 : mediaIcons[value]; return <button type="button" className={filter === value ? "active" : ""} key={value} onClick={() => onFilter(value)}><Icon size={14} /><span>{value === "all" ? "全部记录" : mediaLabels[value]}</span><b>{counts[value]}</b></button>; })}</nav>
        <section><h3>常用标签</h3>{tags.map((item, index) => <div key={item.tag}><i className={`tag-${index}`} /><span>{item.tag}</span><b>{item.count}</b></div>)}</section>
        <section><h3>年份归档</h3>{years.slice(0, 4).map((item) => <div key={item.year}><span>{item.year}</span><b>{item.count}</b></div>)}</section>
        <footer><span>今年已收藏</span><strong>{thisYearCount}</strong><small>{previousCount ? `比去年同期多 ${Math.max(0, thisYearCount - previousCount)} 条` : "正在建立今年的精神档案"}</small></footer>
      </aside>

      <main className="memory-v2-library memory-v2-panel">
        <header><div><span className="memory-v2-eyebrow">COLLECTION</span><h2>最近完成</h2></div><div className="memory-v2-switch"><button type="button" className="active" onClick={() => onView("covers")}>封面墙</button><button type="button" onClick={() => onView("timeline")}>时间线</button></div></header>
        <div className="memory-v2-grid">{visible.map((entry, index) => <button type="button" className={`memory-v2-card${selected?.id === entry.id ? " selected" : ""}`} key={entry.id} onClick={() => onSelect(entry.id)}><Cover entry={entry} index={index} /><span className="memory-v2-cover-label">{mediaEnglish[entry.mediaType]} · {entry.seasonLabel || entry.releaseYear || "ARCHIVE"}</span><div><strong>{entry.title}</strong><Rating value={entry.rating} compact /></div><p><span>{entry.creator || mediaLabels[entry.mediaType]} · {shortDate(entry.completedOn)}</span><em>{entry.isRepeat ? "值得重读" : "首次完成"}</em></p></button>)}</div>
      </main>

      {selected && <aside className="memory-v2-detail memory-v2-panel"><Cover entry={selected} className="detail" /><div className="memory-v2-detail-title"><span className={`memory-v2-type ${selected.mediaType}`}>{mediaLabels[selected.mediaType]}</span><h2>{selected.title}</h2><p>{[selected.creator, selected.releaseYear, selected.seasonLabel].filter(Boolean).join(" · ")}</p><Rating value={selected.rating} /></div><dl><div><dt>完成日期</dt><dd>{formatDate(selected.completedOn)}</dd></div><div><dt>记录类型</dt><dd>{selected.isRepeat ? "重读 / 重看" : "首次完成"}</dd></div>{selected.tags.length > 0 && <div><dt>标签</dt><dd>{selected.tags.join(" · ")}</dd></div>}</dl>{selected.shortReview && <blockquote>{selected.shortReview}</blockquote>}<footer><button type="button" onClick={onOpenDetail}>查看完整记录 <ArrowRight size={14} /></button><div><button type="button" aria-label={`编辑 ${selected.title}`} onClick={() => onEdit(selected)}><Pencil size={14} /></button><button type="button" aria-label={`删除 ${selected.title}`} onClick={() => onDelete(selected)}><Trash2 size={14} /></button></div></footer></aside>}
    </div>
  );
}

function TimelineWorkspace({ entries, activeIndex, activeEntry, summary, previousYearTotal, onView, onSelectIndex, onPointerDown, onPointerUp }: {
  entries: MemoryEntry[];
  activeIndex: number;
  activeEntry: MemoryEntry | null;
  summary: ReturnType<typeof buildMemoryYearSummary>;
  previousYearTotal: number;
  onView: (view: ViewMode) => void;
  onSelectIndex: (index: number) => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  const maxMonth = Math.max(1, ...summary.months);
  return (
    <div className="memory-v2-timeline-workspace">
      <main className="memory-v2-timeline-panel memory-v2-panel">
        <header><div><span className="memory-v2-eyebrow">MEMORY TIMELINE</span><h2>{summary.year} 时间长廊</h2></div><div><span>{entries.length} 条纪念 · 最近更新于今天</span><button type="button" aria-label="上一条" disabled={activeIndex <= 0} onClick={() => onSelectIndex(activeIndex - 1)}><ChevronLeft size={15} /></button><button type="button" aria-label="下一条" disabled={activeIndex >= entries.length - 1} onClick={() => onSelectIndex(activeIndex + 1)}><ChevronRight size={15} /></button><button type="button" onClick={() => onView("covers")}>封面墙</button></div></header>
        {activeEntry && <div className="memory-v2-timeline-stage" onPointerDown={onPointerDown} onPointerUp={onPointerUp}><div className="memory-v2-year-ghost">{activeEntry.completedOn.slice(0, 4)}</div><div className="memory-v2-active-date"><span>{activeEntry.completedOn.slice(0, 4)} · {new Date(`${activeEntry.completedOn}T00:00:00`).toLocaleDateString("en-US", { month: "long" }).toUpperCase()}</span><strong>{Number(activeEntry.completedOn.slice(5, 7))}月 {Number(activeEntry.completedOn.slice(8))}日</strong></div><div className="memory-v2-carousel">{entries.map((entry, index) => { const offset = timelineOffset(index, activeIndex); if (Math.abs(offset) > 3) return null; const scale = offset === 0 ? 1 : Math.abs(offset) === 1 ? .82 : Math.abs(offset) === 2 ? .68 : .56; const opacity = offset === 0 ? 1 : Math.abs(offset) === 1 ? .55 : Math.abs(offset) === 2 ? .26 : .12; const style = { "--memory-scale": scale, "--memory-opacity": opacity, zIndex: 10 - Math.abs(offset), transform: `translateX(calc(-50% + ${offset * 210}px)) scale(${scale})` } as CSSProperties; return <button type="button" style={style} className={`memory-v2-timeline-card${offset === 0 ? " active" : ""}`} key={entry.id} onClick={() => onSelectIndex(index)}><Cover entry={entry} index={index} /><span>{mediaEnglish[entry.mediaType]} · {entry.releaseYear ?? "ARCHIVE"}</span><div><h3>{entry.title}</h3><p>{entry.creator}<time>{shortDate(entry.completedOn)}</time></p><blockquote>{entry.shortReview || entry.review || "这次完成还没有留下评语。"}</blockquote><Rating value={entry.rating} compact /></div></button>; })}</div><div className="memory-v2-ticks">{Array.from({ length: 12 }, (_, index) => <span className={index + 1 === Number(activeEntry.completedOn.slice(5, 7)) ? "active" : ""} key={index}><i />{index % 2 === 0 && <b>{index + 1}月</b>}</span>)}</div><small className="memory-v2-timeline-hint">拖动浏览 · 点击卡片聚焦 · 键盘方向键切换</small></div>}
      </main>
      <aside className="memory-v2-year-map memory-v2-panel"><header><h2>年度记忆地图</h2><p>媒介、主题与完成记录围绕年度坐标生长</p></header><div className="memory-v2-orbit"><span className="orbit-ring one" /><span className="orbit-ring two" /><strong>{summary.total}<small>{summary.year} 记忆</small></strong>{(["book", "movie", "series"] as MemoryMediaType[]).map((type, index) => <div className={`orbit-item item-${index}`} key={type}><b>{mediaLabels[type]}</b><span>{summary.categories[type]} 条 · {summary.total ? Math.round(summary.categories[type] / summary.total * 100) : 0}%</span></div>)}</div><section className="memory-v2-rhythm"><header><span>完成节奏</span><b>1—12 月</b></header><div>{summary.months.map((count, index) => <span key={index}><i style={{ height: `${12 + count / maxMonth * 42}px` }} /><b>{index + 1}月</b></span>)}</div></section><section className="memory-v2-keywords"><span>本年关键词</span><div>{summary.topTags.length ? summary.topTags.map((item) => <b key={item.tag}>{item.tag}</b>) : <b>等待记录</b>}</div></section><blockquote>{summary.total > previousYearTotal ? "今年留下的不只是完成数量，而是每一次真正改变观看方式的相遇。" : "每条记录都在补全这一年的精神坐标。"}</blockquote></aside>
    </div>
  );
}

function MemoryDetail({ entry, onClose, onEdit, onDelete }: { entry: MemoryEntry; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  return <div className="memory-v2-detail-backdrop" onMouseDown={onClose}><aside className="memory-v2-drawer" onMouseDown={(event) => event.stopPropagation()}><header><span>{mediaLabels[entry.mediaType]}纪念</span><button type="button" aria-label="关闭完整记录" onClick={onClose}><X size={17} /></button></header><div className="memory-v2-drawer-hero"><Cover entry={entry} /><div><span className={`memory-v2-type ${entry.mediaType}`}>{mediaLabels[entry.mediaType]}</span><h2>{entry.title}</h2><p>{[entry.creator, entry.releaseYear, entry.seasonLabel].filter(Boolean).join(" · ")}</p><Rating value={entry.rating} /></div></div><dl><div><dt>完成日期</dt><dd>{formatDate(entry.completedOn)}</dd></div><div><dt>记录类型</dt><dd>{entry.isRepeat ? "重读 / 重看" : "首次完成"}</dd></div></dl>{entry.shortReview && <blockquote>{entry.shortReview}</blockquote>}{entry.review && <div className="memory-v2-long-review">{entry.review}</div>}{entry.tags.length > 0 && <div className="memory-v2-tags">{entry.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}<footer><button className="danger" type="button" onClick={onDelete}><Trash2 size={15} />删除</button><button type="button" onClick={onEdit}><Pencil size={15} />编辑记录</button></footer></aside></div>;
}

interface Draft {
  id?: string;
  mediaType: MemoryMediaType;
  title: string;
  creator: string;
  releaseYear: string;
  seasonLabel: string;
  completedOn: string;
  rating: number | null;
  shortReview: string;
  review: string;
  tags: string;
  isRepeat: boolean;
  coverPreview: string | null;
  localCoverPath: string | null;
  coverDataUrl: string | null;
  removeCover: boolean;
  coverAttribution: string;
}

function makeDraft(entry: MemoryEntry | null): Draft {
  return entry ? { id: entry.id, mediaType: entry.mediaType, title: entry.title, creator: entry.creator, releaseYear: entry.releaseYear?.toString() ?? "", seasonLabel: entry.seasonLabel, completedOn: entry.completedOn, rating: entry.rating, shortReview: entry.shortReview, review: entry.review, tags: entry.tags.join("，"), isRepeat: entry.isRepeat, coverPreview: entry.coverDataUrl, localCoverPath: null, coverDataUrl: null, removeCover: false, coverAttribution: entry.coverAttribution } : { mediaType: "book", title: "", creator: "", releaseYear: "", seasonLabel: "", completedOn: localDate(), rating: null, shortReview: "", review: "", tags: "", isRepeat: false, coverPreview: null, localCoverPath: null, coverDataUrl: null, removeCover: false, coverAttribution: "" };
}

function MemoryEditor({ entry, onClose, onSaved }: { entry: MemoryEntry | null; onClose: () => void; onSaved: (entry: MemoryEntry) => void }) {
  const [draft, setDraft] = useState(() => makeDraft(entry));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [onClose]);

  const pickLocal = async () => {
    try {
      const selected = await memoriesApi.pickCover();
      if (!selected) return;
      setDraft((current) => ({ ...current, coverPreview: selected.dataUrl, localCoverPath: selected.path, coverDataUrl: null, removeCover: false, coverAttribution: "本地图片" }));
    } catch (reason) { setMessage(errorMessage(reason)); }
  };

  const applyClipboardImage = async (blob: Blob) => {
    validateClipboardImage(blob.type, blob.size);
    const dataUrl = await blobToDataUrl(blob);
    setDraft((current) => ({ ...current, coverPreview: dataUrl, coverDataUrl: dataUrl, localCoverPath: null, removeCover: false, coverAttribution: "粘贴图片" }));
  };

  const pasteFromClipboard = async () => {
    setMessage(null);
    try {
      if (!navigator.clipboard?.read) throw new Error("当前环境不支持读取剪贴板图片，请按 Ctrl+V");
      const items = await navigator.clipboard.read();
      const imageType = findClipboardImageType(items.flatMap((item) => item.types));
      if (!imageType) throw new Error("剪贴板中没有图片");
      const item = items.find((candidate) => candidate.types.includes(imageType));
      if (!item) throw new Error("剪贴板中没有图片");
      await applyClipboardImage(await item.getType(imageType));
    } catch (reason) { setMessage(errorMessage(reason)); }
  };

  const pasteCover = (event: ClipboardEvent<HTMLDivElement>) => {
    const imageType = findClipboardImageType([...event.clipboardData.items].map((item) => item.type));
    if (!imageType) return;
    event.preventDefault();
    const item = [...event.clipboardData.items].find((candidate) => candidate.type === imageType);
    const file = item?.getAsFile();
    if (!file) { setMessage("无法读取剪贴板图片"); return; }
    void applyClipboardImage(file).catch((reason) => setMessage(errorMessage(reason)));
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const input: MemoryEntryInput = { id: draft.id, mediaType: draft.mediaType, title: draft.title, creator: draft.creator, releaseYear: draft.releaseYear.trim() ? Number(draft.releaseYear) : null, seasonLabel: draft.seasonLabel, completedOn: draft.completedOn, rating: draft.rating, shortReview: draft.shortReview, review: draft.review, tags: draft.tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean), isRepeat: draft.isRepeat, localCoverPath: draft.localCoverPath, coverDataUrl: draft.coverDataUrl, removeCover: draft.removeCover, coverAttribution: draft.coverAttribution };
      onSaved(await memoriesApi.save(input));
    } catch (reason) { setMessage(errorMessage(reason)); } finally { setSaving(false); }
  };

  return (
    <div className="memory-v2-editor-backdrop" onMouseDown={onClose}>
      <div className="memory-v2-editor" role="dialog" aria-modal="true" aria-label={entry ? "编辑纪念" : "记录一次完成"} onMouseDown={(event) => event.stopPropagation()} onPaste={pasteCover}>
        <header><div><span className="memory-v2-eyebrow">NEW MEMORY</span><h2>{entry ? "编辑纪念" : "记录一次完成"}</h2></div><button type="button" aria-label="关闭编辑" onClick={onClose}><X size={17} /></button></header>
        <div className="memory-v2-editor-body">
          <aside className="memory-v2-cover-editor"><div className="memory-v2-editor-preview"><div><ImagePlus size={25} /><strong>添加作品封面</strong><span>复制图片后点击粘贴，或按 Ctrl+V</span></div><ResilientImage src={draft.coverPreview} alt="封面预览" /></div><div className="memory-v2-cover-actions"><button type="button" onClick={() => void pasteFromClipboard()}><ImagePlus size={14} />粘贴剪贴板图片</button><button type="button" onClick={() => void pickLocal()}><ImagePlus size={14} />选择本地图片</button></div>{draft.coverPreview && <button className="remove" type="button" onClick={() => setDraft((current) => ({ ...current, coverPreview: null, localCoverPath: null, coverDataUrl: null, removeCover: true, coverAttribution: "" }))}>移除封面</button>}<small>支持 JPG、PNG、WebP、GIF，最大 8MB；没有封面也可以保存。</small></aside>
          <div className="memory-v2-form">
            <label><span>作品类型</span><div className="memory-v2-kind-switch">{(["book", "movie", "series"] as const).map((type) => <button type="button" key={type} className={draft.mediaType === type ? "active" : ""} onClick={() => update("mediaType", type)}>{mediaLabels[type]}</button>)}</div></label>
            <label><span>作品名称</span><input value={draft.title} onChange={(event) => update("title", event.target.value)} placeholder="作品名称" autoFocus /></label>
            <div className="memory-v2-form-grid">
              <label><span>{draft.mediaType === "book" ? "作者" : "主创 / 导演"}</span><input value={draft.creator} onChange={(event) => update("creator", event.target.value)} /></label>
              <label><span>发行年份</span><input inputMode="numeric" value={draft.releaseYear} onChange={(event) => update("releaseYear", event.target.value.replace(/\D/g, "").slice(0, 4))} /></label>
              {draft.mediaType === "series" && <label><span>季度 / 范围</span><input value={draft.seasonLabel} onChange={(event) => update("seasonLabel", event.target.value)} placeholder="第 1 季、全剧" /></label>}
              <label><span>完成日期</span><input type="date" value={draft.completedOn} onChange={(event) => update("completedOn", event.target.value)} /></label>
            </div>
            <fieldset><legend>评分</legend><div>{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} title={`${value} 星`} className={(draft.rating ?? 0) >= value ? "active" : ""} onClick={() => update("rating", draft.rating === value ? null : value)}><Star size={18} fill={(draft.rating ?? 0) >= value ? "currentColor" : "none"} /></button>)}</div></fieldset>
            <label><span>一句短评</span><input maxLength={280} value={draft.shortReview} onChange={(event) => update("shortReview", event.target.value)} placeholder="以后看到这句话，就能想起完成时的感觉" /></label>
            <label><span>完整感受</span><textarea rows={4} value={draft.review} onChange={(event) => update("review", event.target.value)} placeholder="写下读完或看完之后，真正想留给未来自己的内容……" /></label>
            <div className="memory-v2-form-grid bottom"><label><span>标签</span><input value={draft.tags} onChange={(event) => update("tags", event.target.value)} placeholder="成长，故乡，记忆" /></label><label><span>记录类型</span><select value={draft.isRepeat ? "repeat" : "first"} onChange={(event) => update("isRepeat", event.target.value === "repeat")}><option value="first">首次完成</option><option value="repeat">重读 / 重看</option></select></label></div>
            {message && <div className="memory-v2-form-message">{message}</div>}
          </div>
        </div>
        <footer><span>{draft.coverPreview ? "封面将在保存时写入本地" : "没有封面也可以保存"}</span><div><button type="button" onClick={onClose}>取消</button><button className="primary" type="button" disabled={saving || !draft.title.trim()} onClick={() => void save()}>{saving ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}保存纪念</button></div></footer>
      </div>
    </div>
  );
}
