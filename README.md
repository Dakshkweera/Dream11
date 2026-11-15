# Buzzer — a personal AI sports friend (Dream11-inspired prototype)

A friend inside a fantasy-sports app that learns what you already care about and pulls you into the wider sport:
grounded stories, rivalries and history, explained at your level, with memory that evolves as you do.

> Independent prototype inspired by fantasy-sports apps. Not affiliated with Dream11.

## What it does
- **Friend on every screen** (floating button): natural chat, onboarding, explanations adapted to your knowledge level.
- **Excited, grounded stories**: code retrieves the hand-checked facts, a research step searches the web for more (labelled "found on the web"), and the storyteller writes from both. A fact check rejects any number not in a cited fact. Every story shows its sources and ends with "Go deeper" threads. Research is cached for everyone for 6 hours; about 2 cents per new topic. `STORY_RESEARCH=0` turns it off.
- **Evolving memory**: stated vs inferred, evidence counts, decay, corrections. Visible and editable on the "What Buzzer knows" page. The knowledge level rises as you learn concepts, and your fantasy picks shape what Buzzer brings up.
- **Proactive discovery**: code scores the frontier of your interests (rivals, teammates…) and brings up one thing per surface per session. Suggestion chips are chosen the same way, from your memory and the page you are on.
- **Answers beyond the fact sheet**: the IPL fact sheet is verified and shown with sources. For anything else (other sports, other matches, latest news) the friend does a web lookup, labels the answer "From the web" and links its sources. About 1.5–3 cents and 5–9 seconds per lookup; limited to 10 per user per 10 minutes. `WEB_SEARCH=0` turns it off, and then it says honestly that it can't check.
- **Watch-along**: plays a real match clip, transcribes the commentary audio continuously, comments at moments that matter to you, and — only when you ask "Why did this happen?" — looks at 3–4 frames from the last ~8 seconds.

## Run it
```bash
npm install
cp .env.example .env.local     # add OPENROUTER_API_KEY (and DATABASE_URL for Postgres)
npm run dev
```
- `STORE=file` in `.env.local` uses a local JSON store (`.data/`) instead of Postgres. Leave it off to use Neon (`npm run db:setup` first).
- If your network blocks Neon's DNS, set `DNS_SERVERS=8.8.8.8` in `.env.local` (local dev only; not needed on Vercel).
- `npm run db:check` runs the storage contract against your real Postgres; the same checks run against the file store in `npm test`.
- `WEB_SEARCH=0` disables web lookups (they cost about 1.5–3 cents each).
- `PREGENERATE_STORIES=0` turns off writing the story behind each nudge in the background (it costs one extra AI call per nudge shown).
- `npm run smoke` checks every OpenRouter capability (chat, JSON, vision, speech, transcription).
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
- `npm run story-check` generates stories with the live model and reports whether each stayed grounded.
- `npm run import-match -- <cricsheet.json> <matchId> --sync "15.1=12,19.6=540"` fills a match's squads, season and scoreboard timeline from Cricsheet ball-by-ball data.
- `npm run pretranscribe -- commentary.mp3` saves the commentary as a fallback if live transcription fails.
- `npm run compare-models -- <modelA> <modelB>` shows two models answering the same fan questions side by side (quality and speed).
- `npm run profile-chat` times each step before the first word of a chat reply, against your real database.
- `AI_EFFORT=minimal|low|medium|high` sets how hard models think before answering (default `low`; these models think by default, which made replies several seconds slower and could use up the token limit).
- `npm run words` checks the submission explanation (`EXPLANATION.md`) against the 200-word limit.

See `DEPLOY.md` for the deployment checklist.

## Models (all via OpenRouter, swappable in `.env.local`)
See `src/lib/ai/models.ts` — stories use Claude Sonnet; chat and memory extraction use Claude Haiku (faster, similar answers); vision uses Gemini; plus transcription, speech and a fallback.

## Match clip
See `public/match/README.md`. Timeline data (`data/matches.json` → `timeline`) is optional; without it the friend relies on commentary + facts.

## Design rule
The LLM writes; code decides — what to retrieve, what to bring up, how memory merges, rate limits, grounding.

## Data
`data/` holds entities, relations and facts (with source URLs). Facts are marked `verified: false` until a human checks them against the source.
