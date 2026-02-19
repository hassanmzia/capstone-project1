import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Brain, LogIn, UserPlus, Eye, EyeOff, AlertCircle, Key, Mail, ArrowLeft, RefreshCw, CheckCircle2 } from "lucide-react";

type Mode = "login" | "register" | "verify";

export default function LoginPage() {
  const { login, register, verifyEmail, resendVerification } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Verification state
  const [verifyCode, setVerifyCode] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    setTimeout(() => {
      if (mode === "login") {
        const result = login(email, password);
        if (result.ok) {
          navigate("/", { replace: true });
        } else {
          setError(result.error ?? "Login failed");
        }
      } else if (mode === "register") {
        if (!name.trim()) { setError("Name is required"); setLoading(false); return; }
        if (!email.trim()) { setError("Email is required"); setLoading(false); return; }
        if (password.length < 6) { setError("Password must be at least 6 characters"); setLoading(false); return; }
        const result = register(name.trim(), email.trim(), password, inviteCode.trim() || undefined);
        if (result.ok && result.pendingVerification) {
          setPendingEmail(email.trim());
          setDemoCode(result.verificationCode ?? null);
          setVerifyCode("");
          setMode("verify");
        } else if (!result.ok) {
          setError(result.error ?? "Registration failed");
        }
      } else if (mode === "verify") {
        if (verifyCode.length !== 6) { setError("Please enter the 6-digit code"); setLoading(false); return; }
        const result = verifyEmail(pendingEmail, verifyCode);
        if (result.ok) {
          navigate("/", { replace: true });
        } else {
          setError(result.error ?? "Verification failed");
        }
      }
      setLoading(false);
    }, 300);
  };

  const handleResend = () => {
    setResending(true);
    setError(null);
    setTimeout(() => {
      const result = resendVerification(pendingEmail);
      if (result.ok) {
        setDemoCode(result.verificationCode ?? null);
      } else {
        setError(result.error ?? "Could not resend code");
      }
      setResending(false);
    }, 500);
  };

  const switchMode = () => {
    if (mode === "verify") {
      setMode("register");
    } else {
      setMode((m) => (m === "login" ? "register" : "login"));
    }
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
      <div className="w-full max-w-md bg-neural-surface border border-neural-border rounded-2xl p-4 md:p-8 shadow-xl shadow-black/20 mx-2 md:mx-0">

        {/* ── Verify Email Step ── */}
        {mode === "verify" && (
          <>
            <div className="flex items-center gap-2 mb-1">
              <Mail className="w-5 h-5 text-neural-accent-cyan" />
              <h2 className="text-lg font-semibold text-neural-text-primary">Verify your email</h2>
            </div>
            <p className="text-sm text-neural-text-muted mb-4">
              We sent a 6-digit verification code to <span className="font-medium text-neural-text-secondary">{pendingEmail}</span>
            </p>

            {/* Demo: show the code since there's no real email service */}
            {demoCode && (
              <div className="mb-4 p-3 rounded-lg bg-neural-accent-cyan/10 border border-neural-accent-cyan/30">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-neural-accent-cyan" />
                  <span className="text-xs font-medium text-neural-accent-cyan">Demo: Simulated Email</span>
                </div>
                <p className="text-xs text-neural-text-secondary">
                  Your verification code is: <span className="font-mono font-bold text-neural-text-primary text-sm tracking-widest">{demoCode}</span>
                </p>
                <p className="text-[10px] text-neural-text-muted mt-1">
                  In production this would be sent to your email address.
                </p>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-neural-accent-red/10 border border-neural-accent-red/30 text-neural-accent-red text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neural-text-secondary mb-1">Verification Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  autoFocus
                  className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2.5 text-center text-lg font-mono tracking-[0.3em] text-neural-text-primary placeholder:text-neural-text-muted/50 placeholder:tracking-normal placeholder:text-sm focus:outline-none focus:border-neural-accent-cyan focus:ring-1 focus:ring-neural-accent-cyan/30 neural-transition"
                />
              </div>

              <button
                type="submit"
                disabled={loading || verifyCode.length !== 6}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-neural-accent-cyan to-neural-accent-blue text-white hover:brightness-110 disabled:opacity-50 neural-transition"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <><CheckCircle2 className="w-4 h-4" /> Verify &amp; Sign In</>
                )}
              </button>
            </form>

            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={switchMode}
                className="flex items-center gap-1 text-xs text-neural-text-muted hover:text-neural-text-primary neural-transition"
              >
                <ArrowLeft className="w-3 h-3" /> Back to registration
              </button>
              <button
                onClick={handleResend}
                disabled={resending}
                className="flex items-center gap-1 text-xs text-neural-accent-cyan hover:text-neural-accent-blue neural-transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${resending ? "animate-spin" : ""}`} />
                {resending ? "Sending..." : "Resend code"}
              </button>
            </div>
          </>
        )}

        {/* ── Login / Register Steps ── */}
        {mode !== "verify" && (
          <>
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
                  <label className="block text-xs font-medium text-neural-text-secondary mb-1">
                    <span className="flex items-center gap-1">
                      <Key className="w-3 h-3" />
                      Admin Invite Code
                      <span className="text-neural-text-muted font-normal">(optional)</span>
                    </span>
                  </label>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Leave blank to register as Researcher"
                    className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2.5 text-sm text-neural-text-primary placeholder:text-neural-text-muted/50 focus:outline-none focus:border-neural-accent-cyan focus:ring-1 focus:ring-neural-accent-cyan/30 neural-transition"
                  />
                  <p className="text-[11px] text-neural-text-muted mt-1">
                    Enter an admin invite code to register as Admin. Without a code you will be registered as a Researcher.
                  </p>
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
          </>
        )}
      </div>

      <p className="mt-6 text-xs text-neural-text-muted">
        CNEA Platform v2.0 &middot; Secure Neural Research Environment
      </p>
    </div>
  );
}
