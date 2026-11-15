import { fileStore } from "./file-store";
import { pgStore } from "./pg-store";
import type { Store } from "./types";

/**
 * Postgres (Neon) when DATABASE_URL is set; local JSON file otherwise.
 * Force the file store with STORE=file (e.g. when your network blocks Neon).
 */
export function getStore(): Store {
  if (process.env.STORE === "file" || !process.env.DATABASE_URL) return fileStore;
  return pgStore;
}

export * from "./types";
