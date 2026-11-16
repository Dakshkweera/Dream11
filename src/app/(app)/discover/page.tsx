import { DiscoverView } from "@/components/discover-view";
import { discoverCatalog } from "@/lib/discover/catalog";

export const metadata = { title: "Discover — Buzzer" };

export default function DiscoverPage() {
  const { sports, items, rivalries } = discoverCatalog();
  return <DiscoverView sports={sports} items={items} rivalries={rivalries} />;
}
