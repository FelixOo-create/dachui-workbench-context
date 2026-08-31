import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { MemoryEntry, MemoryEntryInput, MemoryMediaType } from "../../shared/memories";

type Row = Record<string, unknown>;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function cleanText(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function imageExtension(contentType: string, source = ""): string {
  if (contentType.includes("png") || source.toLowerCase().endsWith(".png")) return "png";
  if (contentType.includes("webp") || source.toLowerCase().endsWith(".webp")) return "webp";
  if (contentType.includes("gif") || source.toLowerCase().endsWith(".gif")) return "gif";
  return "jpg";
}

function imageMime(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

function asMediaType(value: unknown): MemoryMediaType {
  if (value === "book" || value === "movie" || value === "series") return value;
  throw new Error("无效的书影音类型");
}

export class MemoriesService {
  private readonly db: DatabaseSync;
  private readonly coversRoot: string;

  constructor(private readonly root: string) {
    fs.mkdirSync(root, { recursive: true });
    this.coversRoot = path.join(root, "covers");
    fs.mkdirSync(this.coversRoot, { recursive: true });
    this.db = new DatabaseSync(path.join(root, "memories.db"));
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY,
        media_type TEXT NOT NULL,
        title TEXT NOT NULL,
        creator TEXT NOT NULL DEFAULT '',
        release_year INTEGER,
        season_label TEXT NOT NULL DEFAULT '',
        completed_on TEXT NOT NULL,
        rating REAL,
        short_review TEXT NOT NULL DEFAULT '',
        review TEXT NOT NULL DEFAULT '',
        tags_json TEXT NOT NULL DEFAULT '[]',
        is_repeat INTEGER NOT NULL DEFAULT 0,
        cover_file TEXT,
        cover_attribution TEXT NOT NULL DEFAULT '',
        external_provider TEXT,
        external_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memory_entries_completed ON memory_entries(completed_on DESC);
      CREATE INDEX IF NOT EXISTS idx_memory_entries_type ON memory_entries(media_type);
      CREATE TABLE IF NOT EXISTS memory_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  list(): MemoryEntry[] {
    const rows = this.db.prepare("SELECT * FROM memory_entries ORDER BY completed_on DESC, created_at DESC").all() as Row[];
    return rows.map((row) => this.mapEntry(row));
  }

  get(id: string): MemoryEntry | null {
    const row = this.db.prepare("SELECT * FROM memory_entries WHERE id = ?1").get(id) as Row | undefined;
    return row ? this.mapEntry(row) : null;
  }

  async save(input: MemoryEntryInput): Promise<MemoryEntry> {
    const id = cleanText(input.id, 120) || `memory-${randomUUID()}`;
    const existing = this.db.prepare("SELECT * FROM memory_entries WHERE id = ?1").get(id) as Row | undefined;
    const mediaType = asMediaType(input.mediaType);
    const title = cleanText(input.title, 160);
    if (!title) throw new Error("请填写作品名称");
    const completedOn = cleanText(input.completedOn, 10);
    if (!validDate(completedOn)) throw new Error("完成日期无效");

    const rating = input.rating == null ? null : Math.round(Number(input.rating) * 2) / 2;
    if (rating !== null && (!Number.isFinite(rating) || rating < 0 || rating > 5)) throw new Error("评分需在 0 到 5 之间");
    const releaseYear = input.releaseYear == null || input.releaseYear === 0 ? null : Math.trunc(Number(input.releaseYear));
    if (releaseYear !== null && (!Number.isFinite(releaseYear) || releaseYear < 1000 || releaseYear > 2999)) throw new Error("发行年份无效");
    const tags = [...new Set((input.tags ?? []).map((tag) => cleanText(tag, 30)).filter(Boolean))].slice(0, 12);

    const oldCover = existing?.cover_file ? String(existing.cover_file) : null;
    const oldExternalProvider = existing?.external_provider === "openlibrary" || existing?.external_provider === "tmdb"
      ? existing.external_provider
      : null;
    const oldExternalId = existing?.external_id ? String(existing.external_id) : null;
    let nextCover = input.removeCover ? null : oldCover;
    let createdCover: string | null = null;
    try {
      if (input.coverDataUrl) createdCover = this.writeDataUrl(id, input.coverDataUrl);
      else if (input.localCoverPath) createdCover = this.copyLocalCover(id, input.localCoverPath);
      if (createdCover) nextCover = createdCover;

      const now = new Date().toISOString();
      this.db.prepare(`
        INSERT INTO memory_entries (
          id, media_type, title, creator, release_year, season_label, completed_on, rating,
          short_review, review, tags_json, is_repeat, cover_file, cover_attribution,
          external_provider, external_id, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
        ON CONFLICT(id) DO UPDATE SET
          media_type=excluded.media_type, title=excluded.title, creator=excluded.creator,
          release_year=excluded.release_year, season_label=excluded.season_label,
          completed_on=excluded.completed_on, rating=excluded.rating,
          short_review=excluded.short_review, review=excluded.review, tags_json=excluded.tags_json,
          is_repeat=excluded.is_repeat, cover_file=excluded.cover_file,
          cover_attribution=excluded.cover_attribution, external_provider=excluded.external_provider,
          external_id=excluded.external_id, updated_at=excluded.updated_at
      `).run(
        id,
        mediaType,
        title,
        cleanText(input.creator, 160),
        releaseYear,
        cleanText(input.seasonLabel, 80),
        completedOn,
        rating,
        cleanText(input.shortReview, 280),
        cleanText(input.review, 12000),
        JSON.stringify(tags),
        input.isRepeat ? 1 : 0,
        nextCover,
        cleanText(input.coverAttribution, 120),
        oldExternalProvider,
        oldExternalId,
        existing ? String(existing.created_at) : now,
        now,
      );
    } catch (error) {
      if (createdCover) this.removeCoverFile(createdCover);
      throw error;
    }

    if (oldCover && oldCover !== nextCover) this.removeCoverFile(oldCover);
    const saved = this.get(id);
    if (!saved) throw new Error("纪念记录保存失败");
    return saved;
  }

  remove(id: string): void {
    const row = this.db.prepare("SELECT cover_file FROM memory_entries WHERE id = ?1").get(id) as Row | undefined;
    this.db.prepare("DELETE FROM memory_entries WHERE id = ?1").run(id);
    if (row?.cover_file) this.removeCoverFile(String(row.cover_file));
  }

  previewLocalCover(filePath: string): string {
    const resolved = path.resolve(filePath);
    const stats = fs.statSync(resolved);
    if (!stats.isFile() || stats.size > MAX_IMAGE_BYTES) throw new Error("封面文件无效或超过 8MB");
    return `data:${imageMime(resolved)};base64,${fs.readFileSync(resolved).toString("base64")}`;
  }

  private mapEntry(row: Row): MemoryEntry {
    let tags: string[] = [];
    try {
      const parsed = JSON.parse(String(row.tags_json ?? "[]"));
      if (Array.isArray(parsed)) tags = parsed.map(String);
    } catch {
      tags = [];
    }
    const coverFile = row.cover_file ? String(row.cover_file) : null;
    return {
      id: String(row.id),
      mediaType: asMediaType(row.media_type),
      title: String(row.title),
      creator: String(row.creator ?? ""),
      releaseYear: row.release_year == null ? null : Number(row.release_year),
      seasonLabel: String(row.season_label ?? ""),
      completedOn: String(row.completed_on),
      rating: row.rating == null ? null : Number(row.rating),
      shortReview: String(row.short_review ?? ""),
      review: String(row.review ?? ""),
      tags,
      isRepeat: Number(row.is_repeat) !== 0,
      coverDataUrl: coverFile ? this.readCover(coverFile) : null,
      coverAttribution: String(row.cover_attribution ?? ""),
      externalProvider: row.external_provider === "openlibrary" || row.external_provider === "tmdb" ? row.external_provider : null,
      externalId: row.external_id ? String(row.external_id) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private readCover(fileName: string): string | null {
    const safeName = path.basename(fileName);
    const filePath = path.join(this.coversRoot, safeName);
    if (!fs.existsSync(filePath)) return null;
    return `data:${imageMime(filePath)};base64,${fs.readFileSync(filePath).toString("base64")}`;
  }

  private writeDataUrl(id: string, dataUrl: string): string {
    const match = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
    if (!match) throw new Error("粘贴的图片格式不受支持");
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) throw new Error("封面图片为空或超过 8MB");
    const fileName = `${id}-${randomUUID()}.${imageExtension(match[1])}`;
    fs.writeFileSync(path.join(this.coversRoot, fileName), buffer);
    return fileName;
  }

  private copyLocalCover(id: string, sourcePath: string): string {
    const resolved = path.resolve(sourcePath);
    const stats = fs.statSync(resolved);
    if (!stats.isFile() || stats.size === 0 || stats.size > MAX_IMAGE_BYTES) throw new Error("封面文件无效或超过 8MB");
    const fileName = `${id}-${randomUUID()}.${imageExtension(imageMime(resolved), resolved)}`;
    fs.copyFileSync(resolved, path.join(this.coversRoot, fileName));
    return fileName;
  }

  private removeCoverFile(fileName: string): void {
    const filePath = path.join(this.coversRoot, path.basename(fileName));
    if (fs.existsSync(filePath)) fs.rmSync(filePath);
  }

  close(): void {
    this.db.close();
  }
}
