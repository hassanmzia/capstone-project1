import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  FlaskConical,
  HardDrive,
  Activity,
  SlidersHorizontal,
  BarChart3,
  Settings,
  Brain,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/experiments", label: "Experiments", icon: FlaskConical },
  { path: "/recordings", label: "Recordings", icon: HardDrive },
  { path: "/visualization", label: "Visualization", icon: Activity },
  { path: "/controls", label: "Controls", icon: SlidersHorizontal },
  { path: "/analysis", label: "Analysis", icon: BarChart3 },
  { path: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex flex-col bg-neural-surface border-r border-neural-border transition-all duration-300 ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-neural-border">
        <Brain className="w-7 h-7 text-neural-accent-cyan shrink-0" />
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight text-neural-text-primary whitespace-nowrap">
            CNEAv5
          </span>
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
              } ${collapsed ? "justify-center" : ""}`
            }
            title={collapsed ? label : undefined}
          >
            <Icon className="w-5 h-5 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-10 border-t border-neural-border text-neural-text-muted hover:text-neural-text-primary neural-transition"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  );
}
