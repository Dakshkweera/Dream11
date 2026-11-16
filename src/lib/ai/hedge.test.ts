import { describe, expect, it } from "vitest";
import { hedge } from "./openrouter";

const after = <T>(ms: number, value: T, signal?: AbortSignal) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => resolve(value), ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    });
  });

describe("hedge", () => {
  it("uses the first request when it is quick, without starting a second", async () => {
    let started = 0;
    const v = await hedge((s, i) => {
      started++;
      return after(10, `a${i}`, s);
    }, 50);
    expect(v).toBe("a0");
    expect(started).toBe(1);
  });

  it("starts a backup when the first stalls, takes the faster one and cancels the other", async () => {
    const aborted: number[] = [];
    const v = await hedge((s, i) => {
      s.addEventListener("abort", () => aborted.push(i));
      return after(i === 0 ? 500 : 20, `a${i}`, s);
    }, 30);
    expect(v).toBe("a1");
    expect(aborted).toEqual([0]);
  });

  it("starts the backup at once if the first fails", async () => {
    const t = Date.now();
    const v = await hedge((s, i) => (i === 0 ? Promise.reject(new Error("boom")) : after(10, "backup", s)), 1000);
    expect(v).toBe("backup");
    expect(Date.now() - t).toBeLessThan(500);
  });

  it("fails only when both attempts fail", async () => {
    await expect(hedge(() => Promise.reject(new Error("down")), 10)).rejects.toThrow("down");
  });
});
