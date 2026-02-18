import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

/* ── Types shared with Settings Users & Roles ── */
export type RoleName = "Admin" | "Researcher" | "Operator" | "Viewer";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: RoleName;
  status: "active" | "inactive" | "locked";
}

interface RegisterResult {
  ok: boolean;
  error?: string;
  pendingVerification?: boolean;
  /** Displayed in the UI so the user can "check their email" (demo only) */
  verificationCode?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => { ok: boolean; error?: string };
  register: (name: string, email: string, password: string, inviteCode?: string) => RegisterResult;
  verifyEmail: (email: string, code: string) => { ok: boolean; error?: string };
  resendVerification: (email: string) => { ok: boolean; error?: string; verificationCode?: string };
  logout: () => void;
  updateProfile: (updates: Partial<Pick<AuthUser, "name" | "email">>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/* ── Credential store (localStorage, demo-grade) ── */
interface StoredAccount {
  id: string;
  name: string;
  email: string;
  password: string;
  role: RoleName;
  status: "active" | "inactive" | "locked" | "pending";
}

interface PendingVerification {
  email: string;
  code: string;
  expiresAt: number;
}

const ACCOUNTS_KEY = "cnea_accounts";
const SESSION_KEY = "cnea_session";
const VERIFICATION_KEY = "cnea_pending_verifications";

function loadAccounts(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  // Seed with default users that match the Settings page
  const seed: StoredAccount[] = [
    { id: "u-1", name: "Dr. Chen", email: "chen@lab.edu", password: "admin123", role: "Admin", status: "active" },
    { id: "u-2", name: "Dr. Patel", email: "patel@lab.edu", password: "research123", role: "Researcher", status: "active" },
    { id: "u-3", name: "Dr. Kim", email: "kim@lab.edu", password: "research123", role: "Researcher", status: "active" },
    { id: "u-4", name: "Dr. Martinez", email: "martinez@lab.edu", password: "research123", role: "Researcher", status: "inactive" },
    { id: "u-5", name: "Lab Tech", email: "tech@lab.edu", password: "operator123", role: "Operator", status: "active" },
  ];
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(seed));
  return seed;
}

function saveAccounts(accounts: StoredAccount[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function loadSession(): AuthUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function saveSession(user: AuthUser | null) {
  if (user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    localStorage.setItem("auth_token", `demo-jwt-${user.id}`);
  } else {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem("auth_token");
  }
}

/* ── Verification helpers ── */
function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
}

function loadVerifications(): PendingVerification[] {
  try {
    const raw = localStorage.getItem(VERIFICATION_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveVerifications(verifications: PendingVerification[]) {
  localStorage.setItem(VERIFICATION_KEY, JSON.stringify(verifications));
}

function upsertVerification(email: string): string {
  const code = generateCode();
  const verifications = loadVerifications().filter(
    (v) => v.email.toLowerCase() !== email.toLowerCase(),
  );
  verifications.push({
    email: email.toLowerCase(),
    code,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  });
  saveVerifications(verifications);
  return code;
}

function checkVerification(email: string, code: string): { ok: boolean; error?: string } {
  const verifications = loadVerifications();
  const entry = verifications.find((v) => v.email.toLowerCase() === email.toLowerCase());
  if (!entry) return { ok: false, error: "No verification pending for this email" };
  if (Date.now() > entry.expiresAt) return { ok: false, error: "Verification code has expired. Please resend." };
  if (entry.code !== code) return { ok: false, error: "Incorrect verification code" };
  // Remove used verification
  saveVerifications(verifications.filter((v) => v.email.toLowerCase() !== email.toLowerCase()));
  return { ok: true };
}

/* ── Provider ── */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadSession);

  // Sync user list in cnea_users (Settings page reads this)
  const syncUsersToSettings = useCallback((accounts: StoredAccount[]) => {
    // Only sync active accounts to Settings page (not pending)
    const settingsUsers = accounts
      .filter((a) => a.status !== "pending")
      .map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        email: a.email,
        lastActive: "—",
        status: a.status as "active" | "inactive" | "locked",
        permissions: [] as string[],
      }));
    localStorage.setItem("cnea_users", JSON.stringify(settingsUsers));
  }, []);

  const login = useCallback((email: string, password: string): { ok: boolean; error?: string } => {
    const accounts = loadAccounts();
    const account = accounts.find((a) => a.email.toLowerCase() === email.toLowerCase());
    if (!account) return { ok: false, error: "No account found with that email" };
    if (account.status === "pending") return { ok: false, error: "Email not verified. Please check your email for the verification code." };
    if (account.status === "locked") return { ok: false, error: "Account is locked. Contact an administrator." };
    if (account.status === "inactive") return { ok: false, error: "Account is inactive. Contact an administrator." };
    if (account.password !== password) return { ok: false, error: "Incorrect password" };

    const authUser: AuthUser = {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
      status: account.status,
    };
    saveSession(authUser);
    setUser(authUser);
    return { ok: true };
  }, []);

  const register = useCallback((name: string, email: string, password: string, inviteCode?: string): RegisterResult => {
    const accounts = loadAccounts();
    const existing = accounts.find((a) => a.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      if (existing.status === "pending") {
        return { ok: false, error: "An account with that email is pending verification. Please check your email or resend the code." };
      }
      return { ok: false, error: "An account with that email already exists" };
    }

    // Admin invite code validation
    const ADMIN_INVITE_CODE = "CNEA-ADMIN-2025";
    let role: RoleName = "Researcher";
    if (inviteCode) {
      if (inviteCode === ADMIN_INVITE_CODE) {
        role = "Admin";
      } else {
        return { ok: false, error: "Invalid admin invite code" };
      }
    }

    // Create account in pending state
    const newAccount: StoredAccount = {
      id: `u-${Date.now()}`,
      name,
      email,
      password,
      role,
      status: "pending",
    };
    const updated = [...accounts, newAccount];
    saveAccounts(updated);

    // Generate verification code
    const code = upsertVerification(email);

    return { ok: true, pendingVerification: true, verificationCode: code };
  }, []);

  const verifyEmail = useCallback((email: string, code: string): { ok: boolean; error?: string } => {
    const result = checkVerification(email, code);
    if (!result.ok) return result;

    // Activate account
    const accounts = loadAccounts();
    const idx = accounts.findIndex((a) => a.email.toLowerCase() === email.toLowerCase());
    if (idx < 0) return { ok: false, error: "Account not found" };

    accounts[idx].status = "active";
    saveAccounts(accounts);
    syncUsersToSettings(accounts);

    // Auto-login after verification
    const account = accounts[idx];
    const authUser: AuthUser = {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
      status: "active",
    };
    saveSession(authUser);
    setUser(authUser);
    return { ok: true };
  }, [syncUsersToSettings]);

  const resendVerification = useCallback((email: string): { ok: boolean; error?: string; verificationCode?: string } => {
    const accounts = loadAccounts();
    const account = accounts.find((a) => a.email.toLowerCase() === email.toLowerCase());
    if (!account) return { ok: false, error: "No account found with that email" };
    if (account.status !== "pending") return { ok: false, error: "Account is already verified" };
    const code = upsertVerification(email);
    return { ok: true, verificationCode: code };
  }, []);

  const logout = useCallback(() => {
    saveSession(null);
    setUser(null);
  }, []);

  const updateProfile = useCallback((updates: Partial<Pick<AuthUser, "name" | "email">>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      saveSession(updated);
      const accounts = loadAccounts();
      const idx = accounts.findIndex((a) => a.id === updated.id);
      if (idx >= 0) {
        accounts[idx] = { ...accounts[idx], ...updates };
        saveAccounts(accounts);
        syncUsersToSettings(accounts);
      }
      return updated;
    });
  }, [syncUsersToSettings]);

  // On first mount, ensure seed accounts exist
  useEffect(() => { loadAccounts(); }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, register, verifyEmail, resendVerification, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
