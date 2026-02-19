import { useState, useRef, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import type { RootState } from "@/store";
import { togglePanel } from "@/store/slices/chatSlice";
import { useAuth } from "@/contexts/AuthContext";
import {
  Circle,
  Wifi,
  WifiOff,
  MessageSquare,
  Clock,
  Zap,
  LogOut,
  Settings,
  ChevronDown,
  Shield,
  Menu,
} from "lucide-react";
import NotificationPanel from "@/components/notifications/NotificationPanel";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

interface HeaderProps {
  onMenuToggle?: () => void;
}

export default function Header({ onMenuToggle }: HeaderProps) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { isRecording, status, duration, spikeCount } = useSelector(
    (state: RootState) => state.recording
  );
  const { isPanelOpen } = useSelector((state: RootState) => state.chat);
  const agents = useSelector((state: RootState) => state.agents.agents);
  const allOnline = agents.every((a) => a.status === "online");

  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [profileOpen]);

  const handleLogout = () => {
    setProfileOpen(false);
    logout();
    navigate("/login", { replace: true });
  };

  const roleColor: Record<string, string> = {
    Admin: "text-neural-accent-red",
    Researcher: "text-neural-accent-cyan",
    Operator: "text-neural-accent-amber",
    Viewer: "text-neural-text-muted",
  };

  return (
    <header className="flex items-center justify-between h-12 md:h-14 px-2 md:px-4 bg-neural-surface border-b border-neural-border">
      {/* Left: Hamburger (mobile) + System Info */}
      <div className="flex items-center gap-2 md:gap-6">
        {/* Mobile hamburger */}
        <button
          onClick={onMenuToggle}
          className="p-1.5 rounded-lg text-neural-text-secondary hover:text-neural-text-primary hover:bg-neural-surface-alt md:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Connection status */}
        <div className="flex items-center gap-1.5 md:gap-2 text-sm">
          {allOnline ? (
            <Wifi className="w-4 h-4 text-neural-accent-green" />
          ) : (
            <WifiOff className="w-4 h-4 text-neural-accent-red" />
          )}
          <span className={`hidden sm:inline ${allOnline ? "text-neural-accent-green" : "text-neural-accent-red"}`}>
            {allOnline ? "Connected" : "Degraded"}
          </span>
        </div>

        {/* FPGA status (hidden on small screens) */}
        <div className="hidden md:flex items-center gap-2 text-sm text-neural-text-secondary">
          <Zap className="w-4 h-4 text-neural-accent-amber" />
          <span>FPGA Ready</span>
        </div>
      </div>

      {/* Center: Recording Status */}
      <div className="flex items-center gap-2 md:gap-4">
        {isRecording && (
          <>
            <div className="flex items-center gap-1.5 md:gap-2">
              <Circle
                className="w-2.5 md:w-3 h-2.5 md:h-3 text-neural-accent-red fill-neural-accent-red animate-neural-pulse"
              />
              <span className="text-xs md:text-sm font-semibold text-neural-accent-red uppercase tracking-wider">
                {status === "paused" ? "Paused" : "REC"}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs md:text-sm text-neural-text-secondary">
              <Clock className="w-3 md:w-3.5 h-3 md:h-3.5" />
              <span className="font-mono">{formatDuration(duration)}</span>
            </div>
            <div className="hidden sm:block text-sm text-neural-text-secondary">
              <span className="font-mono text-neural-accent-cyan">{spikeCount.toLocaleString()}</span>
              <span className="ml-1 hidden md:inline">spikes</span>
            </div>
          </>
        )}
        {!isRecording && (
          <span className="text-xs md:text-sm text-neural-text-muted hidden sm:inline">No active recording</span>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1 md:gap-3">
        <NotificationPanel />

        <button
          onClick={() => dispatch(togglePanel())}
          className={`flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 rounded-lg text-sm neural-transition ${
            isPanelOpen
              ? "bg-neural-accent-purple/20 text-neural-accent-purple"
              : "text-neural-text-secondary hover:text-neural-text-primary hover:bg-neural-surface-alt"
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span className="hidden lg:inline">Assistant</span>
        </button>

        <div className="w-px h-6 bg-neural-border hidden md:block" />

        {/* Profile dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setProfileOpen((o) => !o)}
            className="flex items-center gap-1.5 md:gap-2 px-1.5 md:px-3 py-1.5 rounded-lg text-sm text-neural-text-secondary hover:text-neural-text-primary hover:bg-neural-surface-alt neural-transition"
          >
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-neural-accent-cyan to-neural-accent-purple flex items-center justify-center">
              <span className="text-xs font-bold text-white">
                {user?.name?.charAt(0)?.toUpperCase() ?? "?"}
              </span>
            </div>
            <span className="hidden lg:inline max-w-[120px] truncate">{user?.name ?? "User"}</span>
            <ChevronDown className="w-3 h-3 hidden lg:block" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-full mt-1 w-64 bg-neural-surface border border-neural-border rounded-xl shadow-xl shadow-black/30 z-50 overflow-hidden">
              {/* User info */}
              <div className="px-4 py-3 border-b border-neural-border">
                <p className="text-sm font-medium text-neural-text-primary">{user?.name}</p>
                <p className="text-xs text-neural-text-muted">{user?.email}</p>
                <div className="flex items-center gap-1 mt-1">
                  <Shield className="w-3 h-3" />
                  <span className={`text-xs font-medium ${roleColor[user?.role ?? "Viewer"]}`}>
                    {user?.role}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="py-1">
                <button
                  onClick={() => { setProfileOpen(false); navigate("/settings"); }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-neural-text-secondary hover:text-neural-text-primary hover:bg-neural-surface-alt neural-transition"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-neural-accent-red hover:bg-neural-accent-red/10 neural-transition"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
