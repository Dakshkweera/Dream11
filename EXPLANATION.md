<!-- DRAFT for the Dream11 submission. Edit freely. Limit: 200 words, checked by `npm run words`.
     Before submitting: confirm every claim against what you have actually tested, and replace [FINDING]
     with one real result from watching 3-5 casual fans use it (about 25 words). -->

**Problem.** Casual fans follow one player or team but miss the stories, rivalries and history that make a sport compelling. Context exists, but only those who already care look.

**Hypothesis.** If an AI friend starts from what a fan already cares about, such as a fantasy pick, and leads them outward to rivals, teammates and history, their interest widens and they follow more.

**Solution.** Buzzer is a personal sports friend inside a Dream11-style app. It surfaces one relevant thing at a time, not a feed. An excited storyteller writes from checked facts and live web research, with sources and "go deeper" threads. During a real match clip (Olympic basketball final) it listens to the commentary, and when asked "why did this happen?" it looks at the last few seconds.

**Design.** The model writes; code decides what to surface, how memory merges and what counts as grounded. Memory separates what fans said from what it noticed, fades, and is editable. [FINDING]

**AI tools.** OpenRouter: Claude Sonnet (stories, chat), Claude Haiku (memory), Gemini (vision), Whisper (commentary), text-to-speech.
