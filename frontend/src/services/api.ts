import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("auth_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("auth_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

/* ─── API Methods ─── */

export const recordingApi = {
  start: (config: Record<string, unknown>) => api.post("/recordings/start", config),
  stop: (id: string) => api.post(`/recordings/${id}/stop`),
  list: (params?: Record<string, unknown>) => api.get("/recordings", { params }),
  get: (id: string) => api.get(`/recordings/${id}`),
  delete: (id: string) => api.delete(`/recordings/${id}`),
};

export const experimentApi = {
  list: (params?: Record<string, unknown>) => api.get("/experiments", { params }),
  get: (id: string) => api.get(`/experiments/${id}`),
  create: (data: Record<string, unknown>) => api.post("/experiments", data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/experiments/${id}`, data),
  delete: (id: string) => api.delete(`/experiments/${id}`),
};

export const hardwareApi = {
  getConfig: () => api.get("/hardware/config"),
  setConfig: (config: Record<string, unknown>) => api.put("/hardware/config", config),
  getPresets: () => api.get("/hardware/presets"),
  loadPreset: (id: string) => api.post(`/hardware/presets/${id}/load`),
  savePreset: (data: Record<string, unknown>) => api.post("/hardware/presets", data),
  getStatus: () => api.get("/hardware/status"),
};

export const agentApi = {
  list: () => api.get("/agents"),
  getHealth: (name: string) => api.get(`/agents/${name}/health`),
  restart: (name: string) => api.post(`/agents/${name}/restart`),
};

export const chatApi = {
  send: (message: string, sessionId?: string) =>
    api.post("/chat", { message, sessionId }),
  getHistory: (sessionId: string) => api.get(`/chat/${sessionId}/history`),
  streamUrl: (sessionId: string) => `/api/chat/${sessionId}/stream`,
};

export const analysisApi = {
  runSpikeSort: (recordingId: string, params: Record<string, unknown>) =>
    api.post(`/analysis/spike-sort`, { recordingId, ...params }),
  getResults: (analysisId: string) => api.get(`/analysis/${analysisId}`),
  list: (params?: Record<string, unknown>) => api.get("/analysis", { params }),
};

export default api;
