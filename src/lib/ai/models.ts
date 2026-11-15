/**
 * Per-task model configuration. Every model is swappable via env var,
 * so changing a model never requires a code change.
 * Defaults were checked against the OpenRouter catalog on 2026-11-14.
 */
export const MODELS = {
  /** Story generation — needs strong narrative + structured JSON. */
  story: process.env.MODEL_STORY ?? "anthropic/claude-sonnet-5.5",
  /**
   * Conversational replies (streamed). Haiku: first word in ~1s vs 1-5s for Sonnet, with comparable
   * answers in side-by-side tests (npm run compare-models). Stories stay on Sonnet.
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
  /** Text-to-speech (/audio/speech). */
  tts: process.env.MODEL_TTS ?? "elevenlabs/eleven-flash-v2.5",
} as const;

export const TTS_VOICE = process.env.TTS_VOICE ?? "george";

export type ModelTask = keyof typeof MODELS;
