import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Buzzer — your personal AI sports friend",
  description:
    "Don't just watch sports. Feel the story. Buzzer is a personal AI sports friend: talk to it, discover the stories behind the players, watch along with context, and let it get to know you.",
};

/** The public landing page. The app itself starts at /home. */
export default function Landing() {
  return <LandingPage />;
}
