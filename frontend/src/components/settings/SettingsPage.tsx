import { useState, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Settings,
  HardDrive,
  Users,
  Cpu,
  Brain,
  Save,
  Plus,
  Trash2,
  Edit3,
  Shield,
  Globe,
  Database,
  Check,
  X,
  Eye,
  EyeOff,
  Lock,
  Key,
  UserCheck,
} from "lucide-react";

const settingsTabs = [
  { id: "presets", label: "Hardware Presets", icon: HardDrive },
  { id: "users", label: "Users & Roles", icon: Users },
  { id: "agents", label: "Agent Config", icon: Cpu },
  { id: "llm", label: "LLM Settings", icon: Brain },
  { id: "system", label: "System", icon: Settings },
] as const;

type SettingsTab = (typeof settingsTabs)[number]["id"];

/* ── Provider / model mapping ── */
type ProviderKey = "anthropic" | "openai" | "ollama";

const PROVIDERS: { key: ProviderKey; label: string; placeholder: string }[] = [
  { key: "anthropic", label: "Anthropic (Claude)", placeholder: "sk-ant-..." },
  { key: "openai", label: "OpenAI (GPT)", placeholder: "sk-..." },
  { key: "ollama", label: "Local (Ollama)", placeholder: "http://localhost:11434" },
];

const MODELS_BY_PROVIDER: Record<ProviderKey, string[]> = {
  anthropic: [
    "claude-opus-4-20250514",
    "claude-sonnet-4-20250514",
    "claude-haiku-4-20250514",
    "claude-3.5-sonnet-20241022",
    "claude-3.5-haiku-20241022",
  ],
  openai: [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-4",
    "gpt-3.5-turbo",
    "o1-preview",
    "o1-mini",
  ],
  ollama: [
    "llama3.1:70b",
    "llama3.1:8b",
    "mistral:7b",
    "codellama:34b",
    "mixtral:8x7b",
    "phi-3:medium",
  ],
};

/* ── LLM settings shape ── */
interface LLMSettings {
  provider: ProviderKey;
  model: string;
  apiKey: string;
  temperature: number;
  systemPrompt: string;
}

const DEFAULT_LLM: LLMSettings = {
  provider: "anthropic",
  model: "claude-opus-4-20250514",
  apiKey: "",
  temperature: 0.3,
  systemPrompt:
    "You are a neural engineering assistant for the CNEAv5 system. Help researchers configure hardware, manage experiments, and analyze neural data.",
};

function loadLLMSettings(): LLMSettings {
  try {
    const raw = localStorage.getItem("cnea_llm_settings");
    if (raw) return { ...DEFAULT_LLM, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_LLM };
}

/* ── Agent config shape ── */
interface AgentConfig {
  id: string;
  label: string;
  heartbeat: number;
  maxMemory: number;
  logLevel: "debug" | "info" | "warn" | "error";
}

const DEFAULT_AGENTS: AgentConfig[] = [
  { id: "hardware-agent", label: "Hardware Agent", heartbeat: 5000, maxMemory: 2048, logLevel: "info" },
  { id: "recording-agent", label: "Recording Agent", heartbeat: 5000, maxMemory: 2048, logLevel: "info" },
  { id: "analysis-agent", label: "Analysis Agent", heartbeat: 5000, maxMemory: 2048, logLevel: "info" },
  { id: "llm-agent", label: "LLM Agent", heartbeat: 5000, maxMemory: 2048, logLevel: "info" },
  { id: "storage-agent", label: "Storage Agent", heartbeat: 5000, maxMemory: 2048, logLevel: "info" },
];

function loadAgentConfigs(): AgentConfig[] {
  try {
    const raw = localStorage.getItem("cnea_agent_configs");
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return DEFAULT_AGENTS.map((a) => ({ ...a }));
}

/* ── Preset shape (with real hardware config) ── */
type GainMode = "low" | "medium" | "high" | "ultra";

interface PresetHardware {
  sampleRateKhz: number;
  gainMode: GainMode;
  tiaGain: number;
  tiaBandwidthHz: number;
  filterOrder: number;
  cutoffFreqHz: number;
  arrayRows: number;
  arrayCols: number;
  stimEnabled: boolean;
  stimWaveform: "biphasic" | "monophasic" | "sine" | "custom";
  stimAmplitudeUa: number;
  stimFreqHz: number;
  masterClockMhz: number;
}

interface Preset {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  createdBy: string;
  hardware: PresetHardware;
}

const DEFAULT_HW: PresetHardware = {
  sampleRateKhz: 30,
  gainMode: "high",
  tiaGain: 1000,
  tiaBandwidthHz: 10000,
  filterOrder: 2,
  cutoffFreqHz: 5000,
  arrayRows: 64,
  arrayCols: 64,
  stimEnabled: false,
  stimWaveform: "biphasic",
  stimAmplitudeUa: 10,
  stimFreqHz: 100,
  masterClockMhz: 50,
};

const DEFAULT_PRESETS: Preset[] = [
  {
    id: "p-1", name: "Default", description: "Standard 30kHz recording configuration", isDefault: true, createdBy: "System",
    hardware: { ...DEFAULT_HW },
  },
  {
    id: "p-2", name: "High Density", description: "64x64 full array, high gain, reduced bandwidth", isDefault: false, createdBy: "Dr. Chen",
    hardware: { ...DEFAULT_HW, gainMode: "ultra", tiaGain: 5000, tiaBandwidthHz: 5000, cutoffFreqHz: 3000 },
  },
  {
    id: "p-3", name: "Low Noise", description: "Optimized for low-noise cortical recordings", isDefault: false, createdBy: "Dr. Patel",
    hardware: { ...DEFAULT_HW, sampleRateKhz: 20, gainMode: "medium", tiaGain: 500, filterOrder: 4, cutoffFreqHz: 3000 },
  },
  {
    id: "p-4", name: "Stimulation", description: "Closed-loop stimulation with biphasic pulses", isDefault: false, createdBy: "Dr. Kim",
    hardware: { ...DEFAULT_HW, stimEnabled: true, stimAmplitudeUa: 50, stimFreqHz: 200, stimWaveform: "biphasic" },
  },
];

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem("cnea_presets");
    if (raw) {
      const parsed: Preset[] = JSON.parse(raw);
      // Migrate presets saved before the hardware field existed
      return parsed.map((p) => ({
        ...p,
        hardware: p.hardware ? { ...DEFAULT_HW, ...p.hardware } : { ...DEFAULT_HW },
      }));
    }
  } catch { /* ignore */ }
  return DEFAULT_PRESETS.map((p) => ({ ...p, hardware: { ...p.hardware } }));
}

function savePresets(presets: Preset[]) {
  localStorage.setItem("cnea_presets", JSON.stringify(presets));
}

/* ── User / RBAC shapes ── */
type RoleName = "Admin" | "Researcher" | "Operator" | "Viewer";

type Permission =
  | "hardware:read" | "hardware:write"
  | "recording:start" | "recording:stop" | "recording:export"
  | "analysis:run" | "analysis:configure"
  | "users:manage"
  | "settings:edit"
  | "llm:use";

const ALL_PERMISSIONS: { key: Permission; label: string; group: string }[] = [
  { key: "hardware:read", label: "View Hardware", group: "Hardware" },
  { key: "hardware:write", label: "Configure Hardware", group: "Hardware" },
  { key: "recording:start", label: "Start Recording", group: "Recording" },
  { key: "recording:stop", label: "Stop Recording", group: "Recording" },
  { key: "recording:export", label: "Export Data", group: "Recording" },
  { key: "analysis:run", label: "Run Analysis", group: "Analysis" },
  { key: "analysis:configure", label: "Configure Pipelines", group: "Analysis" },
  { key: "users:manage", label: "Manage Users", group: "Admin" },
  { key: "settings:edit", label: "Edit Settings", group: "Admin" },
  { key: "llm:use", label: "Use AI Assistant", group: "AI" },
];

const ROLE_DEFAULTS: Record<RoleName, Permission[]> = {
  Admin: ALL_PERMISSIONS.map((p) => p.key),
  Researcher: [
    "hardware:read", "hardware:write",
    "recording:start", "recording:stop", "recording:export",
    "analysis:run", "analysis:configure",
    "llm:use",
  ],
  Operator: [
    "hardware:read", "hardware:write",
    "recording:start", "recording:stop",
    "llm:use",
  ],
  Viewer: ["hardware:read", "llm:use"],
};

const ROLES: RoleName[] = ["Admin", "Researcher", "Operator", "Viewer"];

interface UserEntry {
  id: string;
  name: string;
  role: RoleName;
  email: string;
  lastActive: string;
  status: "active" | "inactive" | "locked";
  permissions: Permission[];
}

interface AuthSettings {
  method: "jwt" | "oauth2" | "ldap";
  sessionTimeout: number; // hours
  mfaEnabled: boolean;
  maxLoginAttempts: number;
  lockoutDuration: number; // minutes
}

const DEFAULT_AUTH: AuthSettings = {
  method: "jwt",
  sessionTimeout: 8,
  mfaEnabled: false,
  maxLoginAttempts: 5,
  lockoutDuration: 15,
};

function loadAuth(): AuthSettings {
  try {
    const raw = localStorage.getItem("cnea_auth");
    if (raw) return { ...DEFAULT_AUTH, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_AUTH };
}

const DEFAULT_USERS: UserEntry[] = [
  { id: "u-1", name: "Dr. Chen", role: "Admin", email: "chen@lab.edu", lastActive: "2 min ago", status: "active", permissions: ROLE_DEFAULTS["Admin"] },
  { id: "u-2", name: "Dr. Patel", role: "Researcher", email: "patel@lab.edu", lastActive: "1 hr ago", status: "active", permissions: ROLE_DEFAULTS["Researcher"] },
  { id: "u-3", name: "Dr. Kim", role: "Researcher", email: "kim@lab.edu", lastActive: "3 hr ago", status: "active", permissions: ROLE_DEFAULTS["Researcher"] },
  { id: "u-4", name: "Dr. Martinez", role: "Researcher", email: "martinez@lab.edu", lastActive: "1 day ago", status: "inactive", permissions: ROLE_DEFAULTS["Researcher"] },
  { id: "u-5", name: "Lab Tech", role: "Operator", email: "tech@lab.edu", lastActive: "5 hr ago", status: "active", permissions: ROLE_DEFAULTS["Operator"] },
];

function loadUsers(): UserEntry[] {
  try {
    const raw = localStorage.getItem("cnea_users");
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return DEFAULT_USERS.map((u) => ({ ...u, permissions: [...u.permissions] }));
}

function saveUsers(users: UserEntry[]) {
  localStorage.setItem("cnea_users", JSON.stringify(users));
}

const LOG_LEVELS: AgentConfig["logLevel"][] = ["debug", "info", "warn", "error"];

export default function SettingsPage() {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>("presets");
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [users, setUsers] = useState<UserEntry[]>(loadUsers);
  const [editingPreset, setEditingPreset] = useState<string | null>(null);
  const [presetDraft, setPresetDraft] = useState<Preset | null>(null);
  const [presetSaved, setPresetSaved] = useState<string | null>(null);

  /* ── User state ── */
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [userDraft, setUserDraft] = useState<UserEntry | null>(null);
  const [userSaved, setUserSaved] = useState<string | null>(null);

  /* ── Auth state ── */
  const [auth, setAuth] = useState<AuthSettings>(loadAuth);
  const [authSaved, setAuthSaved] = useState(false);

  /* ── LLM state ── */
  const [llm, setLlm] = useState<LLMSettings>(loadLLMSettings);
  const [showApiKey, setShowApiKey] = useState(false);
  const [llmSaved, setLlmSaved] = useState(false);

  const providerModels = useMemo(() => MODELS_BY_PROVIDER[llm.provider], [llm.provider]);

  // When provider changes, reset model to first in list
  const handleProviderChange = useCallback((key: ProviderKey) => {
    setLlm((prev) => ({
      ...prev,
      provider: key,
      model: MODELS_BY_PROVIDER[key][0],
      apiKey: key !== prev.provider ? "" : prev.apiKey,
    }));
    setLlmSaved(false);
  }, []);

  const handleSaveLLM = useCallback(() => {
    localStorage.setItem("cnea_llm_settings", JSON.stringify(llm));
    setLlmSaved(true);
    setTimeout(() => setLlmSaved(false), 2500);
  }, [llm]);

  /* ── Agent config state ── */
  const [agents, setAgents] = useState<AgentConfig[]>(loadAgentConfigs);
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [agentDraft, setAgentDraft] = useState<AgentConfig | null>(null);
  const [agentSaved, setAgentSaved] = useState<string | null>(null);

  const handleEditAgent = useCallback((agent: AgentConfig) => {
    setEditingAgent(agent.id);
    setAgentDraft({ ...agent });
  }, []);

  const handleCancelAgent = useCallback(() => {
    setEditingAgent(null);
    setAgentDraft(null);
  }, []);

  const handleSaveAgent = useCallback(() => {
    if (!agentDraft) return;
    setAgents((prev) => {
      const updated = prev.map((a) => (a.id === agentDraft.id ? { ...agentDraft } : a));
      localStorage.setItem("cnea_agent_configs", JSON.stringify(updated));
      return updated;
    });
    setAgentSaved(agentDraft.id);
    setTimeout(() => setAgentSaved(null), 2000);
    setEditingAgent(null);
    setAgentDraft(null);
  }, [agentDraft]);

  /* ── Presets ── */
  const handleNewPreset = useCallback(() => {
    setPresets((prev) => {
      const id = `p-${Date.now()}`;
      const newPreset: Preset = {
        id,
        name: `Custom Preset ${prev.length + 1}`,
        description: "New custom configuration",
        isDefault: false,
        createdBy: "Researcher",
        hardware: { ...DEFAULT_HW },
      };
      const updated = [...prev, newPreset];
      savePresets(updated);
      setEditingPreset(id);
      setPresetDraft(newPreset);
      return updated;
    });
  }, []);

  const handleDeletePreset = useCallback((id: string) => {
    setPresets((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      savePresets(updated);
      return updated;
    });
    if (editingPreset === id) {
      setEditingPreset(null);
      setPresetDraft(null);
    }
  }, [editingPreset]);

  const handleEditPreset = useCallback((preset: Preset) => {
    setEditingPreset(preset.id);
    setPresetDraft({ ...preset });
  }, []);

  const handleSavePreset = useCallback(() => {
    if (!presetDraft) return;
    setPresets((prev) => {
      const updated = prev.map((p) => (p.id === presetDraft.id ? { ...presetDraft } : p));
      savePresets(updated);
      return updated;
    });
    setPresetSaved(presetDraft.id);
    setTimeout(() => setPresetSaved(null), 2000);
    setEditingPreset(null);
    setPresetDraft(null);
  }, [presetDraft]);

  const handleCancelPreset = useCallback(() => {
    setEditingPreset(null);
    setPresetDraft(null);
  }, []);

  const handleSetDefault = useCallback((id: string) => {
    setPresets((prev) => {
      const updated = prev.map((p) => ({ ...p, isDefault: p.id === id }));
      savePresets(updated);
      return updated;
    });
  }, []);

  const handleAddUser = useCallback(() => {
    const id = `u-${Date.now()}`;
    const newUser: UserEntry = {
      id,
      name: "",
      role: "Researcher",
      email: "",
      lastActive: "just now",
      status: "active",
      permissions: [...ROLE_DEFAULTS["Researcher"]],
    };
    setUsers((prev) => {
      const updated = [...prev, newUser];
      saveUsers(updated);
      return updated;
    });
    setEditingUser(id);
    setUserDraft(newUser);
  }, []);

  const handleEditUser = useCallback((user: UserEntry) => {
    setEditingUser(user.id);
    setUserDraft({ ...user, permissions: [...user.permissions] });
  }, []);

  const handleDeleteUser = useCallback((id: string) => {
    setUsers((prev) => {
      const updated = prev.filter((u) => u.id !== id);
      saveUsers(updated);
      return updated;
    });
    if (editingUser === id) {
      setEditingUser(null);
      setUserDraft(null);
    }
  }, [editingUser]);

  const handleSaveUser = useCallback(() => {
    if (!userDraft) return;
    setUsers((prev) => {
      const updated = prev.map((u) => (u.id === userDraft.id ? { ...userDraft } : u));
      saveUsers(updated);
      return updated;
    });
    setUserSaved(userDraft.id);
    setTimeout(() => setUserSaved(null), 2000);
    setEditingUser(null);
    setUserDraft(null);
  }, [userDraft]);

  const handleCancelUser = useCallback(() => {
    setEditingUser(null);
    setUserDraft(null);
  }, []);

  const handleUserRoleChange = useCallback((role: RoleName) => {
    setUserDraft((d) => d ? { ...d, role, permissions: [...ROLE_DEFAULTS[role]] } : d);
  }, []);

  const handleTogglePermission = useCallback((perm: Permission) => {
    setUserDraft((d) => {
      if (!d) return d;
      const has = d.permissions.includes(perm);
      return {
        ...d,
        permissions: has
          ? d.permissions.filter((p) => p !== perm)
          : [...d.permissions, perm],
      };
    });
  }, []);

  const handleToggleUserStatus = useCallback((id: string) => {
    setUsers((prev) => {
      const updated = prev.map((u): UserEntry => {
        if (u.id !== id) return u;
        const next: UserEntry["status"] = u.status === "active" ? "locked" : "active";
        return { ...u, status: next };
      });
      saveUsers(updated);
      return updated;
    });
  }, []);

  const handleSaveAuth = useCallback(() => {
    localStorage.setItem("cnea_auth", JSON.stringify(auth));
    setAuthSaved(true);
    setTimeout(() => setAuthSaved(false), 2500);
  }, [auth]);

  const currentProvider = useMemo(
    () => PROVIDERS.find((p) => p.key === llm.provider) ?? PROVIDERS[0],
    [llm.provider],
  );

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between bg-neural-surface rounded-xl border border-neural-border p-3">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-neural-text-muted" />
          <h1 className="text-lg font-semibold text-neural-text-primary">Settings</h1>
        </div>
        {currentUser && (
          <div className="flex items-center gap-2 text-xs text-neural-text-muted">
            <span>Signed in as</span>
            <span className="font-medium text-neural-text-secondary">{currentUser.name}</span>
            <span className="px-1.5 py-0.5 rounded bg-neural-border/60 text-neural-text-secondary font-medium">
              {currentUser.role}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        {/* Tabs — horizontal scroll on small screens, vertical sidebar on lg+ */}
        <div className="lg:w-56 bg-neural-surface rounded-xl border border-neural-border p-2 shrink-0">
          <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible">
            {settingsTabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 lg:gap-3 w-max lg:w-full px-3 py-2 lg:py-2.5 rounded-lg text-sm font-medium whitespace-nowrap neural-transition ${
                  activeTab === id
                    ? "bg-neural-accent-cyan/10 text-neural-accent-cyan"
                    : "text-neural-text-secondary hover:text-neural-text-primary hover:bg-neural-surface-alt"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 bg-neural-surface rounded-xl border border-neural-border p-4 sm:p-6 overflow-y-auto min-h-0">
          {/* Presets */}
          {activeTab === "presets" && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-neural-text-primary">Hardware Presets</h2>
                  <p className="text-sm text-neural-text-muted mt-1">
                    Manage saved hardware configurations for quick loading.
                  </p>
                </div>
                <button
                  onClick={handleNewPreset}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-neural-accent-cyan/20 text-neural-accent-cyan hover:bg-neural-accent-cyan/30 border border-neural-accent-cyan/30 neural-transition self-start"
                >
                  <Plus className="w-4 h-4" />
                  New Preset
                </button>
              </div>

              <div className="space-y-3">
                {presets.map((preset) => {
                  const isEditing = editingPreset === preset.id;
                  const draft = isEditing ? presetDraft! : preset;
                  const justSaved = presetSaved === preset.id;

                  return (
                    <div
                      key={preset.id}
                      className={`p-4 rounded-lg border neural-transition ${
                        isEditing
                          ? "bg-neural-surface-alt border-neural-accent-cyan/40"
                          : justSaved
                          ? "bg-neural-surface-alt border-neural-accent-green/40"
                          : "bg-neural-surface-alt border-neural-border"
                      }`}
                    >
                      {isEditing ? (
                        /* ── Inline editing mode with hardware config ── */
                        <div className="space-y-4">
                          {/* Basic info */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="text-xs text-neural-text-muted">Preset Name</label>
                              <input type="text" value={draft.name} autoFocus
                                onChange={(e) => setPresetDraft((d) => d ? { ...d, name: e.target.value } : d)}
                                className="mt-1 w-full bg-neural-surface border border-neural-border rounded-lg px-3 py-1.5 text-sm text-neural-text-primary" />
                            </div>
                            <div>
                              <label className="text-xs text-neural-text-muted">Created by</label>
                              <input type="text" value={draft.createdBy}
                                onChange={(e) => setPresetDraft((d) => d ? { ...d, createdBy: e.target.value } : d)}
                                className="mt-1 w-full bg-neural-surface border border-neural-border rounded-lg px-3 py-1.5 text-sm text-neural-text-primary" />
                            </div>
                            <div>
                              <label className="text-xs text-neural-text-muted">Description</label>
                              <input type="text" value={draft.description}
                                onChange={(e) => setPresetDraft((d) => d ? { ...d, description: e.target.value } : d)}
                                className="mt-1 w-full bg-neural-surface border border-neural-border rounded-lg px-3 py-1.5 text-sm text-neural-text-primary" />
                            </div>
                          </div>

                          {/* Acquisition settings */}
                          <div>
                            <span className="text-xs font-semibold text-neural-accent-cyan uppercase tracking-wider">Acquisition</span>
                            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div>
                                <label className="text-xs text-neural-text-muted">Sample Rate (kHz)</label>
                                <input type="number" min={1} max={100} step={1} value={draft.hardware.sampleRateKhz}
                                  onChange={(e) => setPresetDraft((d) => d ? { ...d, hardware: { ...d.hardware, sampleRateKhz: Number(e.target.value) } } : d)}
                                  className="mt-1 w-full bg-neural-surface border border-neural-border rounded px-2 py-1 text-xs font-mono text-neural-text-primary" />
                              </div>
                              <div>
                                <label className="text-xs text-neural-text-muted">Gain Mode</label>
                                <select value={draft.hardware.gainMode}
                                  onChange={(e) => setPresetDraft((d) => d ? { ...d, hardware: { ...d.hardware, gainMode: e.target.value as GainMode } } : d)}
                                  className="mt-1 w-full bg-neural-surface border border-neural-border rounded px-2 py-1 text-xs font-mono text-neural-text-primary">
                                  <option value="low">Low (100x)</option>
                                  <option value="medium">Medium (500x)</option>
                                  <option value="high">High (1000x)</option>
                                  <option value="ultra">Ultra (5000x)</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-xs text-neural-text-muted">Master Clock (MHz)</label>
                                <input type="number" min={1} max={200} step={1} value={draft.hardware.masterClockMhz}
                                  onChange={(e) => setPresetDraft((d) => d ? { ...d, hardware: { ...d.hardware, masterClockMhz: Number(e.target.value) } } : d)}
                                  className="mt-1 w-full bg-neural-surface border border-neural-border rounded px-2 py-1 text-xs font-mono text-neural-text-primary" />
                              </div>
                              <div>
                                <label className="text-xs text-neural-text-muted">Array Size</label>
                                <div className="mt-1 flex gap-1">
                                  <input type="number" min={1} max={128} value={draft.hardware.arrayRows}
                                    onChange={(e) => setPresetDraft((d) => d ? { ...d, hardware: { ...d.hardware, arrayRows: Number(e.target.value) } } : d)}
                                    className="w-full bg-neural-surface border border-neural-border rounded px-2 py-1 text-xs font-mono text-neural-text-primary" />
                                  <span className="text-neural-text-muted self-center text-xs">x</span>
                                  <input type="number" min={1} max={128} value={draft.hardware.arrayCols}
                                    onChange={(e) => setPresetDraft((d) => d ? { ...d, hardware: { ...d.hardware, arrayCols: Number(e.target.value) } } : d)}
                                    className="w-full bg-neural-surface border border-neural-border rounded px-2 py-1 text-xs font-mono text-neural-text-primary" />
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* TIA / Filter settings */}
                          <div>
                            <span className="text-xs font-semibold text-neural-accent-blue uppercase tracking-wider">TIA & Filter</span>
                            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div>
                                <label className="text-xs text-neural-text-muted">TIA Gain (V/A)</label>
                                <input type="number" min={100} max={10000} step={100} value={draft.hardware.tiaGain}
                                  onChange={(e) => setPresetDraft((d) => d ? { ...d, hardware: { ...d.hardware, tiaGain: Number(e.target.value) } } : d)}
                                  className="mt-1 w-full bg-neural-surface border border-neural-border rounded px-2 py-1 text-xs font-mono text-neural-text-primary" />
                              </div>
                              <div>
                                <label className="text-xs text-neural-text-muted">Bandwidth (Hz)</label>
                                <input type="number" min={100} max={100000} step={100} value={draft.hardware.tiaBandwidthHz}
                                  onChange={(e) => setPresetDraft((d) => d ? { ...d, hardware: { ...d.hardware, tiaBandwidthHz: Number(e.target.value) } } : d)}
                                  className="mt-1 w-full bg-neural-surface border border-neural-border rounded px-2 py-1 text-xs font-mono text-neural-text-primary" />
                              </div>
                              <div>
                                <label className="text-xs text-neural-text-muted">Filter Order</label>
                                <input type="number" min={1} max={8} step={1} value={draft.hardware.filterOrder}
                                  onChange={(e) => setPresetDraft((d) => d ? { ...d, hardware: { ...d.hardware, filterOrder: Number(e.target.value) } } : d)}
                                  className="mt-1 w-full bg-neural-surface border border-neural-border rounded px-2 py-1 text-xs font-mono text-neural-text-primary" />
                              </div>
                              <div>
                                <label className="text-xs text-neural-text-muted">Cutoff Freq (Hz)</label>
                                <input type="number" min={100} max={50000} step={100} value={draft.hardware.cutoffFreqHz}
                                  onChange={(e) => setPresetDraft((d) => d ? { ...d, hardware: { ...d.hardware, cutoffFreqHz: Number(e.target.value) } } : d)}
                                  className="mt-1 w-full bg-neural-surface border border-neural-border rounded px-2 py-1 text-xs font-mono text-neural-text-primary" />
                              </div>
                            </div>
                          </div>

                          {/* Stimulation settings */}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-neural-accent-yellow uppercase tracking-wider">Stimulation</span>
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input type="checkbox" checked={draft.hardware.stimEnabled}
                                  onChange={(e) => setPresetDraft((d) => d ? { ...d, hardware: { ...d.hardware, stimEnabled: e.target.checked } } : d)}
                                  className="w-3.5 h-3.5 rounded border-neural-border accent-neural-accent-yellow" />
                                <span className="text-xs text-neural-text-secondary">Enable</span>
                              </label>
                            </div>
                            {draft.hardware.stimEnabled && (
                              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
                                <div>
                                  <label className="text-xs text-neural-text-muted">Waveform</label>
                                  <select value={draft.hardware.stimWaveform}
                                    onChange={(e) => setPresetDraft((d) => d ? { ...d, hardware: { ...d.hardware, stimWaveform: e.target.value as PresetHardware["stimWaveform"] } } : d)}
                                    className="mt-1 w-full bg-neural-surface border border-neural-border rounded px-2 py-1 text-xs font-mono text-neural-text-primary">
                                    <option value="biphasic">Biphasic</option>
                                    <option value="monophasic">Monophasic</option>
                                    <option value="sine">Sine</option>
                                    <option value="custom">Custom</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs text-neural-text-muted">Amplitude (uA)</label>
                                  <input type="number" min={1} max={500} step={1} value={draft.hardware.stimAmplitudeUa}
                                    onChange={(e) => setPresetDraft((d) => d ? { ...d, hardware: { ...d.hardware, stimAmplitudeUa: Number(e.target.value) } } : d)}
                                    className="mt-1 w-full bg-neural-surface border border-neural-border rounded px-2 py-1 text-xs font-mono text-neural-text-primary" />
                                </div>
                                <div>
                                  <label className="text-xs text-neural-text-muted">Frequency (Hz)</label>
                                  <input type="number" min={1} max={10000} step={1} value={draft.hardware.stimFreqHz}
                                    onChange={(e) => setPresetDraft((d) => d ? { ...d, hardware: { ...d.hardware, stimFreqHz: Number(e.target.value) } } : d)}
                                    className="mt-1 w-full bg-neural-surface border border-neural-border rounded px-2 py-1 text-xs font-mono text-neural-text-primary" />
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 pt-1 border-t border-neural-border">
                            <button onClick={handleSavePreset}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-neural-accent-green/20 text-neural-accent-green hover:bg-neural-accent-green/30 border border-neural-accent-green/30 neural-transition">
                              <Check className="w-3 h-3" /> Save Preset
                            </button>
                            <button onClick={handleCancelPreset}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-neural-text-muted hover:text-neural-text-primary hover:bg-neural-border neural-transition">
                              <X className="w-3 h-3" /> Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* ── Display mode ── */
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-neural-text-primary">{preset.name}</span>
                              {preset.isDefault && (
                                <span className="px-1.5 py-0.5 rounded text-xs bg-neural-accent-green/20 text-neural-accent-green">
                                  Default
                                </span>
                              )}
                              {justSaved && (
                                <span className="flex items-center gap-1 text-xs text-neural-accent-green">
                                  <Check className="w-3 h-3" /> Saved
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-neural-text-muted mt-1">{preset.description}</p>
                            <p className="text-xs text-neural-text-muted mt-0.5">Created by: {preset.createdBy}</p>
                            {/* Hardware summary chips */}
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              <span className="px-1.5 py-0.5 rounded bg-neural-border/50 text-[10px] font-mono text-neural-text-secondary">
                                {preset.hardware.sampleRateKhz} kHz
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-neural-border/50 text-[10px] font-mono text-neural-text-secondary">
                                {preset.hardware.gainMode} gain
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-neural-border/50 text-[10px] font-mono text-neural-text-secondary">
                                TIA {preset.hardware.tiaGain}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-neural-border/50 text-[10px] font-mono text-neural-text-secondary">
                                {preset.hardware.arrayRows}x{preset.hardware.arrayCols}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-neural-border/50 text-[10px] font-mono text-neural-text-secondary">
                                BW {preset.hardware.tiaBandwidthHz} Hz
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-neural-border/50 text-[10px] font-mono text-neural-text-secondary">
                                Filter {preset.hardware.filterOrder}nd @ {preset.hardware.cutoffFreqHz} Hz
                              </span>
                              {preset.hardware.stimEnabled && (
                                <span className="px-1.5 py-0.5 rounded bg-neural-accent-yellow/20 text-[10px] font-mono text-neural-accent-yellow">
                                  Stim {preset.hardware.stimWaveform} {preset.hardware.stimAmplitudeUa}uA
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {!preset.isDefault && (
                              <button
                                onClick={() => handleSetDefault(preset.id)}
                                title="Set as default"
                                className="px-2 py-1.5 rounded-lg text-xs text-neural-text-muted hover:text-neural-accent-green hover:bg-neural-accent-green/10 neural-transition"
                              >
                                Set Default
                              </button>
                            )}
                            <button
                              onClick={() => handleEditPreset(preset)}
                              title="Edit preset"
                              className="p-2 rounded-lg hover:bg-neural-border text-neural-text-muted hover:text-neural-text-primary neural-transition"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeletePreset(preset.id)}
                              title="Delete preset"
                              className="p-2 rounded-lg hover:bg-neural-border text-neural-text-muted hover:text-neural-accent-red neural-transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Users & RBAC */}
          {activeTab === "users" && (
            <div className="space-y-8">
              {/* ── Authentication Settings ── */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Lock className="w-4 h-4 text-neural-accent-purple" />
                  <h2 className="text-lg font-semibold text-neural-text-primary">Authentication</h2>
                </div>
                <div className="p-4 rounded-lg bg-neural-surface-alt border border-neural-border space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs text-neural-text-muted">Auth Method</label>
                      <select
                        value={auth.method}
                        onChange={(e) => { setAuth((a) => ({ ...a, method: e.target.value as AuthSettings["method"] })); setAuthSaved(false); }}
                        className="mt-1 w-full bg-neural-surface border border-neural-border rounded-lg px-3 py-1.5 text-sm text-neural-text-primary"
                      >
                        <option value="jwt">JWT Token</option>
                        <option value="oauth2">OAuth 2.0 / SSO</option>
                        <option value="ldap">LDAP / Active Directory</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-neural-text-muted">Session Timeout (hours)</label>
                      <input
                        type="number" min={1} max={72} value={auth.sessionTimeout}
                        onChange={(e) => { setAuth((a) => ({ ...a, sessionTimeout: Number(e.target.value) })); setAuthSaved(false); }}
                        className="mt-1 w-full bg-neural-surface border border-neural-border rounded-lg px-3 py-1.5 text-sm font-mono text-neural-text-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-neural-text-muted">Max Login Attempts</label>
                      <input
                        type="number" min={1} max={20} value={auth.maxLoginAttempts}
                        onChange={(e) => { setAuth((a) => ({ ...a, maxLoginAttempts: Number(e.target.value) })); setAuthSaved(false); }}
                        className="mt-1 w-full bg-neural-surface border border-neural-border rounded-lg px-3 py-1.5 text-sm font-mono text-neural-text-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-neural-text-muted">Lockout Duration (min)</label>
                      <input
                        type="number" min={1} max={120} value={auth.lockoutDuration}
                        onChange={(e) => { setAuth((a) => ({ ...a, lockoutDuration: Number(e.target.value) })); setAuthSaved(false); }}
                        className="mt-1 w-full bg-neural-surface border border-neural-border rounded-lg px-3 py-1.5 text-sm font-mono text-neural-text-primary"
                      />
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox" checked={auth.mfaEnabled}
                          onChange={(e) => { setAuth((a) => ({ ...a, mfaEnabled: e.target.checked })); setAuthSaved(false); }}
                          className="w-4 h-4 rounded border-neural-border accent-neural-accent-cyan"
                        />
                        <span className="text-sm text-neural-text-primary">Enable MFA / 2FA</span>
                      </label>
                    </div>
                  </div>
                  <button
                    onClick={handleSaveAuth}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border neural-transition ${
                      authSaved
                        ? "bg-neural-accent-green/20 text-neural-accent-green border-neural-accent-green/30"
                        : "bg-neural-accent-cyan/20 text-neural-accent-cyan hover:bg-neural-accent-cyan/30 border-neural-accent-cyan/30"
                    }`}
                  >
                    {authSaved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                    {authSaved ? "Saved!" : "Save Auth Settings"}
                  </button>
                </div>
              </div>

              {/* ── RBAC Matrix ── */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Key className="w-4 h-4 text-neural-accent-yellow" />
                  <h2 className="text-lg font-semibold text-neural-text-primary">Role Permissions (RBAC)</h2>
                </div>
                <div className="overflow-x-auto rounded-lg border border-neural-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-neural-surface-alt">
                        <th className="text-left px-3 py-2 text-neural-text-muted font-medium border-b border-neural-border">Permission</th>
                        {ROLES.map((r) => (
                          <th key={r} className="text-center px-3 py-2 text-neural-text-muted font-medium border-b border-neural-border">{r}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ALL_PERMISSIONS.map((p, i) => (
                        <tr key={p.key} className={i % 2 === 0 ? "bg-neural-surface" : "bg-neural-surface-alt/50"}>
                          <td className="px-3 py-1.5 text-neural-text-primary">
                            <span className="text-neural-text-muted mr-1.5">{p.group}:</span>{p.label}
                          </td>
                          {ROLES.map((r) => (
                            <td key={r} className="text-center px-3 py-1.5">
                              {ROLE_DEFAULTS[r].includes(p.key) ? (
                                <Check className="w-3.5 h-3.5 text-neural-accent-green mx-auto" />
                              ) : (
                                <X className="w-3.5 h-3.5 text-neural-border mx-auto" />
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── User List ── */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-neural-accent-blue" />
                    <h2 className="text-lg font-semibold text-neural-text-primary">Users</h2>
                    <span className="text-xs text-neural-text-muted">({users.length})</span>
                  </div>
                  <button
                    onClick={handleAddUser}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-neural-accent-cyan/20 text-neural-accent-cyan hover:bg-neural-accent-cyan/30 border border-neural-accent-cyan/30 neural-transition self-start"
                  >
                    <Plus className="w-4 h-4" />
                    Add User
                  </button>
                </div>

                <div className="space-y-2">
                  {users.map((user) => {
                    const isEditing = editingUser === user.id;
                    const draft = isEditing ? userDraft! : user;
                    const justSaved = userSaved === user.id;

                    return (
                      <div
                        key={user.id}
                        className={`p-4 rounded-lg border neural-transition ${
                          isEditing
                            ? "bg-neural-surface-alt border-neural-accent-cyan/40"
                            : justSaved
                            ? "bg-neural-surface-alt border-neural-accent-green/40"
                            : "bg-neural-surface-alt border-neural-border"
                        }`}
                      >
                        {isEditing ? (
                          /* ── Editing user ── */
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs text-neural-text-muted">Full Name</label>
                                <input
                                  type="text" value={draft.name} autoFocus
                                  onChange={(e) => setUserDraft((d) => d ? { ...d, name: e.target.value } : d)}
                                  className="mt-1 w-full bg-neural-surface border border-neural-border rounded-lg px-3 py-1.5 text-sm text-neural-text-primary"
                                  placeholder="Dr. Smith"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-neural-text-muted">Email</label>
                                <input
                                  type="email" value={draft.email}
                                  onChange={(e) => setUserDraft((d) => d ? { ...d, email: e.target.value } : d)}
                                  className="mt-1 w-full bg-neural-surface border border-neural-border rounded-lg px-3 py-1.5 text-sm text-neural-text-primary font-mono"
                                  placeholder="smith@lab.edu"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-neural-text-muted">Role</label>
                                <select
                                  value={draft.role}
                                  onChange={(e) => handleUserRoleChange(e.target.value as RoleName)}
                                  className="mt-1 w-full bg-neural-surface border border-neural-border rounded-lg px-3 py-1.5 text-sm text-neural-text-primary"
                                >
                                  {ROLES.map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="text-xs text-neural-text-muted">Status</label>
                                <select
                                  value={draft.status}
                                  onChange={(e) => setUserDraft((d) => d ? { ...d, status: e.target.value as UserEntry["status"] } : d)}
                                  className="mt-1 w-full bg-neural-surface border border-neural-border rounded-lg px-3 py-1.5 text-sm text-neural-text-primary"
                                >
                                  <option value="active">Active</option>
                                  <option value="inactive">Inactive</option>
                                  <option value="locked">Locked</option>
                                </select>
                              </div>
                            </div>
                            {/* Permissions checkboxes */}
                            <div>
                              <label className="text-xs text-neural-text-muted">Permissions (inherited from {draft.role}, customizable)</label>
                              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                                {ALL_PERMISSIONS.map((p) => (
                                  <label key={p.key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={draft.permissions.includes(p.key)}
                                      onChange={() => handleTogglePermission(p.key)}
                                      className="w-3.5 h-3.5 rounded border-neural-border accent-neural-accent-cyan"
                                    />
                                    <span className="text-neural-text-secondary">{p.label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={handleSaveUser}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-neural-accent-green/20 text-neural-accent-green hover:bg-neural-accent-green/30 border border-neural-accent-green/30 neural-transition"
                              >
                                <Check className="w-3 h-3" /> Save User
                              </button>
                              <button
                                onClick={handleCancelUser}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-neural-text-muted hover:text-neural-text-primary hover:bg-neural-border neural-transition"
                              >
                                <X className="w-3 h-3" /> Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* ── Display mode ── */
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                                user.status === "active" ? "bg-neural-accent-green/20" : user.status === "locked" ? "bg-neural-accent-red/20" : "bg-neural-border"
                              }`}>
                                {user.status === "locked" ? (
                                  <Lock className="w-4 h-4 text-neural-accent-red" />
                                ) : (
                                  <Users className="w-4 h-4 text-neural-text-muted" />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-neural-text-primary">{user.name || "Unnamed"}</span>
                                  {currentUser && user.email === currentUser.email && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-neural-accent-green/20 text-neural-accent-green">
                                      You
                                    </span>
                                  )}
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                    user.role === "Admin"
                                      ? "bg-neural-accent-purple/20 text-neural-accent-purple"
                                      : user.role === "Researcher"
                                      ? "bg-neural-accent-blue/20 text-neural-accent-blue"
                                      : user.role === "Operator"
                                      ? "bg-neural-accent-cyan/20 text-neural-accent-cyan"
                                      : "bg-neural-text-muted/20 text-neural-text-muted"
                                  }`}>
                                    {user.role}
                                  </span>
                                  {user.status !== "active" && (
                                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                                      user.status === "locked"
                                        ? "bg-neural-accent-red/20 text-neural-accent-red"
                                        : "bg-neural-text-muted/20 text-neural-text-muted"
                                    }`}>
                                      {user.status}
                                    </span>
                                  )}
                                  {justSaved && (
                                    <span className="flex items-center gap-1 text-xs text-neural-accent-green">
                                      <Check className="w-3 h-3" /> Saved
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-neural-text-muted mt-0.5">
                                  {user.email} &middot; {user.lastActive} &middot; {user.permissions.length} permissions
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleToggleUserStatus(user.id)}
                                title={user.status === "active" ? "Lock account" : "Unlock account"}
                                className="p-2 rounded-lg text-neural-text-muted hover:text-neural-text-primary hover:bg-neural-border neural-transition"
                              >
                                {user.status === "active" ? <Lock className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={() => handleEditUser(user)}
                                title="Edit user"
                                className="p-2 rounded-lg hover:bg-neural-border text-neural-text-muted hover:text-neural-text-primary neural-transition"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(user.id)}
                                title="Delete user"
                                className="p-2 rounded-lg hover:bg-neural-border text-neural-text-muted hover:text-neural-accent-red neural-transition"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Agents (editable) ── */}
          {activeTab === "agents" && (
            <div>
              <h2 className="text-lg font-semibold text-neural-text-primary mb-1">Agent Configuration</h2>
              <p className="text-sm text-neural-text-muted mb-6">
                Configure backend agent services, heartbeat intervals, and resource limits.
              </p>

              <div className="space-y-4">
                {agents.map((agent) => {
                  const isEditing = editingAgent === agent.id;
                  const draft = isEditing ? agentDraft! : agent;
                  const justSaved = agentSaved === agent.id;

                  return (
                    <div
                      key={agent.id}
                      className={`p-4 rounded-lg border neural-transition ${
                        isEditing
                          ? "bg-neural-surface-alt border-neural-accent-cyan/40"
                          : justSaved
                          ? "bg-neural-surface-alt border-neural-accent-green/40"
                          : "bg-neural-surface-alt border-neural-border"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-neural-accent-cyan shrink-0" />
                          <span className="text-sm font-medium text-neural-text-primary">
                            {agent.label}
                          </span>
                          {justSaved && (
                            <span className="flex items-center gap-1 text-xs text-neural-accent-green">
                              <Check className="w-3 h-3" /> Saved
                            </span>
                          )}
                        </div>
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={handleSaveAgent}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-neural-accent-green/20 text-neural-accent-green hover:bg-neural-accent-green/30 border border-neural-accent-green/30 neural-transition"
                            >
                              <Check className="w-3 h-3" /> Save
                            </button>
                            <button
                              onClick={handleCancelAgent}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-neural-text-muted hover:text-neural-text-primary hover:bg-neural-border neural-transition"
                            >
                              <X className="w-3 h-3" /> Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleEditAgent(agent)}
                            className="text-xs text-neural-accent-cyan hover:underline"
                          >
                            Configure
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                        {/* Heartbeat */}
                        <div>
                          <span className="text-neural-text-muted">Heartbeat Interval</span>
                          {isEditing ? (
                            <input
                              type="number"
                              min={500}
                              max={60000}
                              step={500}
                              value={draft.heartbeat}
                              onChange={(e) =>
                                setAgentDraft((d) => d ? { ...d, heartbeat: Number(e.target.value) } : d)
                              }
                              className="mt-1 w-full bg-neural-surface border border-neural-border rounded px-2 py-1 text-xs font-mono text-neural-text-primary"
                            />
                          ) : (
                            <div className="text-neural-text-primary font-mono mt-0.5">
                              {agent.heartbeat} ms
                            </div>
                          )}
                        </div>

                        {/* Max Memory */}
                        <div>
                          <span className="text-neural-text-muted">Max Memory</span>
                          {isEditing ? (
                            <input
                              type="number"
                              min={256}
                              max={16384}
                              step={256}
                              value={draft.maxMemory}
                              onChange={(e) =>
                                setAgentDraft((d) => d ? { ...d, maxMemory: Number(e.target.value) } : d)
                              }
                              className="mt-1 w-full bg-neural-surface border border-neural-border rounded px-2 py-1 text-xs font-mono text-neural-text-primary"
                            />
                          ) : (
                            <div className="text-neural-text-primary font-mono mt-0.5">
                              {agent.maxMemory} MB
                            </div>
                          )}
                        </div>

                        {/* Log Level */}
                        <div>
                          <span className="text-neural-text-muted">Log Level</span>
                          {isEditing ? (
                            <select
                              value={draft.logLevel}
                              onChange={(e) =>
                                setAgentDraft((d) =>
                                  d ? { ...d, logLevel: e.target.value as AgentConfig["logLevel"] } : d,
                                )
                              }
                              className="mt-1 w-full bg-neural-surface border border-neural-border rounded px-2 py-1 text-xs font-mono text-neural-text-primary"
                            >
                              {LOG_LEVELS.map((l) => (
                                <option key={l} value={l}>
                                  {l}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="text-neural-text-primary font-mono mt-0.5">
                              {agent.logLevel}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── LLM (fully controlled + persistent) ── */}
          {activeTab === "llm" && (
            <div>
              <h2 className="text-lg font-semibold text-neural-text-primary mb-1">LLM Settings</h2>
              <p className="text-sm text-neural-text-muted mb-6">
                Configure the language model for the AI assistant.
              </p>

              <div className="space-y-6">
                {/* Provider */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neural-text-secondary">Model Provider</label>
                  <select
                    value={llm.provider}
                    onChange={(e) => handleProviderChange(e.target.value as ProviderKey)}
                    className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2 text-sm text-neural-text-primary"
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Model (changes based on provider) */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neural-text-secondary">Model</label>
                  <select
                    value={llm.model}
                    onChange={(e) => {
                      setLlm((prev) => ({ ...prev, model: e.target.value }));
                      setLlmSaved(false);
                    }}
                    className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2 text-sm text-neural-text-primary"
                  >
                    {providerModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                {/* API Key */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neural-text-secondary">
                    {llm.provider === "ollama" ? "Endpoint URL" : "API Key"}
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={llm.apiKey}
                      onChange={(e) => {
                        setLlm((prev) => ({ ...prev, apiKey: e.target.value }));
                        setLlmSaved(false);
                      }}
                      placeholder={currentProvider.placeholder}
                      className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2 pr-10 text-sm text-neural-text-primary placeholder:text-neural-text-muted font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neural-text-muted hover:text-neural-text-primary neural-transition"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Temperature */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-neural-text-secondary">Temperature</label>
                    <span className="text-xs font-mono text-neural-accent-cyan">{llm.temperature.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={llm.temperature}
                    onChange={(e) => {
                      setLlm((prev) => ({ ...prev, temperature: parseFloat(e.target.value) }));
                      setLlmSaved(false);
                    }}
                    className="w-full accent-neural-accent-cyan"
                  />
                  <div className="flex justify-between text-xs text-neural-text-muted">
                    <span>Precise (0)</span>
                    <span>Creative (1)</span>
                  </div>
                </div>

                {/* System Prompt */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neural-text-secondary">System Prompt</label>
                  <textarea
                    rows={4}
                    value={llm.systemPrompt}
                    onChange={(e) => {
                      setLlm((prev) => ({ ...prev, systemPrompt: e.target.value }));
                      setLlmSaved(false);
                    }}
                    className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2 text-sm text-neural-text-primary resize-none"
                  />
                </div>

                {/* Save */}
                <button
                  onClick={handleSaveLLM}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm border neural-transition ${
                    llmSaved
                      ? "bg-neural-accent-green/20 text-neural-accent-green border-neural-accent-green/30"
                      : "bg-neural-accent-cyan/20 text-neural-accent-cyan hover:bg-neural-accent-cyan/30 border-neural-accent-cyan/30"
                  }`}
                >
                  {llmSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                  {llmSaved ? "Saved!" : "Save Settings"}
                </button>
              </div>
            </div>
          )}

          {/* System */}
          {activeTab === "system" && (
            <div>
              <h2 className="text-lg font-semibold text-neural-text-primary mb-1">System Settings</h2>
              <p className="text-sm text-neural-text-muted mb-6">
                General system configuration and diagnostics.
              </p>

              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-neural-surface-alt border border-neural-border">
                  <div className="flex items-center gap-2 mb-3">
                    <Globe className="w-4 h-4 text-neural-accent-blue" />
                    <span className="text-sm font-medium text-neural-text-primary">Network</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-neural-text-muted">BFF Address</span>
                      <div className="text-neural-text-primary font-mono mt-0.5">172.168.1.95:3026</div>
                    </div>
                    <div>
                      <span className="text-neural-text-muted">WebSocket</span>
                      <div className="text-neural-text-primary font-mono mt-0.5">ws://172.168.1.95:3026/ws</div>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-neural-surface-alt border border-neural-border">
                  <div className="flex items-center gap-2 mb-3">
                    <Database className="w-4 h-4 text-neural-accent-green" />
                    <span className="text-sm font-medium text-neural-text-primary">Storage</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-neural-text-muted">Total Space</span>
                      <div className="text-neural-text-primary font-mono mt-0.5">4.0 TB</div>
                    </div>
                    <div>
                      <span className="text-neural-text-muted">Used</span>
                      <div className="text-neural-text-primary font-mono mt-0.5">1.2 TB</div>
                    </div>
                    <div>
                      <span className="text-neural-text-muted">Available</span>
                      <div className="text-neural-accent-green font-mono mt-0.5">2.8 TB</div>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-neural-surface-alt border border-neural-border">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className="w-4 h-4 text-neural-accent-purple" />
                    <span className="text-sm font-medium text-neural-text-primary">Security</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-neural-text-muted">Auth Mode</span>
                      <div className="text-neural-text-primary font-mono mt-0.5">JWT Token</div>
                    </div>
                    <div>
                      <span className="text-neural-text-muted">Session Timeout</span>
                      <div className="text-neural-text-primary font-mono mt-0.5">8 hours</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
