import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, type RoleName } from "@/contexts/AuthContext";
import { Brain, LogIn, UserPlus, Eye, EyeOff, AlertCircle } from "lucide-react";

type Mode = "login" | "register";

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<RoleName>("Researcher");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Brief delay so the UI feels responsive
    setTimeout(() => {
      if (mode === "login") {
        const result = login(email, password);
        if (result.ok) {
          navigate("/", { replace: true });
        } else {
          setError(result.error ?? "Login failed");
        }
      } else {
        if (!name.trim()) { setError("Name is required"); setLoading(false); return; }
        if (!email.trim()) { setError("Email is required"); setLoading(false); return; }
        if (password.length < 6) { setError("Password must be at least 6 characters"); setLoading(false); return; }
        const result = register(name.trim(), email.trim(), password, role);
        if (result.ok) {
          navigate("/", { replace: true });
        } else {
          setError(result.error ?? "Registration failed");
        }
      }
      setLoading(false);
    }, 300);
  };

  const switchMode = () => {
    setMode((m) => (m === "login" ? "register" : "login"));
    setError(null);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neural-bg px-4">
      {/* Branding */}
      <div className="flex flex-col items-center mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neural-accent-cyan to-neural-accent-purple flex items-center justify-center">
            <Brain className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-neural-text-primary tracking-tight">CNEA</h1>
            <p className="text-xs text-neural-text-muted -mt-0.5">Cortical Neural Electrode Array</p>
          </div>
        </div>
        <p className="text-sm text-neural-text-secondary text-center max-w-sm">
          Neural recording, stimulation &amp; analysis platform
        </p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-neural-surface border border-neural-border rounded-2xl p-8 shadow-xl shadow-black/20">
        <h2 className="text-lg font-semibold text-neural-text-primary mb-1">
          {mode === "login" ? "Sign in to your account" : "Create a new account"}
        </h2>
        <p className="text-sm text-neural-text-muted mb-6">
          {mode === "login"
            ? "Enter your credentials to access the platform"
            : "Register to join the research team"}
        </p>

        {error && (
          <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-neural-accent-red/10 border border-neural-accent-red/30 text-neural-accent-red text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="block text-xs font-medium text-neural-text-secondary mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dr. Jane Smith"
                className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2.5 text-sm text-neural-text-primary placeholder:text-neural-text-muted/50 focus:outline-none focus:border-neural-accent-cyan focus:ring-1 focus:ring-neural-accent-cyan/30 neural-transition"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-neural-text-secondary mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@lab.edu"
              autoComplete="email"
              className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2.5 text-sm text-neural-text-primary placeholder:text-neural-text-muted/50 focus:outline-none focus:border-neural-accent-cyan focus:ring-1 focus:ring-neural-accent-cyan/30 neural-transition"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neural-text-secondary mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2.5 pr-10 text-sm text-neural-text-primary placeholder:text-neural-text-muted/50 focus:outline-none focus:border-neural-accent-cyan focus:ring-1 focus:ring-neural-accent-cyan/30 neural-transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neural-text-muted hover:text-neural-text-primary neural-transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {mode === "register" && (
            <div>
              <label className="block text-xs font-medium text-neural-text-secondary mb-1">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as RoleName)}
                className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2.5 text-sm text-neural-text-primary focus:outline-none focus:border-neural-accent-cyan focus:ring-1 focus:ring-neural-accent-cyan/30 neural-transition"
              >
                <option value="Researcher">Researcher</option>
                <option value="Operator">Operator</option>
                <option value="Viewer">Viewer</option>
              </select>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-neural-accent-cyan to-neural-accent-blue text-white hover:brightness-110 disabled:opacity-50 neural-transition"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : mode === "login" ? (
              <><LogIn className="w-4 h-4" /> Sign In</>
            ) : (
              <><UserPlus className="w-4 h-4" /> Create Account</>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button onClick={switchMode} className="text-sm text-neural-accent-cyan hover:text-neural-accent-blue neural-transition">
            {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>

        {mode === "login" && (
          <div className="mt-6 pt-4 border-t border-neural-border">
            <p className="text-xs text-neural-text-muted mb-2">Demo accounts:</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => { setEmail("chen@lab.edu"); setPassword("admin123"); }}
                className="px-2 py-1.5 rounded-lg bg-neural-surface-alt border border-neural-border text-neural-text-secondary hover:border-neural-accent-cyan/40 hover:text-neural-text-primary neural-transition text-left"
              >
                <span className="font-medium">Admin</span>
                <span className="block text-neural-text-muted">chen@lab.edu</span>
              </button>
              <button
                type="button"
                onClick={() => { setEmail("patel@lab.edu"); setPassword("research123"); }}
                className="px-2 py-1.5 rounded-lg bg-neural-surface-alt border border-neural-border text-neural-text-secondary hover:border-neural-accent-cyan/40 hover:text-neural-text-primary neural-transition text-left"
              >
                <span className="font-medium">Researcher</span>
                <span className="block text-neural-text-muted">patel@lab.edu</span>
              </button>
              <button
                type="button"
                onClick={() => { setEmail("tech@lab.edu"); setPassword("operator123"); }}
                className="px-2 py-1.5 rounded-lg bg-neural-surface-alt border border-neural-border text-neural-text-secondary hover:border-neural-accent-cyan/40 hover:text-neural-text-primary neural-transition text-left"
              >
                <span className="font-medium">Operator</span>
                <span className="block text-neural-text-muted">tech@lab.edu</span>
              </button>
              <button
                type="button"
                onClick={() => { setEmail("kim@lab.edu"); setPassword("research123"); }}
                className="px-2 py-1.5 rounded-lg bg-neural-surface-alt border border-neural-border text-neural-text-secondary hover:border-neural-accent-cyan/40 hover:text-neural-text-primary neural-transition text-left"
              >
                <span className="font-medium">Researcher</span>
                <span className="block text-neural-text-muted">kim@lab.edu</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-6 text-xs text-neural-text-muted">
        CNEA Platform v2.0 &middot; Secure Neural Research Environment
      </p>
    </div>
  );
}
