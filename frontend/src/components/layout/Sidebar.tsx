import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FlaskConical,
  HardDrive,
  Activity,
  SlidersHorizontal,
  BarChart3,
  FileText,
  Settings,
  Brain,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/experiments", label: "Experiments", icon: FlaskConical },
  { path: "/recordings", label: "Recordings", icon: HardDrive },
  { path: "/visualization", label: "Visualization", icon: Activity },
  { path: "/controls", label: "Controls", icon: SlidersHorizontal },
  { path: "/analysis", label: "Analysis", icon: BarChart3 },
  { path: "/reports", label: "Reports", icon: FileText },
  { path: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  // Close mobile menu on route change
  useEffect(() => {
    onMobileClose?.();
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const navContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-neural-border shrink-0">
        <Brain className="w-7 h-7 text-neural-accent-cyan shrink-0" />
        {(!collapsed || mobileOpen) && (
          <span className="text-lg font-bold tracking-tight text-neural-text-primary whitespace-nowrap">
            CNEAv5
          </span>
        )}
        {/* Mobile close button */}
        {mobileOpen && (
          <button
            onClick={onMobileClose}
            className="ml-auto p-1 rounded-lg text-neural-text-muted hover:text-neural-text-primary hover:bg-neural-surface-alt md:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 space-y-1 px-2 overflow-y-auto">
        {navItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium neural-transition ${
                isActive
                  ? "bg-neural-accent-cyan/10 text-neural-accent-cyan neural-glow-cyan"
                  : "text-neural-text-secondary hover:text-neural-text-primary hover:bg-neural-surface-alt"
              } ${collapsed && !mobileOpen ? "justify-center" : ""}`
            }
            title={collapsed && !mobileOpen ? label : undefined}
          >
            <Icon className="w-5 h-5 shrink-0" />
            {(!collapsed || mobileOpen) && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle (desktop only) */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden md:flex items-center justify-center h-10 border-t border-neural-border text-neural-text-muted hover:text-neural-text-primary neural-transition"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col bg-neural-surface border-r border-neural-border transition-all duration-300 ${
          collapsed ? "w-16" : "w-56"
        }`}
      >
        {navContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40 md:hidden"
            onClick={onMobileClose}
          />
          <aside className="fixed inset-y-0 left-0 w-64 z-50 flex flex-col bg-neural-surface border-r border-neural-border md:hidden">
            {navContent}
          </aside>
        </>
      )}
    </>
  );
}
