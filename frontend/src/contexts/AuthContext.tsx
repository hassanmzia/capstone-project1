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

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => { ok: boolean; error?: string };
  register: (name: string, email: string, password: string, role?: RoleName) => { ok: boolean; error?: string };
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
  status: "active" | "inactive" | "locked";
}

const ACCOUNTS_KEY = "cnea_accounts";
const SESSION_KEY = "cnea_session";

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

/* ── Provider ── */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadSession);

  // Sync user list in cnea_users (Settings page reads this)
  const syncUsersToSettings = useCallback((accounts: StoredAccount[]) => {
    const settingsUsers = accounts.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      email: a.email,
      lastActive: "—",
      status: a.status,
      permissions: [] as string[], // Settings page will apply role defaults
    }));
    localStorage.setItem("cnea_users", JSON.stringify(settingsUsers));
  }, []);

  const login = useCallback((email: string, password: string): { ok: boolean; error?: string } => {
    const accounts = loadAccounts();
    const account = accounts.find((a) => a.email.toLowerCase() === email.toLowerCase());
    if (!account) return { ok: false, error: "No account found with that email" };
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

  const register = useCallback((name: string, email: string, password: string, role: RoleName = "Researcher"): { ok: boolean; error?: string } => {
    const accounts = loadAccounts();
    if (accounts.some((a) => a.email.toLowerCase() === email.toLowerCase())) {
      return { ok: false, error: "An account with that email already exists" };
    }
    const newAccount: StoredAccount = {
      id: `u-${Date.now()}`,
      name,
      email,
      password,
      role,
      status: "active",
    };
    const updated = [...accounts, newAccount];
    saveAccounts(updated);
    syncUsersToSettings(updated);

    const authUser: AuthUser = {
      id: newAccount.id,
      name: newAccount.name,
      email: newAccount.email,
      role: newAccount.role,
      status: newAccount.status,
    };
    saveSession(authUser);
    setUser(authUser);
    return { ok: true };
  }, [syncUsersToSettings]);

  const logout = useCallback(() => {
    saveSession(null);
    setUser(null);
  }, []);

  const updateProfile = useCallback((updates: Partial<Pick<AuthUser, "name" | "email">>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      saveSession(updated);
      // Also update accounts store
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
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
