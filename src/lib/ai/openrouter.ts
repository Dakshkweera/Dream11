/**
 * Single OpenRouter client. Every AI call in the app goes through here:
 * chat, streamed chat, structured JSON, vision, transcription and speech.
 * The API key is read on the server only and never sent to the browser.
 */
import { toJSONSchema, type z } from "zod";
import { MODELS, TTS_VOICE, pcmOnly } from "./models";

const BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT_MS = 45_000;

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
};

export class AIError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "AIError";
  }
}

function apiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new AIError("OPENROUTER_API_KEY is not set");
  return key;
}

function headers(json = true): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey()}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
    "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
    "X-Title": "Sports Friend Prototype",
  };
}

const MAX_RETRIES = 2;
const RETRYABLE = new Set([429, 502, 503]);

async function post(path: string, body: unknown, timeoutMs = DEFAULT_TIMEOUT_MS, signal?: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    });
    if (res.ok) return res;

    const text = await res.text().catch(() => "");
    if (RETRYABLE.has(res.status) && attempt < MAX_RETRIES) {
      // Honour Retry-After (seconds), capped so a user never waits too long.
      const retryAfter = Number(res.headers.get("retry-after")) || 2 ** attempt;
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 10) * 1000));
      continue;
    }
    throw new AIError(`OpenRouter ${path} failed (${res.status})`, res.status, text.slice(0, 2000));
  }
}

type ChatOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Try MODELS.fallback once if the primary model errors. Default true. */
  fallback?: boolean;
  /**
   * How hard the model thinks before answering. These models think by default (Sonnet cannot turn it
   * off), which costs seconds and eats the token limit. "low" cut Sonnet's first word from ~5s to ~1s.
   */
  effort?: "none" | "minimal" | "low" | "medium" | "high";
  /**
   * Route to whichever provider is answering fastest right now. In tests the default routing sometimes took
   * ~3 s to the first word where the fastest provider took ~0.8 s; this matters for spoken conversation.
   */
  fastest?: boolean;
  /** Cancels the request (used to drop the slower of two hedged requests). */
  signal?: AbortSignal;
};

/**
 * Hedged request: run `make`; if it hasn't succeeded within `afterMs`, start a second copy and take whichever
 * succeeds first, cancelling the other. Providers occasionally stall for seconds on one request while an
 * identical one returns in under a second; in a spoken conversation that stall is what feels unnatural.
 * If the first attempt fails outright, the second starts immediately.
 */
export function hedge<T>(make: (signal: AbortSignal, attempt: number) => Promise<T>, afterMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const ctrls: AbortController[] = [];
    let settled = false;
    let failed = 0;
    const launch = () => {
      const i = ctrls.length;
      const ctrl = new AbortController();
      ctrls.push(ctrl);
      make(ctrl.signal, i).then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          ctrls.forEach((c, j) => j !== i && c.abort());
          resolve(value);
        },
        (err) => {
          if (settled) return;
          failed++;
          if (ctrls.length < 2) {
            clearTimeout(timer);
            launch();
          } else if (failed >= ctrls.length) {
            settled = true;
            reject(err);
          }
        },
      );
    };
    launch();
    // Callbacks above run asynchronously, after this line, so they always see the timer.
    const timer = setTimeout(() => !settled && ctrls.length < 2 && launch(), afterMs);
  });
}

const DEFAULT_EFFORT = (process.env.AI_EFFORT as ChatOptions["effort"]) ?? "low";

/**
 * "none" switches thinking off. Spoken replies use it: even at "minimal", Haiku sometimes thought silently
 * for 3-5 s and then sent the whole reply at once; with thinking off the first word came in under a second.
 */
function reasoningFor(effort: ChatOptions["effort"]) {
  const e = effort ?? DEFAULT_EFFORT;
  return e === "none" ? { enabled: false } : { effort: e };
}

type ChatCompletion = {
  choices: { message: { content: string | null }; finish_reason?: string }[];
};

async function completion(
  messages: ChatMessage[],
  opts: ChatOptions & { responseFormat?: unknown },
): Promise<string> {
  const run = async (model: string, maxTokens = opts.maxTokens ?? 1500): Promise<string> => {
    const res = await post("/chat/completions", {
      model,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: maxTokens,
      reasoning: reasoningFor(opts.effort),
      ...(opts.responseFormat ? { response_format: opts.responseFormat } : {}),
    });
    const data = (await res.json()) as ChatCompletion;
    const choice = data.choices?.[0];
    if (!choice?.message?.content) {
      // The model spent its whole allowance thinking: try once more with room to answer.
      if (choice?.finish_reason === "length" && maxTokens < 6000) return run(model, Math.min(maxTokens * 2, 6000));
      throw new AIError(`Empty response from ${model}`);
    }
    return choice.message.content;
  };

  const primary = opts.model ?? MODELS.chat;
  try {
    return await run(primary);
  } catch (err) {
    if (opts.fallback === false || primary === MODELS.fallback) throw err;
    console.warn(`[ai] ${primary} failed, falling back to ${MODELS.fallback}:`, (err as Error).message);
    return run(MODELS.fallback);
  }
}

/** Plain text chat completion. */
export function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  return completion(messages, opts);
}

/**
 * Structured output: asks the model for JSON matching `schema`, validates it
 * with zod, and retries once (feeding back the validation error) on failure.
 */
export async function json<T>(
  messages: ChatMessage[],
  schema: z.ZodType<T>,
  opts: ChatOptions & { schemaName?: string } = {},
): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { $schema, ...jsonSchema } = toJSONSchema(schema) as Record<string, unknown>;
  const responseFormat = {
    type: "json_schema",
    json_schema: {
      name: opts.schemaName ?? "response",
      strict: true,
      schema: jsonSchema,
    },
  };

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const msgs: ChatMessage[] = lastError
      ? [...messages, { role: "user", content: `Your previous output was invalid: ${lastError}. Return only valid JSON matching the schema.` }]
      : messages;
    const raw = await completion(msgs, { ...opts, temperature: opts.temperature ?? 0.4, responseFormat });
    try {
      const parsed = schema.safeParse(JSON.parse(stripFences(raw)));
      if (parsed.success) return parsed.data;
      lastError = parsed.error.message.slice(0, 500);
    } catch (e) {
      lastError = `not JSON (${(e as Error).message})`;
    }
  }
  throw new AIError(`Structured output failed validation: ${lastError}`);
}

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
}

/**
 * Streamed chat. Returns an async iterable of text deltas.
 * Route handlers can pipe this straight into a streaming Response.
 */
export async function* chatStream(
  messages: ChatMessage[],
  opts: ChatOptions = {},
): AsyncGenerator<string> {
  const res = await post(
    "/chat/completions",
    {
      model: opts.model ?? MODELS.chat,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 1500,
      reasoning: reasoningFor(opts.effort),
      ...(opts.fastest ? { provider: { sort: "latency" } } : {}),
      stream: true,
    },
    90_000,
    opts.signal,
  );
  if (!res.body) throw new AIError("No stream body");

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      // OpenRouter sends ": OPENROUTER PROCESSING" keep-alive comments.
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const evt = JSON.parse(payload);
        const delta = evt.choices?.[0]?.delta?.content;
        if (delta) yield delta as string;
      } catch {
        // partial / non-JSON line — ignore
      }
    }
  }
}

/** Vision: text prompt plus a handful of images (data URLs or https URLs). */
export function vision(
  system: string,
  prompt: string,
  imageUrls: string[],
  opts: ChatOptions = {},
): Promise<string> {
  const content: ContentPart[] = [
    { type: "text", text: prompt },
    ...imageUrls.map((url) => ({ type: "image_url" as const, image_url: { url } })),
  ];
  return completion(
    [
      { role: "system", content: system },
      { role: "user", content },
    ],
    { ...opts, model: opts.model ?? MODELS.vision },
  );
}

export type TranscriptSegment = { start: number; end: number; text: string };
export type Transcript = { text: string; segments: TranscriptSegment[] };

/**
 * Speech-to-text via the dedicated /audio/transcriptions endpoint.
 * `audio` is the raw file bytes; `format` e.g. "webm" | "mp3" | "wav".
 */
export async function transcribe(
  audio: ArrayBuffer | Buffer,
  format: string,
  opts: { model?: string; language?: string; prompt?: string; timestamps?: boolean; signal?: AbortSignal } = {},
): Promise<Transcript> {
  const data = Buffer.from(audio as ArrayBuffer).toString("base64");
  const res = await post(
    "/audio/transcriptions",
    {
      model: opts.model ?? MODELS.stt,
      input_audio: { data, format },
      language: opts.language ?? "en",
      ...(opts.prompt ? { prompt: opts.prompt } : {}),
      ...(opts.timestamps ? { response_format: "verbose_json" } : {}),
    },
    60_000,
    opts.signal,
  );
  const body = (await res.json()) as {
    text?: string;
    segments?: { start: number; end: number; text: string }[];
  };
  return {
    text: (body.text ?? "").trim(),
    segments: (body.segments ?? []).map((s) => ({ start: s.start, end: s.end, text: s.text.trim() })),
  };
}

/** Text-to-speech via /audio/speech. Returns MP3 bytes. */
export async function speak(
  text: string,
  opts: { model?: string; voice?: string } = {},
): Promise<ArrayBuffer> {
  const res = await post(
    "/audio/speech",
    {
      model: opts.model ?? MODELS.tts,
      input: text,
      voice: opts.voice ?? TTS_VOICE,
      response_format: "mp3",
    },
    60_000,
  );
  return res.arrayBuffer();
}

/** Wrap raw 16-bit mono PCM in a WAV header so any browser can play it. */
export function pcmToWav(pcm: Uint8Array, rate = 24_000): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(44 + pcm.byteLength));
  const v = new DataView(out.buffer);
  const str = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + pcm.byteLength, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, pcm.byteLength, true);
  out.set(pcm, 44);
  return out;
}

/**
 * Speech in whatever form the model gives it: MP3 streamed as it arrives, or (PCM-only models such as Gemini)
 * the whole clip as WAV.
 */
export async function speakAudio(
  text: string,
  opts: { model?: string; voice?: string; signal?: AbortSignal } = {},
): Promise<{ body: ReadableStream<Uint8Array> | Uint8Array<ArrayBuffer>; type: string }> {
  const model = opts.model ?? MODELS.tts;
  if (!pcmOnly(model)) return { body: await speakStream(text, opts), type: "audio/mpeg" };
  const res = await post("/audio/speech", { model, input: text, voice: opts.voice ?? TTS_VOICE, response_format: "pcm" }, 60_000, opts.signal);
  const pcm = new Uint8Array(await res.arrayBuffer());
  if (!pcm.byteLength) throw new AIError("OpenRouter /audio/speech returned no audio", 502, "");
  return { body: pcmToWav(pcm), type: "audio/wav" };
}

/** Same as speak(), but returns the audio as a stream so the first bytes reach the browser sooner. */
export async function speakStream(
  text: string,
  opts: { model?: string; voice?: string; signal?: AbortSignal } = {},
): Promise<ReadableStream<Uint8Array>> {
  const res = await post(
    "/audio/speech",
    { model: opts.model ?? MODELS.tts, input: text, voice: opts.voice ?? TTS_VOICE, response_format: "mp3" },
    60_000,
    opts.signal,
  );
  if (!res.body) throw new AIError("OpenRouter /audio/speech returned no audio", 502, "");
  return res.body;
}

// ---------------------------------------------------------------------------
// Web lookup (OpenRouter's web-search plugin): answers questions outside the fact sheet, with sources.
// Costs roughly 1 cent per lookup, so callers rate-limit it.
// ---------------------------------------------------------------------------

export type WebSource = { title: string; url: string };
type Annotation = { type?: string; url_citation?: { url?: string; title?: string } };

/** Turn OpenRouter's citation annotations into a short, de-duplicated list of readable sources. */
export function sourcesFrom(annotations: Annotation[] | undefined, max = 4): WebSource[] {
  const seen = new Set<string>();
  const out: WebSource[] = [];
  for (const a of annotations ?? []) {
    const c = a.type === "url_citation" ? a.url_citation : undefined;
    if (!c?.url || seen.has(c.url)) continue;
    let host: string;
    try {
      const u = new URL(c.url);
      if (u.protocol !== "https:" && u.protocol !== "http:") continue; // never render javascript: or data: links
      host = u.hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    seen.add(c.url);
    out.push({ title: (c.title ?? "").trim().slice(0, 90) || host, url: c.url });
    if (out.length >= max) break;
  }
  return out;
}

export async function chatWithWeb(
  messages: ChatMessage[],
  opts: ChatOptions & { maxResults?: number } = {},
): Promise<{ text: string; sources: WebSource[] }> {
  const res = await post(
    "/chat/completions",
    {
      model: opts.model ?? MODELS.chat,
      messages,
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens ?? 2000,
      reasoning: reasoningFor(opts.effort),
      // engine is pinned: the default silently picks a provider whose search often returns nothing (measured 2/9 vs 9/9).
      plugins: [{ id: "web", engine: "exa", max_results: opts.maxResults ?? 4 }],
    },
    90_000,
  );
  const data = (await res.json()) as { choices?: { message?: { content?: string | null; annotations?: Annotation[] } }[] };
  const msg = data.choices?.[0]?.message;
  if (!msg?.content) throw new AIError("Empty web answer");
  return { text: msg.content, sources: sourcesFrom(msg.annotations) };
}

/**
 * One call that searches the web AND returns validated JSON (used for research). Retries once on bad output.
 * Returns the sources the search found, so each extracted item can be tied back to a real page.
 */
export async function jsonWithWeb<T>(
  messages: ChatMessage[],
  schema: z.ZodType<T>,
  opts: ChatOptions & { schemaName?: string; maxResults?: number } = {},
): Promise<{ data: T; sources: WebSource[] }> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { $schema, ...jsonSchema } = toJSONSchema(schema) as Record<string, unknown>;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await post(
      "/chat/completions",
      {
        model: opts.model ?? MODELS.extract,
        messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 3000,
        reasoning: reasoningFor(opts.effort),
        response_format: { type: "json_schema", json_schema: { name: opts.schemaName ?? "response", strict: true, schema: jsonSchema } },
        plugins: [{ id: "web", engine: "exa", max_results: opts.maxResults ?? 6 }],
      },
      90_000,
    );
    const data = (await res.json()) as { choices?: { message?: { content?: string | null; annotations?: Annotation[] } }[] };
    const msg = data.choices?.[0]?.message;
    if (!msg?.content) continue;
    try {
      const parsed = schema.safeParse(JSON.parse(stripFences(msg.content)));
      if (parsed.success) return { data: parsed.data, sources: sourcesFrom(msg.annotations, 8) };
    } catch {
      /* try once more */
    }
  }
  throw new AIError("Web research returned invalid output");
}
