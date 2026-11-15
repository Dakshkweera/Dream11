import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { checks } from "./contract";

// The file store reads STORE_DIR when it loads, so point it at a throwaway folder first.
const dir = mkdtempSync(join(tmpdir(), "sf-store-"));
process.env.STORE_DIR = dir;
vi.resetModules();

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("file store satisfies the store contract", () => {
  for (const check of checks) {
    it(check.name, async () => {
      const { fileStore } = await import("./file-store");
      await expect(check.run(fileStore, `t_${Math.random().toString(36).slice(2, 8)}`)).resolves.toBeUndefined();
    });
  }
});
