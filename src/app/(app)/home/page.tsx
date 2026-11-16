import { HomeView } from "@/components/home-view";
import { discoverCatalog } from "@/lib/discover/catalog";
import { allMatches } from "@/lib/match/data";
import { summarize } from "@/lib/match/view";

export const metadata = { title: "Home — Buzzer" };

/** The app's home screen. ("/" is the public landing page that introduces Buzzer.) */
export default function Home() {
  const { items, rivalries } = discoverCatalog();
  return <HomeView matches={allMatches().map(summarize)} discover={items} rivalries={rivalries} />;
}
