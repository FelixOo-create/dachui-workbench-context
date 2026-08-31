export type MemoryMediaType = "book" | "movie" | "series";

export interface MemoryEntry {
  id: string;
  mediaType: MemoryMediaType;
  title: string;
  creator: string;
  releaseYear: number | null;
  seasonLabel: string;
  completedOn: string;
  rating: number | null;
  shortReview: string;
  review: string;
  tags: string[];
  isRepeat: boolean;
  coverDataUrl: string | null;
  coverAttribution: string;
  externalProvider: "openlibrary" | "tmdb" | null;
  externalId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryEntryInput {
  id?: string;
  mediaType: MemoryMediaType;
  title: string;
  creator?: string;
  releaseYear?: number | null;
  seasonLabel?: string;
  completedOn: string;
  rating?: number | null;
  shortReview?: string;
  review?: string;
  tags?: string[];
  isRepeat?: boolean;
  localCoverPath?: string | null;
  coverDataUrl?: string | null;
  removeCover?: boolean;
  coverAttribution?: string;
}

export interface LocalCoverSelection {
  path: string;
  dataUrl: string;
}

export interface MemoriesApi {
  list(): Promise<MemoryEntry[]>;
  save(input: MemoryEntryInput): Promise<MemoryEntry>;
  remove(id: string): Promise<void>;
  pickCover(): Promise<LocalCoverSelection | null>;
}
