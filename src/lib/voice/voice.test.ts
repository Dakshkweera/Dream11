import { describe, expect, it } from "vitest";
import { DEFAULT_ENDPOINTER, Endpointer, rms } from "./endpointer";
import { forSpeech, isPhantom, takeSpeakable } from "./speakable";
import { encodeWav } from "./wav";

const FRAME = 20;
/** Feed `ms` of frames at `level`; return the events that fired. */
function feed(e: Endpointer, level: number, ms: number, agentSpeaking = false) {
  const out: string[] = [];
  for (let t = 0; t < ms; t += FRAME) {
    const ev = e.push(level, FRAME, agentSpeaking);
    if (ev) out.push(ev);
  }
  return out;
}

describe("turn-taking", () => {
  it("starts a turn on speech and ends it after a short pause", () => {
    const e = new Endpointer();
    expect(feed(e, 0.003, 1000)).toEqual([]); // quiet room
    expect(feed(e, 0.12, 1200)).toEqual(["start"]);
    expect(e.inTurn).toBe(true);
    expect(feed(e, 0.003, 500)).toEqual(["pause"]); // a pause: start transcribing early, but it's not the end yet
    expect(feed(e, 0.003, 400)).toEqual(["end"]);
    expect(e.inTurn).toBe(false);
  });

  it("does not end the turn during a brief gap between words", () => {
    const e = new Endpointer();
    feed(e, 0.003, 600);
    expect(feed(e, 0.1, 600)).toEqual(["start"]);
    expect(feed(e, 0.003, 400)).toEqual(["pause"]);
    expect(feed(e, 0.1, 600)).toEqual(["resume"]); // they carried on: the early transcript is thrown away
    expect(feed(e, 0.003, DEFAULT_ENDPOINTER.endSilenceMs + 40)).toEqual(["pause", "end"]);
  });

  it("discards a cough instead of sending it", () => {
    const e = new Endpointer();
    feed(e, 0.003, 600);
    const events = [...feed(e, 0.2, 200), ...feed(e, 0.003, 900)];
    expect(events[0]).toBe("start");
    expect(events.at(-1)).toBe("discard");
  });

  it("adapts to a noisy room: steady background noise never starts a turn", () => {
    const e = new Endpointer();
    expect(feed(e, 0.02, 4000)).toEqual([]); // fan noise / crowd hum
    expect(feed(e, 0.15, 400)).toEqual(["start"]); // real speech over it
  });

  it("does not mistake its own voice leaking into the mic for an interruption", () => {
    const e = new Endpointer();
    feed(e, 0.003, 600);
    // The friend talks; some of it leaks into the mic at a steady level.
    expect(feed(e, 0.03, 3000, true)).toEqual([]);
  });

  it("lets the fan interrupt by speaking clearly over the friend", () => {
    const e = new Endpointer();
    feed(e, 0.003, 600);
    feed(e, 0.03, 2000, true);
    expect(feed(e, 0.2, 500, true)).toEqual(["start"]);
  });

  it("needs longer speech to interrupt than to start when the friend is quiet", () => {
    const quiet = new Endpointer();
    const talking = new Endpointer();
    expect(feed(quiet, 0.2, 200)).toEqual(["start"]);
    expect(feed(talking, 0.2, 200, true)).toEqual([]);
  });

  it("measures level", () => {
    expect(rms(new Float32Array([0, 0, 0]))).toBe(0);
    expect(rms(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5);
  });
});

describe("speaking a reply while it streams", () => {
  it("speaks the first sentence as soon as it is complete", () => {
    expect(takeSpeakable("Oh, you HAVE to hear this. Kohli walked in", { first: true, final: false })).toEqual({
      piece: "Oh, you HAVE to hear this.",
      rest: "Kohli walked in",
    });
  });

  it("waits while a sentence is still arriving, then flushes it at the end", () => {
    expect(takeSpeakable("Kohli walked in at 3 down", { first: false, final: false }).piece).toBeNull();
    expect(takeSpeakable("Kohli walked in at 3 down", { first: false, final: true }).piece).toBe("Kohli walked in at 3 down");
  });

  it("does not split on abbreviations or decimals", () => {
    expect(takeSpeakable("Big names, e.g. Kohli, average 52.5 in finals. Wild", { first: false, final: false }).piece).toBe(
      "Big names, e.g. Kohli, average 52.5 in finals.",
    );
  });

  it("can break the first piece early at a comma so it starts talking sooner", () => {
    const long = "So here's the thing about that Olympic final in Paris, where France pushed the USA all the way";
    expect(takeSpeakable(long, { first: true, final: false }).piece).toBe("So here's the thing about that Olympic final in Paris,");
  });

  it("breaks a long first sentence at a comma so the voice starts sooner", () => {
    const text = "Dhoni's the name people reach for when it comes to finishing, and he's known for staying calm until the very last over. Then";
    expect(takeSpeakable(text, { first: true, final: false }).piece).toBe("Dhoni's the name people reach for when it comes to finishing,");
    // later pieces keep whole sentences
    expect(takeSpeakable(text, { first: false, final: false }).piece).toBe(
      "Dhoni's the name people reach for when it comes to finishing, and he's known for staying calm until the very last over.",
    );
  });

  it("gathers short sentences together after the first piece", () => {
    expect(takeSpeakable("Yes. He did. Twice! And then", { first: false, final: false }).piece).toBe("Yes. He did. Twice!");
  });

  it("does not wait on punctuation at the very end of the buffer", () => {
    expect(takeSpeakable("He scored 24.", { first: true, final: false }).piece).toBeNull();
  });

  it("cleans markdown, links and emoji for speech", () => {
    expect(forSpeech("**Curry** hit it 🔥 — see [this](https://x.y) or https://a.b/c")).toBe("Curry hit it — see this or");
  });

  it("ignores phantom words speech-to-text invents in silence", () => {
    expect(isPhantom("Thank you.")).toBe(true);
    expect(isPhantom("  ")).toBe(true);
    expect(isPhantom("Thank you, who won the final?")).toBe(false);
  });
});

describe("wav", () => {
  it("downsamples to a valid 16 kHz mono WAV", () => {
    const second = new Float32Array(48_000).map((_, i) => Math.sin(i / 10) * 0.5);
    const wav = encodeWav([second.slice(0, 24_000), second.slice(24_000)], 48_000);
    const v = new DataView(wav);
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe("RIFF");
    expect(v.getUint32(24, true)).toBe(16_000);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(40, true)).toBe(16_000 * 2); // one second of 16-bit samples
  });
});
