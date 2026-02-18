import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import StatusBar from "./StatusBar";
import ChatPanel from "@/components/chat/ChatPanel";

export default function AppLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neural-bg">
      {/* Sidebar */}
      <Sidebar />

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        <Header />

        {/* Content */}
        <main className="flex-1 overflow-auto p-4">
          <Outlet />
        </main>

        <StatusBar />
      </div>

      {/* Chat Panel (slides from right) */}
      <ChatPanel />
    </div>
  );
}
