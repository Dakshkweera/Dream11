import { FriendPanel } from "@/components/friend-panel";
import { FriendProvider } from "@/components/friend-provider";
import { AppShell } from "@/components/shell/app-shell";
import { VoiceProvider } from "@/components/voice/voice-provider";

/** The app: navigation, the one Buzzer conversation and voice, on every screen. The landing page sits outside it. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <FriendProvider>
      <VoiceProvider>
        <AppShell>{children}</AppShell>
        <FriendPanel />
      </VoiceProvider>
    </FriendProvider>
  );
}
