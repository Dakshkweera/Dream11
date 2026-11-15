import { describe, expect, it } from "vitest";
import { shouldSearchWeb } from "./routing";

const web = (message: string, extra: { knownEntityMentioned?: boolean; onMatchPage?: boolean } = {}) =>
  shouldSearchWeb({ message, knownEntityMentioned: false, ...extra });

describe("shouldSearchWeb", () => {
  it("looks up questions about other sports, other matches and news", () => {
    expect(web("Tell me about Lionel Messi.")).toBe(true);
    expect(web("Who won the Pro Kabaddi League last season?")).toBe(true);
    expect(web("Who won India vs Australia last night?")).toBe(true);
    expect(web("Tell me about the 2022 T20 World Cup final.")).toBe(true);
    expect(web("What's the latest news on the Premier League")).toBe(true);
    expect(web("Who is Hardik Pandya?")).toBe(true);
  });

  it("answers from the fact sheet when a known player, team or match is mentioned", () => {
    expect(web("Why does everyone love Dhoni?", { knownEntityMentioned: true })).toBe(false);
    expect(web("What happened in the 2019 final?", { knownEntityMentioned: true })).toBe(false);
  });

  it("does not look up jargon (a known concept), chit-chat, short follow-ups or questions about the fan", () => {
    expect(web("What's a yorker in cricket?", { knownEntityMentioned: true })).toBe(false);
    expect(web("What does a pick and roll mean exactly?", { knownEntityMentioned: true })).toBe(false);
    expect(web("thanks that was really helpful")).toBe(false);
    expect(web("why?")).toBe(false);
    expect(web("tell me more")).toBe(false);
    expect(web("What do you know about me?")).toBe(false);
  });

  it("does not treat statements as questions to search", () => {
    expect(web("I also love football and I follow Lionel Messi and Barcelona.")).toBe(false);
    expect(web("I'm not really into CSK, I just like Dhoni.")).toBe(false);
  });

  it("on a match page, 'who is that bowler' is about the screen, not the web", () => {
    expect(web("Who is that bowler who just came on?", { onMatchPage: true })).toBe(false);
    expect(web("Who won the Pro Kabaddi League last season?", { onMatchPage: true })).toBe(true);
  });
});
