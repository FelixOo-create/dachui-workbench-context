import type { Activity, Category } from "./types";
import { timelogApi } from "./api";

export interface Catalog {
  categories: Category[];
  activities: Activity[];
}

export async function loadCatalog(): Promise<Catalog> {
  const [categories, activities] = await Promise.all([
    timelogApi.categories.all(true),
    timelogApi.activities.all(true),
  ]);
  return { categories, activities };
}
