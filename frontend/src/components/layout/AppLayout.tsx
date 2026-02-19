import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import StatusBar from "./StatusBar";
import ChatPanel from "@/components/chat/ChatPanel";
import { RecordingSessionProvider } from "@/contexts/RecordingSessionContext";

export default function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <RecordingSessionProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-neural-bg">
        {/* Sidebar */}
        <Sidebar
          mobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
        />

        {/* Main area */}
        <div className="flex flex-col flex-1 min-w-0">
          <Header onMenuToggle={() => setMobileMenuOpen((o) => !o)} />

          {/* Content */}
          <main className="flex-1 overflow-auto p-2 md:p-4">
            <Outlet />
          </main>

          <StatusBar />
        </div>

        {/* Chat Panel (slides from right) */}
        <ChatPanel />
      </div>
    </RecordingSessionProvider>
  );
}
