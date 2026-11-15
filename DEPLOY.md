# Deploying to Vercel

## Before you deploy
- [ ] OpenRouter has credit, and a spending limit is set on the key (Settings → Keys).
- [ ] Facts reviewed: open `data/facts.json`, check each fact against its `source_url`, then set `"verified": true`.
      The UI labels unverified facts "awaiting human check" — flip them before showing evaluators.
- [ ] Match clip added at `public/match/clip.mp4`, and `npm run import-match` run for it (see README).
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` all pass.

## Environment variables (Vercel → Project → Settings → Environment Variables)
| Name | Value |
|---|---|
| `OPENROUTER_API_KEY` | your key (server-side only) |
| `DATABASE_URL` | Neon **pooled** connection string |
| `APP_URL` | your Vercel URL |
| `PREGENERATE_STORIES` | optional: `0` to save credit (turns off background story writing and pre-research) |
| `STORY_RESEARCH` | optional: `0` to skip the web-research step before stories |
| `WEB_SEARCH` | optional: `0` to turn off web lookups for questions outside the IPL data |

Do not set `DNS_SERVERS` on Vercel.

**Do not set `STORE=file` on Vercel.** The file store lives on local disk, which does not persist between requests there; without Postgres the friend would forget everything.

## Database
Run once. If your network blocks Neon's DNS, put `DNS_SERVERS=8.8.8.8` in `.env.local` first (the app and scripts then resolve Neon through Google DNS):

```bash
npm run db:setup   # creates the tables
npm run db:check   # proves storage works end to end on your real database (7 checks)
```

## Video size
The bundled demo clip (`clip-basketball.mp4`, Paris 2024 Olympic final highlights, ~33 MB) is broadcast footage you don't own: use it for the demo only, it is committed so the deployed site can play it, and be ready to swap it for a clip you have rights to.

Vercel limits deployed file size. Keep `clip.mp4` under ~100 MB (a 5-10 minute 720p clip is usually 30-80 MB). If it's larger, host it on Vercel Blob or similar and set `video` in `data/matches.json` to the URL — but the video must be **same-origin or CORS-enabled** or the browser will refuse to capture its audio and frames.

## After deploy: smoke-test the live URL
1. Open it on your phone. Onboard, ask a question, open a story.
2. Memory page: check memories appear, and persist after a refresh (this proves Postgres is working).
3. Match page: press play, wait ~20s, confirm "Listening to the commentary" and a heard line appear.
4. Ask "Why did this happen?" and confirm an answer.
5. Check OpenRouter's activity page for unexpected spend.

## Be aware
- Rate limits are per server instance and in memory — a guardrail, not a hard cap. The OpenRouter key limit is the real cap.
- Anyone with the link can use the app (anonymous cookie, no login). Don't put anything private in it.
