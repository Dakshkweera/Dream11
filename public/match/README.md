# Match clips

The watch-along plays a clip from this folder. It must be served from the app itself (same origin) so the browser can capture its audio and frames.

| File | Match | Search YouTube for |
|---|---|---|
| **`clip-basketball.mp4`** (bundled demo) | Paris 2024 Olympic final, USA 98-87 France (Curry 24 points, the "Golden Dagger" three) | `USA vs France Paris 2024 Olympic final highlights` |
| `clip.mp4` (optional) | IPL 2026 final, RCB vs Gujarat Titans (RCB won by 5 wickets; Kohli 75* off 42, Player of the Match) | `RCB vs GT IPL 2026 final highlights` |
| `clip-2025.mp4` (optional) | IPL 2025 final, RCB vs Punjab Kings (RCB won by 6 runs; first title after 18 years) | `RCB vs PBKS IPL 2025 final highlights` |

Add one or both. A match without its file shows "clip not found" and everything else still works.

## Picking a clip
- Official IPL channel, **full highlights** of one match, **6–12 minutes**.
- **English commentary you can actually hear** (not just music). Transcription is set to English.
- Kohli on screen is a plus; the friend comments most on players the fan cares about.

## Download (from the `sports-friend` folder)
```bash
yt-dlp -f "bv*[height<=720]+ba/b[height<=720]" --merge-output-format mp4 -o "public/match/clip.mp4" "<youtube url>"
```
(needs `yt-dlp` and `ffmpeg`: `winget install yt-dlp.yt-dlp` and `winget install Gyan.FFmpeg`)

## Scoreboard (optional)
Highlights skip balls, so the ball-by-ball scoreboard can't line up with them. Skip `npm run import-match` for highlights; the friend still works from the commentary, the facts and the on-screen graphics. For a full-match clip, see the README.

## Saved commentary (optional fallback)
```bash
yt-dlp -x --audio-format mp3 -o commentary.mp3 "<youtube url>"
npm run pretranscribe -- commentary.mp3
```
Writes `public/match/transcript.json`, used automatically if live transcription fails. The audio must start where the video starts.
