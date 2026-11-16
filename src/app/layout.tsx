import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Geist } from "next/font/google";
import "./globals.css";
import { FriendPanel } from "@/components/friend-panel";
import { FriendProvider } from "@/components/friend-provider";
import { AppShell } from "@/components/shell/app-shell";
import { VoiceProvider } from "@/components/voice/voice-provider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
/** Condensed display face for scores, team codes and big headlines. */
const display = Barlow_Condensed({ variable: "--font-display", subsets: ["latin"], weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: "Buzzer — your sports friend",
  description: "A personal AI sports friend that learns what you care about and shows you the stories behind it.",
};

export const viewport: Viewport = { themeColor: "#07090f", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full">
        <FriendProvider>
          <VoiceProvider>
            <AppShell>{children}</AppShell>
            <FriendPanel />
          </VoiceProvider>
        </FriendProvider>
      </body>
    </html>
  );
}
