import { useState, useCallback } from "react";
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
} from "lucide-react";

const settingsTabs = [
  { id: "presets", label: "Hardware Presets", icon: HardDrive },
  { id: "users", label: "Users & Roles", icon: Users },
  { id: "agents", label: "Agent Config", icon: Cpu },
  { id: "llm", label: "LLM Settings", icon: Brain },
  { id: "system", label: "System", icon: Settings },
] as const;

type SettingsTab = (typeof settingsTabs)[number]["id"];

const mockPresets = [
  { id: "p-1", name: "Default", description: "Standard 30kHz recording configuration", isDefault: true, createdBy: "System" },
  { id: "p-2", name: "High Density", description: "64x64 full array, high gain, reduced bandwidth", isDefault: false, createdBy: "Dr. Chen" },
  { id: "p-3", name: "Low Noise", description: "Optimized for low-noise cortical recordings", isDefault: false, createdBy: "Dr. Patel" },
  { id: "p-4", name: "Stimulation", description: "Closed-loop stimulation with biphasic pulses", isDefault: false, createdBy: "Dr. Kim" },
];

const mockUsers = [
  { name: "Dr. Chen", role: "Admin", email: "chen@lab.edu", lastActive: "2 min ago" },
  { name: "Dr. Patel", role: "Researcher", email: "patel@lab.edu", lastActive: "1 hr ago" },
  { name: "Dr. Kim", role: "Researcher", email: "kim@lab.edu", lastActive: "3 hr ago" },
  { name: "Dr. Martinez", role: "Researcher", email: "martinez@lab.edu", lastActive: "1 day ago" },
  { name: "Lab Tech", role: "Operator", email: "tech@lab.edu", lastActive: "5 hr ago" },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("presets");
  const [presets, setPresets] = useState(mockPresets);
  const [users, setUsers] = useState(mockUsers);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleNewPreset = useCallback(() => {
    const id = `p-${presets.length + 1}`;
    setPresets((prev) => [
      ...prev,
      { id, name: `Custom Preset ${prev.length + 1}`, description: "New custom configuration", isDefault: false, createdBy: "Researcher" },
    ]);
  }, [presets.length]);

  const handleDeletePreset = useCallback((id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleAddUser = useCallback(() => {
    setUsers((prev) => [
      ...prev,
      { name: `New User ${prev.length + 1}`, role: "Researcher", email: `user${prev.length + 1}@lab.edu`, lastActive: "just now" },
    ]);
  }, []);

  const handleSaveSettings = useCallback(() => {
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  }, []);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center gap-2 bg-neural-surface rounded-xl border border-neural-border p-3">
        <Settings className="w-5 h-5 text-neural-text-muted" />
        <h1 className="text-lg font-semibold text-neural-text-primary">Settings</h1>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Tabs sidebar */}
        <div className="w-56 bg-neural-surface rounded-xl border border-neural-border p-2">
          <nav className="space-y-1">
            {settingsTabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium neural-transition ${
                  activeTab === id
                    ? "bg-neural-accent-cyan/10 text-neural-accent-cyan"
                    : "text-neural-text-secondary hover:text-neural-text-primary hover:bg-neural-surface-alt"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 bg-neural-surface rounded-xl border border-neural-border p-6 overflow-y-auto">
          {/* Presets */}
          {activeTab === "presets" && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-neural-text-primary">Hardware Presets</h2>
                  <p className="text-sm text-neural-text-muted mt-1">
                    Manage saved hardware configurations for quick loading.
                  </p>
                </div>
                <button
                  onClick={handleNewPreset}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-neural-accent-cyan/20 text-neural-accent-cyan hover:bg-neural-accent-cyan/30 border border-neural-accent-cyan/30 neural-transition"
                >
                  <Plus className="w-4 h-4" />
                  New Preset
                </button>
              </div>

              <div className="space-y-3">
                {presets.map((preset) => (
                  <div
                    key={preset.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-neural-surface-alt border border-neural-border"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-neural-text-primary">{preset.name}</span>
                        {preset.isDefault && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-neural-accent-green/20 text-neural-accent-green">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neural-text-muted mt-1">{preset.description}</p>
                      <p className="text-xs text-neural-text-muted mt-0.5">Created by: {preset.createdBy}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const newName = prompt("Preset name:", preset.name);
                          if (newName) setPresets((prev) => prev.map((p) => p.id === preset.id ? { ...p, name: newName } : p));
                        }}
                        className="p-2 rounded-lg hover:bg-neural-border text-neural-text-muted hover:text-neural-text-primary neural-transition"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeletePreset(preset.id)}
                        className="p-2 rounded-lg hover:bg-neural-border text-neural-text-muted hover:text-neural-accent-red neural-transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Users */}
          {activeTab === "users" && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-neural-text-primary">Users & Roles</h2>
                  <p className="text-sm text-neural-text-muted mt-1">
                    Manage user accounts and access permissions.
                  </p>
                </div>
                <button
                  onClick={handleAddUser}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-neural-accent-cyan/20 text-neural-accent-cyan hover:bg-neural-accent-cyan/30 border border-neural-accent-cyan/30 neural-transition"
                >
                  <Plus className="w-4 h-4" />
                  Add User
                </button>
              </div>

              <div className="space-y-2">
                {users.map((user) => (
                  <div
                    key={user.email}
                    className="flex items-center justify-between p-3 rounded-lg bg-neural-surface-alt border border-neural-border"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-neural-border flex items-center justify-center">
                        <Users className="w-4 h-4 text-neural-text-muted" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-neural-text-primary">{user.name}</div>
                        <div className="text-xs text-neural-text-muted">{user.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-neural-text-muted">{user.lastActive}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        user.role === "Admin"
                          ? "bg-neural-accent-purple/20 text-neural-accent-purple"
                          : user.role === "Researcher"
                          ? "bg-neural-accent-blue/20 text-neural-accent-blue"
                          : "bg-neural-text-muted/20 text-neural-text-muted"
                      }`}>
                        {user.role}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Agents */}
          {activeTab === "agents" && (
            <div>
              <h2 className="text-lg font-semibold text-neural-text-primary mb-1">Agent Configuration</h2>
              <p className="text-sm text-neural-text-muted mb-6">
                Configure backend agent services, heartbeat intervals, and resource limits.
              </p>

              <div className="space-y-4">
                {["hardware-agent", "recording-agent", "analysis-agent", "llm-agent", "storage-agent"].map((agent) => (
                  <div key={agent} className="p-4 rounded-lg bg-neural-surface-alt border border-neural-border">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-neural-accent-cyan" />
                        <span className="text-sm font-medium text-neural-text-primary capitalize">
                          {agent.replace("-", " ")}
                        </span>
                      </div>
                      <button onClick={() => alert(`Configure ${agent.replace("-", " ")} — coming soon`)} className="text-xs text-neural-accent-cyan hover:underline">Configure</button>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-neural-text-muted">Heartbeat Interval</span>
                        <div className="text-neural-text-primary font-mono mt-0.5">5000 ms</div>
                      </div>
                      <div>
                        <span className="text-neural-text-muted">Max Memory</span>
                        <div className="text-neural-text-primary font-mono mt-0.5">2048 MB</div>
                      </div>
                      <div>
                        <span className="text-neural-text-muted">Log Level</span>
                        <div className="text-neural-text-primary font-mono mt-0.5">info</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LLM */}
          {activeTab === "llm" && (
            <div>
              <h2 className="text-lg font-semibold text-neural-text-primary mb-1">LLM Settings</h2>
              <p className="text-sm text-neural-text-muted mb-6">
                Configure the language model for the AI assistant.
              </p>

              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-neural-text-secondary">Model Provider</label>
                  <select className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2 text-sm text-neural-text-primary">
                    <option>Anthropic (Claude)</option>
                    <option>OpenAI (GPT-4)</option>
                    <option>Local (Ollama)</option>
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-neural-text-secondary">Model</label>
                  <select className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2 text-sm text-neural-text-primary">
                    <option>claude-sonnet-4-20250514</option>
                    <option>claude-opus-4-20250514</option>
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-neural-text-secondary">API Key</label>
                  <input
                    type="password"
                    placeholder="sk-ant-..."
                    className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2 text-sm text-neural-text-primary placeholder:text-neural-text-muted"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-neural-text-secondary">Temperature</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    defaultValue="0.3"
                    className="w-full accent-neural-accent-cyan"
                  />
                  <div className="flex justify-between text-xs text-neural-text-muted">
                    <span>Precise (0)</span>
                    <span>Creative (1)</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-neural-text-secondary">System Prompt</label>
                  <textarea
                    rows={4}
                    defaultValue="You are a neural engineering assistant for the CNEAv5 system. Help researchers configure hardware, manage experiments, and analyze neural data."
                    className="w-full bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2 text-sm text-neural-text-primary resize-none"
                  />
                </div>

                <button
                  onClick={handleSaveSettings}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-neural-accent-cyan/20 text-neural-accent-cyan hover:bg-neural-accent-cyan/30 border border-neural-accent-cyan/30 neural-transition"
                >
                  <Save className="w-4 h-4" />
                  {savedNotice ? "Saved!" : "Save Settings"}
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
                  <div className="grid grid-cols-2 gap-4 text-xs">
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
                  <div className="grid grid-cols-3 gap-4 text-xs">
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
                  <div className="grid grid-cols-2 gap-4 text-xs">
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
