import type { WorkbenchApi } from "../shared/types";
import type { MemoriesApi } from "../shared/memories";

declare global {
  interface Window {
    workbench?: WorkbenchApi;
    memories?: MemoriesApi;
  }
}

export {};
