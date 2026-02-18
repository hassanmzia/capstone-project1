import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface Agent {
  name: string;
  status: "online" | "degraded" | "offline" | "error";
  lastHeartbeat: string;
  uptime: number;
  cpuUsage: number;
  memoryUsage: number;
  version: string;
  taskQueue: number;
}

interface AgentState {
  agents: Agent[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

const initialState: AgentState = {
  agents: [
    {
      name: "hardware-agent",
      status: "online",
      lastHeartbeat: new Date().toISOString(),
      uptime: 86400,
      cpuUsage: 12,
      memoryUsage: 45,
      version: "1.0.0",
      taskQueue: 0,
    },
    {
      name: "recording-agent",
      status: "online",
      lastHeartbeat: new Date().toISOString(),
      uptime: 86400,
      cpuUsage: 8,
      memoryUsage: 32,
      version: "1.0.0",
      taskQueue: 0,
    },
    {
      name: "analysis-agent",
      status: "online",
      lastHeartbeat: new Date().toISOString(),
      uptime: 86400,
      cpuUsage: 5,
      memoryUsage: 28,
      version: "1.0.0",
      taskQueue: 0,
    },
    {
      name: "llm-agent",
      status: "online",
      lastHeartbeat: new Date().toISOString(),
      uptime: 86400,
      cpuUsage: 15,
      memoryUsage: 60,
      version: "1.0.0",
      taskQueue: 0,
    },
    {
      name: "storage-agent",
      status: "online",
      lastHeartbeat: new Date().toISOString(),
      uptime: 86400,
      cpuUsage: 3,
      memoryUsage: 20,
      version: "1.0.0",
      taskQueue: 0,
    },
  ],
  isLoading: false,
  error: null,
  lastUpdated: null,
};

const agentSlice = createSlice({
  name: "agents",
  initialState,
  reducers: {
    setAgents(state, action: PayloadAction<Agent[]>) {
      state.agents = action.payload;
      state.lastUpdated = new Date().toISOString();
    },
    updateAgent(state, action: PayloadAction<Partial<Agent> & { name: string }>) {
      const idx = state.agents.findIndex((a) => a.name === action.payload.name);
      if (idx >= 0) {
        Object.assign(state.agents[idx], action.payload);
      }
      state.lastUpdated = new Date().toISOString();
    },
    setAgentStatus(state, action: PayloadAction<{ name: string; status: Agent["status"] }>) {
      const agent = state.agents.find((a) => a.name === action.payload.name);
      if (agent) {
        agent.status = action.payload.status;
        agent.lastHeartbeat = new Date().toISOString();
      }
    },
    setAgentsLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },
    setAgentsError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
  },
});

export const {
  setAgents, updateAgent, setAgentStatus, setAgentsLoading, setAgentsError,
} = agentSlice.actions;

export default agentSlice.reducer;
