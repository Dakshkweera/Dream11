/**
 * Decides, in code, when a chat question should be answered from a web lookup instead of the IPL fact sheet.
 * A lookup is slow (~4s) and costs about a cent, so it only happens for real questions the fact sheet can't cover.
 */

const ASKS =
  /^\s*(who|what|whats|what's|when|where|which|how|tell me|explain|give me|show me|latest|any news|did|does|is|are|was|were|has|have|can you tell)\b/i;
const NEWS = /\b(latest|news|score|scores|result|results|won|winner|champion|champions|standings|table|fixture|fixtures|schedule|transfer|record)\b/i;
/** Questions about the fan or the app itself. */
const SELF = /\b(about me|know about me|remember me|my memory|my team|my picks|who are you|what can you do)\b/i;
const CHITCHAT = /^\s*(thanks|thank you|ok|okay|cool|nice|great|got it|hi|hello|hey|lol|wow)\b/i;
/** On a match page, "who is that bowler" refers to what's on screen, not the wider web. */
const DEICTIC = /\b(this|that|these|those|he|him|his|she|her|they|just|now|here)\b/i;

export function shouldSearchWeb(opts: { message: string; knownEntityMentioned: boolean; onMatchPage?: boolean }): boolean {
  const m = opts.message.trim();
  if (m.length < 12 || m.split(/\s+/).length < 4) return false; // short follow-ups and chit-chat
  if (opts.knownEntityMentioned) return false; // the fact sheet covers it
  // (Jargon questions never reach here: concept topics are entities, so they count as a known entity above.)
  if (SELF.test(m) || CHITCHAT.test(m)) return false;
  if (opts.onMatchPage && DEICTIC.test(m)) return false;
  return ASKS.test(m) || /\?\s*$/.test(m) || NEWS.test(m);
}
