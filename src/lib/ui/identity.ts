/**
 * Visual identity for teams and players: a short code, colours and initials, used for crests and avatars.
 * There are no team logos or player photos in the dataset, so identity comes from team colours instead.
 * Safe to import on the client (only the small entity and relation files are read).
 */
import entitiesJson from "../../../data/entities.json";
import relationsJson from "../../../data/relations.json";

type RawEntity = { id: string; type: string; name: string; aliases?: string[]; sport?: string; concept?: boolean; summary: string };
type RawRelation = { from: string; type: string; to: string };

const entities = new Map((entitiesJson as RawEntity[]).map((e) => [e.id, e]));
const playsFor = new Map(
  (relationsJson as RawRelation[]).filter((r) => r.type === "plays_for").map((r) => [r.from, r.to] as const),
);

/** Team colours: primary, secondary. Codes are the familiar broadcast abbreviations. */
const TEAMS: Record<string, { code: string; primary: string; secondary: string }> = {
  "team:rcb": { code: "RCB", primary: "#d11f2f", secondary: "#1b1b1f" },
  "team:csk": { code: "CSK", primary: "#f2c40d", secondary: "#1d4f9e" },
  "team:mi": { code: "MI", primary: "#0b4ea2", secondary: "#c9a43a" },
  "team:kkr": { code: "KKR", primary: "#3b2264", secondary: "#b89b2b" },
  "team:gt": { code: "GT", primary: "#1b2a4a", secondary: "#b8975a" },
  "team:pbks": { code: "PBKS", primary: "#d71920", secondary: "#9fa3a8" },
  "team:usa-basketball": { code: "USA", primary: "#0a3161", secondary: "#b31942" },
  "team:france-basketball": { code: "FRA", primary: "#0a2a8f", secondary: "#e2283b" },
};

export type Identity = {
  id: string;
  name: string;
  type: string;
  sport: string;
  /** Short code for teams ("RCB"), initials for everything else ("VK"). */
  code: string;
  initials: string;
  primary: string;
  secondary: string;
  /** The team a player plays for, if known. */
  teamId?: string;
  summary?: string;
};

function hashColour(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 45% 38%)`;
}

export function initialsOf(name: string): string {
  const parts = name
    .replace(/[^\p{L}\s.]/gu, "")
    .split(/[\s.]+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function teamIdentity(teamId: string): { code: string; primary: string; secondary: string } {
  const t = TEAMS[teamId];
  if (t) return t;
  const e = entities.get(teamId);
  const alias = e?.aliases?.find((a) => /^[A-Z]{2,5}$/.test(a));
  return { code: alias ?? initialsOf(e?.name ?? teamId), primary: hashColour(teamId), secondary: "#1b2130" };
}

/** Identity for any entity id; `fallbackName` covers players without an entity (squad-only names). */
export function identityOf(id: string | undefined, fallbackName = ""): Identity {
  const e = id ? entities.get(id) : undefined;
  const name = e?.name ?? fallbackName ?? id ?? "";
  const type = e?.type ?? (id?.split(":")[0] || "player");
  const sport = e?.sport ?? "cricket";
  if (type === "team" && id) {
    const t = teamIdentity(id);
    return { id, name, type, sport, code: t.code, initials: t.code, primary: t.primary, secondary: t.secondary, summary: e?.summary };
  }
  const teamId = id ? playsFor.get(id) : undefined;
  const team = teamId ? teamIdentity(teamId) : null;
  const initials = initialsOf(name);
  return {
    id: id ?? `name:${name}`,
    name,
    type,
    sport,
    code: initials,
    initials,
    primary: team?.primary ?? hashColour(name || "x"),
    secondary: team?.secondary ?? "#1b2130",
    teamId,
    summary: e?.summary,
  };
}

/** A familiar short name ("RCB", "Team USA") instead of the full official one. */
export function shortName(id: string): string {
  const e = entities.get(id);
  if (!e) return id;
  return e.aliases?.find((a) => a.length <= 12) ?? e.name;
}

export function sportLabel(sport: string): string {
  return sport ? sport[0].toUpperCase() + sport.slice(1) : "";
}
