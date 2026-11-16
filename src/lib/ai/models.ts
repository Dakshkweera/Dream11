/**
 * Per-task model configuration. Every model is swappable via env var,
 * so changing a model never requires a code change.
 * Defaults were checked against the OpenRouter catalog on 2026-11-14.
 */
export const MODELS = {
  /**
   * Story generation: narrative + structured JSON + the fact check. Haiku is 20x cheaper than Sonnet ($0.10/$0.50
   * vs $2/$10 per million tokens) and passed the fact check on 3/3 test stories with the same excited style
   * (npx tsx scripts/story-models.ts). DeepSeek V4.1 Flash also passed but read like a list and took up to 60 s.
   * Set MODEL_STORY=anthropic/claude-sonnet-5.5 for the richest stories.
   */
  story: process.env.MODEL_STORY ?? "anthropic/claude-haiku-5.5",
  /**
   * Conversational replies (streamed). Haiku: first word in ~1s vs 1-5s for Sonnet, with comparable
   * answers in side-by-side tests (npm run compare-models).
   */
  chat: process.env.MODEL_CHAT ?? "anthropic/claude-haiku-5.5",
  /** Memory extraction — fast and cheap, structured JSON. */
  extract: process.env.MODEL_EXTRACT ?? "anthropic/claude-haiku-5.5",
  /** "Why did this happen?" — image input. */
  vision: process.env.MODEL_VISION ?? "google/gemini-3.8-flash",
  /** Fallback used when the primary text model fails or times out. */
  fallback: process.env.MODEL_FALLBACK ?? "google/gemini-3.8-flash",
  /** Commentary transcription (/audio/transcriptions). */
  stt: process.env.MODEL_STT ?? "openai/whisper-large-v3-turbo",
  /**
   * The fan talking to the friend. ~1 s per turn, steadier than Whisper in tests, and spells names
   * like "Buzzer" correctly.
   */
  sttConversation: process.env.MODEL_STT_CONVERSATION ?? "openai/gpt-4o-mini-transcribe",
  /**
   * Text-to-speech (/audio/speech). Gemini's Puck sounds the most like a real Indian friend in Hindi, Hinglish
   * and English, but takes ~2.5-3.5 s per line (the app hides that with quick spoken reactions). For speed,
   * microsoft/mai-voice-2.1-flash with en-IN-AaravNeural starts in ~0.5 s.
   */
  tts: process.env.MODEL_TTS ?? "google/gemini-3.8-flash-tts",
} as const;

/** An Indian voice for an Indian fan. Samples: voice-samples/. */
export const TTS_VOICE = process.env.TTS_VOICE ?? "Puck";

/** Some speech models only return raw PCM (24 kHz, 16-bit, mono); the app wraps it as WAV for the browser. */
export const pcmOnly = (model: string = MODELS.tts) => model.startsWith("google/") || model.startsWith("heygen/");

export type ModelTask = keyof typeof MODELS;

/** Indian English voices can't read Hindi script (they return empty audio); their Hindi counterparts can. */
const HINDI_VOICE: Record<string, string> = {
  "en-IN-AaravNeural": "hi-IN-MadhurNeural",
  "en-IN-PrabhatNeural": "hi-IN-MadhurNeural",
  "en-IN-NeerjaNeural": "hi-IN-SwaraNeural",
  "en-IN-AartiNeural": "hi-IN-SwaraNeural",
};

/** The voice to use for this text: Hindi script goes to the matching Hindi voice, everything else to the default. */
export function voiceFor(text: string, voice: string = TTS_VOICE): string {
  return /[ऀ-ॿ]/.test(text) ? (HINDI_VOICE[voice] ?? voice) : voice;
}
