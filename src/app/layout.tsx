import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/bottom-nav";
import { FriendPanel } from "@/components/friend-panel";
import { FriendProvider } from "@/components/friend-provider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Saathi — your sports friend",
  description: "A personal AI sports friend that learns what you care about and shows you the stories behind it.",
};

export const viewport: Viewport = { themeColor: "#0b0b10", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full">
        <FriendProvider>
          <div className="app-frame pb-20">
            {children}
            <BottomNav />
          </div>
          <FriendPanel />
        </FriendProvider>
      </body>
    </html>
  );
}
