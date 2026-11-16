"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { BuzzerAvatar, BuzzerLogo } from "./buzzer-avatar";
import { IconBrain, IconCheck, IconMic, IconPlay, IconSparkles } from "./ui/icons";
import { useFriend } from "./friend-provider";

type Chip = { label: string; value: string };
type Sport = { id: string; label: string; emoji: string; follow: Chip[] };
type Level = "new" | "casual" | "regular" | "expert";
type Answer = { level: Level; follows: string[] };

const LEVELS: { id: Level; label: string; hint: string }[] = [
  { id: "new", label: "Totally new", hint: "Explain everything" },
  { id: "casual", label: "I know the basics", hint: "Explain the tricky bits" },
  { id: "regular", label: "I follow it regularly", hint: "Skip the basics" },
  { id: "expert", label: "I know it really well", hint: "Go deep" },
];

/**
 * First run, as its own screen: which sports, then for each sport how well you know it and who you follow.
 * Everything offered comes from the dataset; anything else can be typed.
 */
export function WelcomeView() {
  const router = useRouter();
  const { refreshState, say, setCtx } = useFriend();
  const [sports, setSports] = useState<Sport[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [typed, setTyped] = useState("");
  const [step, setStep] = useState(0); // 0 = which sports, 1.. = one step per picked sport
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setCtx({ surface: "home", label: "Welcome screen", entityIds: [] });
    api<{ sports: Sport[] }>("/api/catalog")
      .then((r) => setSports(r.sports))
      .catch(() => setErr("Couldn't load the sports list. Check your connection and refresh."));
  }, [setCtx]);

  const current = step > 0 ? sports.find((s) => s.id === picked[step - 1]) : undefined;
  const answer = (id: string): Answer => answers[id] ?? { level: "casual", follows: [] };
  // Updates read the latest state, so two quick taps never overwrite each other.
  const patch = (id: string, p: Partial<Answer> | ((a: Answer) => Partial<Answer>)) =>
    setAnswers((all) => {
      const a = all[id] ?? { level: "casual" as Level, follows: [] };
      return { ...all, [id]: { ...a, ...(typeof p === "function" ? p(a) : p) } };
    });

  const addOther = () => {
    const v = otherText.trim();
    if (v && other.length < 4 && !other.includes(v)) setOther([...other, v]);
    setOtherText("");
  };
  const addTyped = (id: string) => {
    const v = typed.trim();
    if (v) patch(id, (a) => (a.follows.length < 8 && !a.follows.includes(v) ? { follows: [...a.follows, v] } : {}));
    setTyped("");
  };

  async function finish() {
    setSaving(true);
    setErr("");
    try {
      const pending = otherText.trim();
      await api("/api/onboard", {
        sports: picked.map((id) => ({ sport: id, ...answer(id) })),
        other: pending && !other.includes(pending) ? [...other, pending] : other,
      });
      await refreshState();
      say("Done, I've got you! Ask me anything, tap Talk to chat out loud, or keep an eye on the home screen: I'll bring up things I think you'll love.");
      router.push("/");
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  }

  const total = picked.length + 1;
  const lastStep = step >= picked.length;
  const nothing = picked.length === 0 && other.length === 0 && !otherText.trim();
  const people = current
    ? [...current.follow, ...answer(current.id).follows.filter((f) => !current.follow.some((c) => c.value === f)).map((f) => ({ label: f, value: f }))]
    : [];

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <aside
        className="relative hidden flex-col justify-between overflow-hidden border-r border-line p-12 lg:flex xl:p-16"
        style={{
          background:
            "radial-gradient(90% 70% at 100% 0%, rgb(240 54 74 / 0.35), transparent 60%), radial-gradient(70% 60% at 0% 100%, rgb(255 122 61 / 0.16), transparent 60%), linear-gradient(160deg, #141927, #0a0d15)",
        }}
      >
        <div className="pitch-lines pointer-events-none absolute inset-0 opacity-40" aria-hidden />
        <div className="relative">
          <BuzzerLogo size={40} />
        </div>
        <div className="relative">
          <h2 className="font-display text-[56px] font-extrabold uppercase leading-[0.92] tracking-wide xl:text-[68px]">
            Your personal <span className="brand-text">sports friend</span>
          </h2>
          <ul className="mt-8 space-y-4 text-[16px] text-fg/85">
            {[
              { icon: <IconMic size={18} />, text: "Talk to it like a friend — out loud or by typing" },
              { icon: <IconBrain size={18} />, text: "It remembers what you follow and how much you know" },
              { icon: <IconSparkles size={18} />, text: "It finds the stories and rivalries you'll love" },
              { icon: <IconPlay size={16} />, text: "It watches along with you, beside the fan chat" },
            ].map((x) => (
              <li key={x.text} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-brand-2">{x.icon}</span>
                {x.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[12px] text-subtle">Independent prototype, not affiliated with Dream11.</p>
      </aside>
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 pb-6 pt-8 md:pt-14">
      {/* progress */}
      <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${total}`}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "brand-gradient" : "bg-surface-2"}`} />
        ))}
      </div>

      <div className="mt-8 flex items-center gap-3">
        <BuzzerAvatar size={52} />
        <div>
          <p className="text-[15px] font-semibold">Hey, I&apos;m Buzzer</p>
          <p className="text-[13px] text-muted">Your sports friend</p>
        </div>
      </div>

      {step === 0 && (
        <section className="anim-fade-in mt-8 flex-1">
          <h1 className="text-[26px] font-bold leading-tight">Which sports are you into?</h1>
          <p className="mt-2 text-muted">Pick as many as you like. I&apos;ll tell you the stories behind them.</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {sports.map((s) => {
              const on = picked.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))}
                  aria-pressed={on}
                  className={`card flex flex-col items-start gap-3 p-4 text-left transition-colors ${on ? "border-brand bg-brand/10" : "hover:border-muted/40"}`}
                >
                  <span className="text-3xl">{s.emoji}</span>
                  <span className="text-[16px] font-semibold">{s.label}</span>
                </button>
              );
            })}
            {other.map((o) => (
              <button
                key={o}
                onClick={() => setOther(other.filter((x) => x !== o))}
                aria-label={`Remove ${o}`}
                className="card flex flex-col items-start gap-3 border-brand bg-brand/10 p-4 text-left"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/20 text-brand-2"><IconCheck size={18} /></span>
                <span className="text-[16px] font-semibold">{o} <span className="text-muted">×</span></span>
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addOther();
            }}
            className="mt-4 flex gap-2"
          >
            <input value={otherText} onChange={(e) => setOtherText(e.target.value)} placeholder="Another sport? Type it" maxLength={40} className="field" />
            <button type="submit" className="btn-quiet px-5 text-sm">
              Add
            </button>
          </form>
        </section>
      )}

      {current && (
        <section key={current.id} className="anim-fade-in mt-8 flex-1 space-y-8">
          <div>
            <h1 className="text-[26px] font-bold leading-tight">
              How well do you know {current.label.toLowerCase()}?
            </h1>
            <div className="mt-5 grid gap-2.5">
              {LEVELS.map((l) => {
                const on = answer(current.id).level === l.id;
                return (
                  <button
                    key={l.id}
                    onClick={() => patch(current.id, { level: l.id })}
                    aria-pressed={on}
                    className={`card flex items-center justify-between px-4 py-3.5 text-left ${on ? "border-brand bg-brand/10" : ""}`}
                  >
                    <span className="font-medium">{l.label}</span>
                    <span className="text-[13px] text-muted">{l.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <h2 className="text-[18px] font-semibold">
              Who do you follow? <span className="text-[14px] font-normal text-muted">(optional)</span>
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {people.map((c) => (
                <button
                  key={c.value}
                  onClick={() => patch(current.id, (a) => ({ follows: a.follows.includes(c.value) ? a.follows.filter((x) => x !== c.value) : [...a.follows, c.value] }))}
                  aria-pressed={answer(current.id).follows.includes(c.value)}
                  className="chip"
                >
                  {c.label}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addTyped(current.id);
              }}
              className="mt-3 flex gap-2"
            >
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Someone not listed? Type a name" maxLength={60} className="field" />
              <button type="submit" className="btn-quiet px-5 text-sm">
                Add
              </button>
            </form>
          </div>
        </section>
      )}

      {err && <p className="mt-4 text-sm text-brand-2">{err}</p>}
      <div className="sticky bottom-4 mt-8 flex gap-2">
        {step > 0 && (
          <button onClick={() => setStep(step - 1)} className="btn-quiet h-14 px-6">
            Back
          </button>
        )}
        <button onClick={() => (lastStep ? finish() : setStep(step + 1))} disabled={saving} className="btn-primary h-14 flex-1 text-[16px]">
          {saving ? "Saving…" : nothing && step === 0 ? "Skip for now" : lastStep ? "Let's go" : "Next"}
        </button>
      </div>
    </main>
    </div>
  );
}
