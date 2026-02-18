# CNEAv5 Neural Interfacing System — Full Upgrade Plan & Blueprint

## Executive Summary

Transform the existing monolithic Python/PyQt5 desktop GUI into a **professional-grade, multi-agent, web-based neural interfacing platform** using a modern stack: Django + PostgreSQL backend, React + TypeScript frontend, Docker Compose orchestration, MCP/A2A multi-agent architecture, and **LLM-powered conversational control** (DeepSeek-R1:7b via Ollama on RTX 5090) with RAG-based institutional memory for real-time neural data acquisition, processing, visualization, and AI-assisted analysis.

**Access URL:** `http://172.168.1.95:3025`

### Agentic Framework Stack
| Layer | Framework | Purpose |
|-------|-----------|---------|
| **LLM Agent Orchestration** | **LangGraph** | Stateful multi-agent workflows, MCP tool-calling, conditional routing |
| **Observability/Tracing** | **LangFuse** (self-hosted) | Trace all LLM calls, latency, token usage, prompt management |
| **A2A Communication** | **Google A2A Python SDK** | Agent discovery, agent cards, task protocol |
| **MCP Integration** | **MCP Python SDK** | Tool/resource registration, protocol compliance |
| **LLM Provider** | **Ollama** (DeepSeek-R1:7b) | Chat, reasoning, tool calling (localhost:12434, RTX 5090) |
| **Embeddings** | **Ollama** (nomic-embed-text) | RAG vector embeddings (768 dims) |
| **Vector Store** | **pgvector** (PostgreSQL extension) | Similarity search for RAG |
| **Data Pipeline Agents** | **FastAPI** | Raw performance agents — no LLM overhead |

---

## 1. EXISTING FEATURES INVENTORY (Preserved & Enhanced)

All existing features from the current PyQt5 GUI will be preserved and enhanced:

| # | Existing Feature | Current Implementation | Upgrade Plan |
|---|-----------------|----------------------|--------------|
| 1 | **Real-time 4,096-channel recording** | PyQt5 + multiprocessing + shared memory | WebSocket streaming + WebGL rendering |
| 2 | **FPGA communication (Opal Kelly USB 3.0)** | ok.py bindings, direct USB | Dedicated Data Acquisition Agent (Python microservice) |
| 3 | **Spike detection** (σ-threshold, per-site) | In-process NumPy computation | Signal Processing Agent with GPU acceleration |
| 4 | **Stimulation control** (DC/AC/Pulse/Arbitrary) | Direct FPGA wire writes | Hardware Control Agent with REST + WebSocket API |
| 5 | **PCB ADC monitoring** (8-channel ADS8688) | Shared memory display | Real-time dashboard with WebSocket |
| 6 | **HDF5 data recording** | PyTables append | Storage Agent with HDF5 + PostgreSQL metadata |
| 7 | **Spike heatmap visualization** | PyQtGraph 2D heatmap | WebGL interactive 3D/2D heatmap |
| 8 | **Bias configuration** (20 parameters) | QDoubleSpinBox widgets | Web form with presets, history, validation |
| 9 | **Clock configuration** (CLK1-3, PG, Data) | Direct FPGA writes | Configurable via API with real-time feedback |
| 10 | **Waveform generator** (arbitrary, 2048 pts) | Upload to FPGA RAM | Web-based waveform designer with drag/preview |
| 11 | **Pixel/array configuration** (64×64) | CSV-based pixel selection | Interactive electrode array map GUI |
| 12 | **Temperature monitoring** | PCB ADC readout | Real-time telemetry dashboard |
| 13 | **Noise reduction** (common-mode subtraction) | Toggle flag | Configurable pipeline with multiple algorithms |
| 14 | **Multi-process data pipeline** | Python multiprocessing | Docker-based microservices with message queues |
| 15 | **TIA configuration** (Ref, Temp, LPF, Mux) | GUI controls | Web form with validation and presets |
| 16 | **Gain mode selection** (GainX40/100/300) | Dropdown selector | Enhanced with auto-calibration suggestions |
| 17 | **Duration-based recording** | Timer with auto-stop | Scheduled recordings with calendar integration |
| 18 | **Site selection & display** | List widget + pyqtgraph | Interactive electrode map with click-to-select |
| 19 | **Spiking sites list** | QListWidget with counts | Sortable/filterable data table with export |
| 20 | **DC level visualization** | pyqtgraph bar chart | Interactive heatmap with threshold alerts |

---

## 2. SYSTEM ARCHITECTURE

### 2.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        DOCKER COMPOSE NETWORK                          │
│                                                                         │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────────────┐   │
│  │  Frontend    │    │  API Gateway │    │   MCP Orchestrator       │   │
│  │  React/TS    │◄──►│  Node.js BFF │◄──►│   (Django)               │   │
│  │  Port: 3025  │    │  Port: 3026  │    │   Port: 8085             │   │
│  └─────────────┘    └──────────────┘    └──────────┬───────────────┘   │
│                                                     │                   │
│                          ┌──────────────────────────┼──────────┐       │
│                          │    A2A Message Bus        │          │       │
│                          │    (Redis Pub/Sub)        │          │       │
│                          │    Port: 6385             │          │       │
│                          └──────┬───────┬────────┬──┘          │       │
│                                 │       │        │             │       │
│  ┌──────────────┐  ┌───────────┴─┐  ┌──┴────────┴──┐  ┌──────┴────┐ │
│  │ Data Acq     │  │ Signal Proc │  │ Hardware Ctrl │  │ Storage   │ │
│  │ Agent        │  │ Agent       │  │ Agent         │  │ Agent     │ │
│  │ Port: 8088   │  │ Port: 8089  │  │ Port: 8090    │  │ Port: 8091│ │
│  │ (Python)     │  │ (Python)    │  │ (Python)      │  │ (Python)  │ │
│  └──────┬───────┘  └─────────────┘  └───────────────┘  └─────┬────┘ │
│         │                                                      │      │
│         │ USB 3.0                                              │      │
│  ┌──────┴───────┐                                    ┌─────────┴───┐ │
│  │ Opal Kelly   │                                    │ PostgreSQL  │ │
│  │ FPGA Device  │                                    │ + TimescaleDB│ │
│  │ (Host Mount) │                                    │ Port: 5435  │ │
│  └──────────────┘                                    └─────────────┘ │
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐                                  │
│  │ AI/ML Agent  │  │ Notification │                                  │
│  │ Port: 8092   │  │ Agent        │                                  │
│  │ (Python)     │  │ Port: 8093   │                                  │
│  └──────────────┘  └──────────────┘                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Port Allocation (All Non-Default)

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| **React Frontend** | 3025 | HTTP | Main web UI |
| **Node.js BFF (Backend-for-Frontend)** | 3026 | HTTP/WS | API aggregation, WebSocket proxy |
| **Django API** | 8085 | HTTP | REST API + Django Channels (WebSocket) |
| **PostgreSQL + TimescaleDB** | 5435 | TCP | Relational + time-series database |
| **Redis** | 6385 | TCP | Message broker, cache, pub/sub |
| **Data Acquisition Agent** | 8088 | HTTP/gRPC | FPGA data streaming |
| **Signal Processing Agent** | 8089 | HTTP/gRPC | Spike detection, filtering, FFT |
| **Hardware Control Agent** | 8090 | HTTP | FPGA configuration, DAC, stimulation |
| **Storage Agent** | 8091 | HTTP | Data persistence, HDF5, export |
| **AI/ML Agent** | 8092 | HTTP | Neural decoding, pattern recognition |
| **Notification Agent** | 8093 | HTTP | Alerts, email, system notifications |
| **LLM Agent (LangGraph)** | 8094 | HTTP/WS | Conversational control, RAG, report generation |
| **LangFuse** | 8095 | HTTP | LLM observability dashboard |
| **MCP Server** | 8087 | HTTP | Model Context Protocol registry |
| **Ollama** | 12434 | HTTP | LLM inference (host network, existing) |
| **Nginx Reverse Proxy** | 3025 | HTTP | Entry point (shared with frontend) |

---

## 3. MULTI-AGENT SYSTEM DESIGN

### 3.1 Agent Definitions

#### Agent 1: Data Acquisition Agent (Python)
**Port:** 8088
**Responsibility:** Interface with Opal Kelly FPGA hardware via USB 3.0
**MCP Tools Exposed:**
- `start_recording` — Begin data acquisition with specified parameters
- `stop_recording` — End data acquisition
- `get_stream_status` — Current throughput, buffer utilization, packet loss
- `configure_ddr3` — DDR3 buffer management
- `read_fpga_data` — Raw data block read from DDR3 FIFO

**A2A Communication:**
- Publishes raw data chunks to Redis streams → consumed by Signal Processing Agent and Storage Agent
- Receives configuration commands from Hardware Control Agent

**Key Implementation:**
```python
# Preserves existing CNEAv5.py + ok.py logic
# Wraps in FastAPI service with WebSocket streaming
# Ring buffer: 160 MB (2 sec @ 80 MB/s) in shared memory
# Lock-free producer: USB read thread → ring buffer
# Consumers: Redis publisher, file writer
```

#### Agent 2: Signal Processing Agent (Python)
**Port:** 8089
**Responsibility:** Real-time neural signal analysis
**MCP Tools Exposed:**
- `detect_spikes` — Run spike detection on incoming data
- `compute_fft` — Frequency-domain analysis
- `filter_signal` — Apply bandpass/notch/LP/HP filters
- `compute_statistics` — RMS, SNR, noise floor per channel
- `reduce_noise` — Common-mode subtraction and artifact removal

**A2A Communication:**
- Subscribes to raw data from Data Acquisition Agent
- Publishes processed data + spike events to Redis → consumed by Frontend via WebSocket
- Receives processing parameter updates from Orchestrator

#### Agent 3: Hardware Control Agent (Python)
**Port:** 8090
**Responsibility:** FPGA configuration and stimulation control
**MCP Tools Exposed:**
- `configure_bias` — Set all 20 bias parameters
- `configure_pixels` — Array/pixel selection and configuration
- `set_stimulation` — DC/AC/Pulse/Arbitrary waveform configuration
- `set_clocks` — Clock divider configuration
- `set_gain_mode` — Amplifier gain selection
- `configure_tia` — TIA reference, temperature, LPF, mux settings
- `upload_waveform` — Arbitrary waveform upload to FPGA
- `trigger_stimulation` — Start/stop stimulation
- `get_device_info` — FPGA device status and identification

**A2A Communication:**
- Receives commands from Orchestrator and Frontend
- Sends configuration acknowledgments and status updates

#### Agent 4: Storage Agent (Python)
**Port:** 8091
**Responsibility:** Data persistence and retrieval
**MCP Tools Exposed:**
- `save_recording` — Store raw data to HDF5 with metadata
- `export_data` — Export to CSV, MAT, NWB formats
- `query_recordings` — Search recordings by date, device, experiment
- `get_recording_metadata` — Retrieve recording parameters
- `manage_storage` — Disk usage monitoring, cleanup policies
- `stream_to_cloud` — Optional cloud backup (S3-compatible)

**A2A Communication:**
- Subscribes to raw data streams from Data Acquisition Agent
- Receives save/export commands from Orchestrator
- Publishes storage status events

#### Agent 5: AI/ML Agent (Python)
**Port:** 8092
**Responsibility:** Neural pattern analysis and intelligent recommendations
**MCP Tools Exposed:**
- `classify_spikes` — Spike sorting via template matching or ML
- `detect_anomalies` — Identify artifacts, electrode failures, unusual patterns
- `predict_optimal_params` — Suggest bias/gain/threshold based on signal quality
- `neural_decode` — Basic decoding of neural population activity
- `generate_report` — Automated experiment summary with statistics

**A2A Communication:**
- Subscribes to processed data from Signal Processing Agent
- Publishes analysis results and recommendations
- Receives configuration from Orchestrator

#### Agent 6: Notification Agent (Python)
**Port:** 8093
**Responsibility:** Alerts, monitoring, and system health
**MCP Tools Exposed:**
- `send_alert` — Email/Slack/webhook notification
- `set_threshold_alert` — Configure automatic alerts for data quality
- `get_system_health` — CPU, memory, disk, USB bandwidth metrics
- `log_event` — Structured event logging

**A2A Communication:**
- Subscribes to all agent status channels
- Monitors system health metrics
- Publishes alerts when thresholds exceeded

#### Agent 7: LLM Agent (LangGraph + Ollama)
**Port:** 8094
**Responsibility:** Conversational system control, RAG-based knowledge retrieval, report generation
**LLM:** DeepSeek-R1:7b via Ollama (localhost:12434, RTX 5090 GPU)
**Embedding Model:** nomic-embed-text via Ollama (768 dims, ~0.5 GB VRAM)

**MCP Tools Exposed:**
- `chat` — Natural language conversation with tool-calling capability
- `query_knowledge` — RAG search across experiment history
- `generate_report` — LLM-generated experiment reports
- `suggest_parameters` — AI parameter optimization with explanations
- `explain_anomaly` — Natural language explanation of detected anomalies
- `natural_language_query` — Convert natural language to data queries

**A2A Communication:**
- Has access to ALL other agents' MCP tools (routes via LangGraph tool-calling)
- Subscribes to anomaly events from AI/ML Agent for auto-explanation
- Publishes chat responses via WebSocket to frontend

**LangGraph State Machine:**
```
User Input
    │
    ▼
┌───────────┐     ┌──────────────┐     ┌─────────────────┐
│  Router   │────►│  Tool Caller │────►│  Response Gen   │
│  (intent  │     │  (MCP tools  │     │  (format answer │
│  classify)│     │   via A2A)   │     │   for user)     │
└───────────┘     └──────────────┘     └─────────────────┘
    │                                          │
    │  "analyze"        "remember"             │
    ▼                   ▼                      │
┌───────────┐  ┌───────────────┐               │
│  RAG Query│  │  Memory Write │               │
│  (pgvector│  │  (store new   │               │
│   search) │  │   knowledge)  │───────────────┘
└───────────┘  └───────────────┘
```

**Conversational Features:**
- *"Start recording at 10kHz with gain x100 on the frontal array"* → parses intent, calls MCP tools
- *"What bias settings worked best for cortical recordings?"* → RAG search + summarize
- *"Show me all recordings with spike rate above 50 Hz"* → generates SQL/filters
- *"My signals look noisy on channels 200-250, what should I adjust?"* → RAG + parameter suggestion
- *"Generate a summary report for today's experiments"* → report generation with LLM

### 3.1.1 LangGraph Memory Design

#### Short-Term Memory (Within a Session)

Conversation state that lives for the duration of a single user session, managed by LangGraph's state graph.

```
┌─────────────────────────────────────────────────────┐
│  LangGraph State (Short-Term Memory)                │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │  messages: [                                    │ │
│  │    {role: "user", content: "Start recording"},  │ │
│  │    {role: "ai", content: "Recording started",   │ │
│  │     tool_calls: [{name: "start_recording"}]},   │ │
│  │    ...                                          │ │
│  │  ]                                              │ │
│  ├────────────────────────────────────────────────┤ │
│  │  system_context: {                              │ │
│  │    active_recording: true,                      │ │
│  │    recording_id: 47,                            │ │
│  │    device: "CNEAv5_Unit3",                      │ │
│  │    current_config: {gain: "x100", ...},         │ │
│  │    selected_channels: [200, 201, 202],          │ │
│  │    last_spike_rates: {200: 45.2, 201: 12.1},   │ │
│  │  }                                              │ │
│  ├────────────────────────────────────────────────┤ │
│  │  tool_results: [                                │ │
│  │    {tool: "get_spike_rate", result: {...}},      │ │
│  │    {tool: "get_signal_quality", result: {...}},  │ │
│  │  ]                                              │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  Lifetime: Single session                            │
│  Storage: Redis (fast) + PostgreSQL checkpoint       │
│  Summarization: After ~50 messages, older messages   │
│  are summarized by LLM into compact context          │
└─────────────────────────────────────────────────────┘
```

**LangGraph Checkpointer (Session Persistence):**
```python
from langgraph.checkpoint.postgres import PostgresSaver

checkpointer = PostgresSaver(conn_string="postgresql://...@postgres:5432/neural_interface")
graph = StateGraph(NeuralAssistantState)
app = graph.compile(checkpointer=checkpointer)

# User can close browser, come back, resume where they left off
config = {"configurable": {"thread_id": f"user_{user_id}_session_{session_id}"}}
result = app.invoke({"messages": [user_message]}, config)
```

#### Long-Term Memory (Across Sessions — Permanent)

Persists forever in PostgreSQL + pgvector. Divided into three types:

**1. Semantic Memory (pgvector embeddings) — "What does the system know?"**
- Past experiment summaries (auto-embedded after each recording)
- Successful parameter configurations + their outcomes
- Known electrode issues (e.g., "site 1847 = noisy since Feb 10")
- Troubleshooting solutions that worked

**2. Episodic Memory (structured DB records) — "What happened before?"**
- Full session history with timestamps
- Configuration change events
- Anomaly occurrences + resolutions
- User interactions with outcomes

**3. Procedural Memory (learned preferences) — "How does this user work?"**
- Dr. Wang always uses gain x100 for cortical recordings
- Dr. Wang prefers spike threshold at 4σ not 5σ
- Lab protocol: always run impedance test first
- Default export format: NWB (not HDF5)

**Memory Interaction Flow:**
```
User: "Set up for an in-vivo recording like last Tuesday"
         │
         ▼
  SHORT-TERM: Current context (device, no active recording)
         │
         ▼
  LONG-TERM SEMANTIC (RAG): Vector search → found Exp #42, Feb 10
         │
         ▼
  LONG-TERM PROCEDURAL: User preferences (impedance check first, 4σ)
         │
         ▼
  LLM RESPONSE: "I'll set up like Experiment #42:
    1. Run impedance check first (your standard protocol)
    2. Load invivo_v2 bias preset
    3. Set gain x300, threshold 4σ (your preference)
    Shall I proceed?"
```

### 3.1.2 RAG (Retrieval-Augmented Generation) System

#### RAG Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     RAG Pipeline                              │
│                                                               │
│  User Query → Embed (nomic-embed-text via Ollama)            │
│                    │                                          │
│                    ▼                                          │
│            pgvector Similarity Search                         │
│            (Top-K relevant documents)                         │
│                    │                                          │
│                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  LLM Prompt = System Prompt + Retrieved Docs + Query    │ │
│  │  Model: DeepSeek-R1:7b via Ollama                       │ │
│  └─────────────────────────────────────────────────────────┘ │
│                    │                                          │
│                    ▼                                          │
│              Grounded Response                                │
│  (Answer with citations from actual experiment history)       │
└──────────────────────────────────────────────────────────────┘
```

#### RAG Document Sources

| Source | Auto-indexed | Example Content |
|--------|-------------|-----------------|
| **Experiment summaries** | After each recording completes | "Exp #42: gain x300, BP_OTA=1.5V, cortical, SNR=12.3 dB" |
| **Config snapshots** | On every config change | "All 20 bias values + gain + clock + outcome" |
| **Researcher annotations** | When user adds notes | "Channel 200-250 noise fixed by regrounding" |
| **Troubleshooting history** | On anomaly resolution | "USB dropout at 80 MB/s → reduced buffer to 60" |
| **Chat conversations** | After each session | Past Q&A pairs with tool call results |
| **Protocol documents** | Manual upload | SOPs, hardware docs, safety limits |

#### RAG Database Schema

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Document store for RAG
CREATE TABLE rag_documents (
    id SERIAL PRIMARY KEY,
    source_type VARCHAR(50) NOT NULL,
    -- 'experiment', 'config', 'annotation', 'troubleshooting', 'protocol', 'chat'
    source_id INTEGER,
    title VARCHAR(500),
    content TEXT NOT NULL,
    embedding vector(768),         -- nomic-embed-text produces 768-dim vectors
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for fast similarity search
CREATE INDEX ON rag_documents
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Chat history (also searchable via RAG)
CREATE TABLE chat_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    session_id VARCHAR(100),
    role VARCHAR(20) NOT NULL,       -- 'user', 'assistant', 'system', 'tool'
    content TEXT NOT NULL,
    tool_calls JSONB,
    embedding vector(768),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON chat_history
    USING hnsw (embedding vector_cosine_ops);
```

#### Embedding Pipeline

```
New Data Created (experiment, annotation, config change)
        │
        ▼
  Chunking (~500 tokens, overlapping, with metadata)
        │
        ▼
  Ollama Embedding: POST http://localhost:12434/api/embeddings
  Model: nomic-embed-text (768 dims, ~0.5 GB VRAM)
        │
        ▼
  pgvector INSERT into rag_documents table
```

#### When RAG Triggers Automatically

| User Action | RAG Behavior |
|-------------|-------------|
| Asks question in chat | Search experiment history + troubleshooting for context |
| Starts new experiment | Retrieve similar past experiments + outcomes |
| Anomaly detected | Search for past occurrences + solutions |
| Generates report | Pull related annotations, configs, quality metrics |
| Changes parameters | Find past recordings with similar params + results |
| Views noisy channel | Search for past fixes for that electrode/region |

#### Example RAG Flow

```
Dr. Wang: "I'm getting noise on channels 200-250 again, what worked last time?"

Step 1: Embed query → 768-dim vector via nomic-embed-text
Step 2: pgvector cosine similarity search (top 5):
   → [0.94] "2026-01-15: Noise on ch200-250 resolved by adjusting BP_OTA 1.2V→1.5V"
   → [0.89] "2025-12-20: Ch200-260 60Hz artifact, fixed with notch filter + re-grounding"
   → [0.85] "2026-02-01: Intermittent noise ch200-250, loose PCB connector"

Step 3: LLM generates grounded answer:
   "Based on previous sessions, noise on channels 200-250 has been resolved three ways:
    1. Most recently (Jan 15): Adjusting BP_OTA from 1.2V to 1.5V — most effective
    2. Dec 20: 60 Hz line noise removed with notch filter + ground check
    3. Feb 1: Loose PCB connector caused intermittent noise
    Shall I adjust BP_OTA to 1.5V?"
```

#### Ollama GPU Configuration (RTX 5090)

| Model | Purpose | VRAM Usage | Concurrent |
|-------|---------|------------|------------|
| `deepseek-r1:7b` | Chat, reasoning, tool calling | ~6 GB | Yes |
| `nomic-embed-text` | RAG vector embeddings | ~0.5 GB | Yes |
| **Total** | | **~6.5 GB** | RTX 5090 has 32 GB — plenty of headroom |

#### Agent 8: MCP Orchestrator (Django)
**Port:** 8085
**Responsibility:** Central coordination, user management, experiment management
**MCP Server Role:**
- Maintains agent registry (discovery, health checks, capabilities)
- Routes tool calls to appropriate agents
- Manages agent lifecycle (start, stop, restart, scale)
- Provides unified API for frontend

**Features:**
- User authentication and role-based access control (RBAC)
- Experiment management (create, configure, run, review)
- Configuration presets and templates
- Audit logging of all operations
- WebSocket gateway for real-time data to frontend

### 3.2 MCP (Model Context Protocol) Implementation

```
┌─────────────────────────────────────────────────┐
│              MCP Server (Django)                 │
│              Port: 8087                          │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │  Tool Registry                               │ │
│  │  ┌─────────────┐  ┌──────────────────────┐  │ │
│  │  │ Agent Tools  │  │  Agent Resources     │  │ │
│  │  │ • start_rec  │  │  • live_data_stream  │  │ │
│  │  │ • stop_rec   │  │  • spike_events      │  │ │
│  │  │ • set_bias   │  │  • system_metrics    │  │ │
│  │  │ • detect_sp  │  │  • recording_list    │  │ │
│  │  │ • etc...     │  │  • config_presets    │  │ │
│  │  └─────────────┘  └──────────────────────┘  │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │  Prompt Templates                            │ │
│  │  • "Analyze recording quality"               │ │
│  │  • "Optimize parameters for in-vivo"         │ │
│  │  • "Generate experiment report"              │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**MCP Protocol Flow:**
1. Each agent registers its tools/resources with MCP Server on startup
2. Frontend or external clients discover available tools via MCP
3. Tool calls are routed through MCP Server to appropriate agent
4. Results are returned via MCP response format
5. Resources (live data streams) are accessible via MCP resource protocol

### 3.3 A2A (Agent-to-Agent) Communication

**Message Bus:** Redis Streams + Pub/Sub (Port 6385)

**Channel Structure:**
```
neural:raw_data         — Raw FPGA data chunks (Acq → Processing, Storage)
neural:processed_data   — Processed waveforms (Processing → Frontend)
neural:spike_events     — Detected spikes (Processing → Frontend, AI/ML)
neural:pcb_data         — PCB ADC readings (Acq → Frontend)
neural:commands          — Hardware commands (Orchestrator → HW Control)
neural:config_updates   — Configuration changes (HW Control → All)
neural:alerts           — System alerts (Notification → All)
neural:agent_health     — Health heartbeats (All → Orchestrator)
neural:ml_results       — ML analysis results (AI/ML → Frontend)
```

**A2A Protocol:**
```json
{
  "message_id": "uuid",
  "source_agent": "signal_processing",
  "target_agent": "frontend",
  "timestamp": "ISO8601",
  "type": "spike_event",
  "payload": {
    "site_id": 1234,
    "timestamp_samples": 512000,
    "amplitude": -0.245,
    "threshold": 0.180
  }
}
```

---

## 4. DATABASE SCHEMA (PostgreSQL + TimescaleDB)

### 4.1 Core Tables

```sql
-- User management
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(150) UNIQUE NOT NULL,
    email VARCHAR(254),
    password_hash VARCHAR(128),
    role VARCHAR(20) DEFAULT 'researcher',  -- admin, researcher, viewer
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Experiment management
CREATE TABLE experiments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    device_name VARCHAR(100),
    experiment_mode VARCHAR(50),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'draft'  -- draft, running, completed, failed
);

-- Recording sessions
CREATE TABLE recordings (
    id SERIAL PRIMARY KEY,
    experiment_id INTEGER REFERENCES experiments(id),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    duration_seconds FLOAT,
    sample_rate FLOAT NOT NULL,
    channel_count INTEGER DEFAULT 4096,
    file_path VARCHAR(500),  -- HDF5 file location
    file_size_bytes BIGINT,
    total_samples BIGINT,
    total_spikes BIGINT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'recording',
    metadata JSONB DEFAULT '{}'
);

-- Hardware configuration snapshots
CREATE TABLE hardware_configs (
    id SERIAL PRIMARY KEY,
    recording_id INTEGER REFERENCES recordings(id),
    name VARCHAR(255),
    bias_params JSONB NOT NULL,   -- All 20 bias values
    clock_config JSONB NOT NULL,  -- CLK1-3, PG, Data dividers
    gain_mode VARCHAR(50),
    pixel_config JSONB,           -- Active pixel map
    tia_config JSONB,             -- TIA settings
    stim_config JSONB,            -- Stimulation parameters
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Configuration presets (reusable templates)
CREATE TABLE config_presets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50),  -- bias, clock, pixel, stimulation, full
    config_data JSONB NOT NULL,
    created_by INTEGER REFERENCES users(id),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spike events (TimescaleDB hypertable for time-series)
CREATE TABLE spike_events (
    time TIMESTAMPTZ NOT NULL,
    recording_id INTEGER NOT NULL,
    site_id INTEGER NOT NULL,
    amplitude FLOAT,
    threshold FLOAT,
    sample_index BIGINT
);
SELECT create_hypertable('spike_events', 'time');

-- System telemetry (TimescaleDB hypertable)
CREATE TABLE system_telemetry (
    time TIMESTAMPTZ NOT NULL,
    agent_name VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value FLOAT NOT NULL,
    metadata JSONB DEFAULT '{}'
);
SELECT create_hypertable('system_telemetry', 'time');

-- Audit log
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INTEGER,
    details JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Electrode site metadata
CREATE TABLE electrode_sites (
    id SERIAL PRIMARY KEY,
    site_index INTEGER UNIQUE NOT NULL,  -- 0-4095
    row_index INTEGER NOT NULL,          -- 0-63
    col_index INTEGER NOT NULL,          -- 0-63
    is_stim_capable BOOLEAN DEFAULT FALSE,
    impedance_ohms FLOAT,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'active'  -- active, noisy, dead
);

-- Waveform library
CREATE TABLE waveforms (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    waveform_type VARCHAR(50),  -- sine, square, pulse, arbitrary
    sample_count INTEGER NOT NULL,
    sample_data JSONB NOT NULL,  -- Array of voltage values
    parameters JSONB,           -- Frequency, amplitude, duty cycle, etc.
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Annotation/notes on recordings
CREATE TABLE annotations (
    id SERIAL PRIMARY KEY,
    recording_id INTEGER REFERENCES recordings(id),
    timestamp_offset FLOAT,  -- Seconds from recording start
    annotation_type VARCHAR(50),  -- event, note, artifact, marker
    content TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. FRONTEND ARCHITECTURE (React + TypeScript)

### 5.1 Application Structure

```
frontend/
├── public/
│   ├── index.html
│   └── favicon.ico
├── src/
│   ├── index.tsx
│   ├── App.tsx
│   ├── routes.tsx
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx              -- Main layout with sidebar/header
│   │   │   ├── Sidebar.tsx                -- Navigation sidebar
│   │   │   ├── Header.tsx                 -- Top bar with status indicators
│   │   │   └── StatusBar.tsx              -- Bottom status bar (connection, throughput)
│   │   │
│   │   ├── dashboard/
│   │   │   ├── DashboardPage.tsx          -- Main dashboard overview
│   │   │   ├── SystemHealthPanel.tsx      -- CPU, memory, USB bandwidth
│   │   │   ├── RecordingStatusPanel.tsx   -- Active recording info
│   │   │   ├── QuickActionsPanel.tsx      -- Start/stop, presets
│   │   │   └── RecentActivityPanel.tsx    -- Recent recordings, events
│   │   │
│   │   ├── visualization/
│   │   │   ├── WaveformDisplay.tsx        -- Multi-channel WebGL waveform renderer
│   │   │   ├── WaveformCanvas.tsx         -- WebGL canvas component
│   │   │   ├── SpikeHeatmap.tsx           -- 64×64 electrode spike heatmap
│   │   │   ├── SpikeSortingView.tsx       -- Spike cluster visualization
│   │   │   ├── FFTDisplay.tsx             -- Frequency-domain plots
│   │   │   ├── PCBDataDisplay.tsx         -- 8-channel PCB ADC display
│   │   │   ├── DCLevelDisplay.tsx         -- Per-electrode DC visualization
│   │   │   ├── ElectrodeArrayMap.tsx      -- Interactive 64×64 array
│   │   │   └── TelemetryDisplay.tsx       -- Throughput, latency, drops
│   │   │
│   │   ├── controls/
│   │   │   ├── RecordingControls.tsx      -- Start/stop/duration recording
│   │   │   ├── BiasConfigPanel.tsx        -- 20 bias parameter controls
│   │   │   ├── ClockConfigPanel.tsx       -- Clock divider settings
│   │   │   ├── TIAConfigPanel.tsx         -- TIA reference/temp/LPF/mux
│   │   │   ├── GainModeSelector.tsx       -- Gain mode dropdown
│   │   │   ├── StimulationPanel.tsx       -- DC/AC/Pulse/Arbitrary stim
│   │   │   ├── WaveformDesigner.tsx       -- Drag-to-create waveform editor
│   │   │   ├── PixelConfigPanel.tsx       -- Electrode selection/config
│   │   │   ├── SpikeDetectionPanel.tsx    -- Threshold, enable/disable
│   │   │   └── NoiseReductionPanel.tsx    -- CMR, filtering options
│   │   │
│   │   ├── experiments/
│   │   │   ├── ExperimentListPage.tsx     -- Browse/search experiments
│   │   │   ├── ExperimentDetailPage.tsx   -- Single experiment view
│   │   │   ├── NewExperimentWizard.tsx    -- Step-by-step experiment setup
│   │   │   ├── RecordingBrowser.tsx       -- Browse past recordings
│   │   │   └── RecordingPlayback.tsx      -- Replay recorded data
│   │   │
│   │   ├── analysis/
│   │   │   ├── AnalysisPage.tsx           -- Data analysis dashboard
│   │   │   ├── StatisticsPanel.tsx        -- RMS, SNR, noise floor
│   │   │   ├── ComparisonView.tsx         -- Compare recordings side-by-side
│   │   │   └── ReportGenerator.tsx        -- Auto-generate PDF reports
│   │   │
│   │   ├── chat/
│   │   │   ├── ChatPanel.tsx              -- Collapsible sidebar chat with LLM
│   │   │   ├── ChatMessage.tsx            -- Single message component
│   │   │   ├── ToolCallDisplay.tsx        -- Shows MCP tool calls inline
│   │   │   └── SuggestedActions.tsx       -- Quick action chips from LLM
│   │   │
│   │   ├── settings/
│   │   │   ├── SettingsPage.tsx           -- System settings
│   │   │   ├── PresetManager.tsx          -- Create/edit/apply config presets
│   │   │   ├── UserManagement.tsx         -- User RBAC management
│   │   │   ├── AgentMonitor.tsx           -- Agent health/status monitor
│   │   │   └── LLMSettings.tsx            -- LLM model config, RAG settings
│   │   │
│   │   └── common/
│   │       ├── WebGLRenderer.ts           -- Shared WebGL rendering utilities
│   │       ├── LODEngine.ts               -- Level-of-detail decimation
│   │       ├── RingBuffer.ts              -- Client-side ring buffer
│   │       └── ParameterSlider.tsx        -- Reusable parameter control
│   │
│   ├── hooks/
│   │   ├── useWebSocket.ts               -- WebSocket connection management
│   │   ├── useDataStream.ts              -- Real-time data stream hook
│   │   ├── useSpikeEvents.ts             -- Spike event subscription
│   │   ├── useRecording.ts               -- Recording state management
│   │   ├── useAgentStatus.ts             -- Agent health monitoring
│   │   └── useChat.ts                    -- LLM chat hook (send/receive/stream)
│   │
│   ├── services/
│   │   ├── api.ts                         -- REST API client (axios)
│   │   ├── websocket.ts                   -- WebSocket service
│   │   ├── mcpClient.ts                   -- MCP protocol client
│   │   └── dataDecoder.ts                 -- Binary data decoding
│   │
│   ├── store/
│   │   ├── index.ts                       -- Redux store configuration
│   │   ├── slices/
│   │   │   ├── recordingSlice.ts
│   │   │   ├── configSlice.ts
│   │   │   ├── visualizationSlice.ts
│   │   │   └── agentSlice.ts
│   │   └── middleware/
│   │       └── websocketMiddleware.ts     -- WS ↔ Redux bridge
│   │
│   ├── types/
│   │   ├── neural.ts                      -- Neural data types
│   │   ├── config.ts                      -- Configuration types
│   │   ├── agent.ts                       -- Agent protocol types
│   │   └── mcp.ts                         -- MCP message types
│   │
│   └── utils/
│       ├── decimation.ts                  -- LOD decimation algorithms
│       ├── colorMaps.ts                   -- Heatmap color palettes
│       ├── siteConversion.ts              -- 64×64 ↔ linear site mapping
│       └── formatters.ts                  -- Data formatting utilities
│
├── package.json
├── tsconfig.json
├── vite.config.ts
└── Dockerfile
```

### 5.2 Key Frontend Features

**A) WebGL Waveform Renderer (High Performance)**
- GPU-accelerated rendering using WebGL 2.0
- Level-of-detail (LOD): min/max per pixel column for decimation
- Supports 64+ concurrent channel display at 60 FPS
- Pan/zoom with < 100ms latency
- Color-coded channels with customizable themes

**B) Interactive Electrode Array Map**
- 64×64 clickable grid representing all 4,096 sites
- Color overlay: spike rate, DC level, impedance, noise
- Click to select/deselect channels for display
- Drag-select regions
- Right-click context menu (configure, annotate, mark as noisy)

**C) Real-time Data Pipeline (Browser)**
```
WebSocket (binary frames) → ArrayBuffer decode → Ring Buffer → LOD decimation → WebGL render
                                                                                    ↓
                                                                              60 FPS display
```
- Binary WebSocket transport (no JSON overhead for waveform data)
- Client-side ring buffer sized for 5 sec display window
- Decimation proportional to viewport pixels, not sample rate
- Separate update paths: waveforms (60 FPS) vs. spike map (10 FPS) vs. telemetry (1 FPS)

**D) Waveform Designer**
- Drag-and-drop waveform points
- Preset shapes: sine, square, triangle, sawtooth, custom
- Real-time preview with frequency/amplitude readout
- Export/import waveform configurations
- Upload to FPGA with one click

---

## 6. BACKEND ARCHITECTURE (Django + Node.js)

### 6.1 Django Backend (Port 8085)

```
backend/
├── manage.py
├── config/
│   ├── settings/
│   │   ├── base.py
│   │   ├── development.py
│   │   └── production.py
│   ├── urls.py
│   ├── asgi.py           -- Django Channels (WebSocket support)
│   └── wsgi.py
│
├── apps/
│   ├── users/            -- Authentication, RBAC
│   │   ├── models.py
│   │   ├── serializers.py
│   │   ├── views.py
│   │   ├── permissions.py
│   │   └── urls.py
│   │
│   ├── experiments/      -- Experiment & recording management
│   │   ├── models.py
│   │   ├── serializers.py
│   │   ├── views.py
│   │   └── urls.py
│   │
│   ├── hardware/         -- Hardware config & control API
│   │   ├── models.py
│   │   ├── serializers.py
│   │   ├── views.py
│   │   └── urls.py
│   │
│   ├── recordings/       -- Recording data management
│   │   ├── models.py
│   │   ├── serializers.py
│   │   ├── views.py
│   │   └── urls.py
│   │
│   ├── analysis/         -- Data analysis endpoints
│   │   ├── models.py
│   │   ├── views.py
│   │   └── urls.py
│   │
│   ├── agents/           -- Agent management & MCP
│   │   ├── models.py
│   │   ├── mcp_server.py
│   │   ├── a2a_bus.py
│   │   ├── registry.py
│   │   └── views.py
│   │
│   ├── presets/          -- Configuration presets
│   │   ├── models.py
│   │   ├── serializers.py
│   │   ├── views.py
│   │   └── urls.py
│   │
│   └── notifications/    -- Alert management
│       ├── models.py
│       ├── views.py
│       └── urls.py
│
├── channels/             -- Django Channels consumers
│   ├── neural_data.py    -- Real-time neural data WebSocket
│   ├── agent_status.py   -- Agent health WebSocket
│   └── routing.py
│
├── agents/               -- Agent microservice definitions
│   ├── base_agent.py     -- Base agent class
│   ├── data_acquisition/ -- Data Acquisition Agent
│   │   ├── agent.py
│   │   ├── fpga_interface.py   -- Wraps CNEAv5.py
│   │   ├── ring_buffer.py      -- Shared memory ring buffer
│   │   └── usb_reader.py       -- USB 3.0 read thread
│   │
│   ├── signal_processing/ -- Signal Processing Agent
│   │   ├── agent.py
│   │   ├── spike_detector.py
│   │   ├── filters.py
│   │   ├── fft_analyzer.py
│   │   └── noise_reduction.py
│   │
│   ├── hardware_control/  -- Hardware Control Agent
│   │   ├── agent.py
│   │   ├── bias_controller.py
│   │   ├── clock_controller.py
│   │   ├── stim_controller.py
│   │   └── pixel_controller.py
│   │
│   ├── storage/           -- Storage Agent
│   │   ├── agent.py
│   │   ├── hdf5_writer.py
│   │   ├── exporters.py
│   │   └── cloud_sync.py
│   │
│   ├── ai_ml/             -- AI/ML Agent
│   │   ├── agent.py
│   │   ├── spike_sorter.py
│   │   ├── anomaly_detector.py
│   │   └── report_generator.py
│   │
│   ├── notification/      -- Notification Agent
│   │   ├── agent.py
│   │   └── channels.py
│   │
│   └── llm/               -- LLM Agent (LangGraph)
│       ├── agent.py           -- FastAPI service wrapping LangGraph
│       ├── graph.py           -- LangGraph StateGraph definition
│       ├── nodes/
│       │   ├── router.py      -- Intent classification node
│       │   ├── tool_caller.py -- MCP tool invocation node
│       │   ├── rag_query.py   -- RAG retrieval node
│       │   ├── responder.py   -- Response generation node
│       │   └── memory.py      -- Memory read/write node
│       ├── memory/
│       │   ├── short_term.py  -- Session state management
│       │   ├── long_term.py   -- pgvector RAG store
│       │   └── procedural.py  -- User preference learning
│       ├── rag/
│       │   ├── embedder.py    -- Ollama embedding client
│       │   ├── indexer.py     -- Document chunking + indexing
│       │   ├── retriever.py   -- pgvector similarity search
│       │   └── pipeline.py    -- End-to-end RAG pipeline
│       └── tools/
│           ├── mcp_bridge.py  -- Bridge LangGraph tools ↔ MCP tools
│           └── sql_generator.py -- Natural language → SQL
│
├── mcp/                   -- MCP Protocol Implementation
│   ├── server.py          -- MCP Server
│   ├── tools.py           -- Tool registration
│   ├── resources.py       -- Resource definitions
│   └── prompts.py         -- Prompt templates
│
├── requirements.txt
└── Dockerfile
```

### 6.2 Node.js BFF (Port 3026)

```
bff/
├── src/
│   ├── index.ts
│   ├── routes/
│   │   ├── api.ts          -- Proxy to Django REST API
│   │   ├── ws.ts           -- WebSocket upgrader
│   │   └── health.ts       -- Health check endpoint
│   │
│   ├── middleware/
│   │   ├── auth.ts         -- JWT validation
│   │   ├── rateLimit.ts    -- Rate limiting
│   │   └── logger.ts       -- Request logging
│   │
│   ├── services/
│   │   ├── djangoProxy.ts  -- Django API proxy
│   │   ├── wsManager.ts    -- WebSocket connection manager
│   │   └── dataTransform.ts -- Binary data transformation
│   │
│   └── types/
│       └── index.ts
│
├── package.json
├── tsconfig.json
└── Dockerfile
```

**BFF Responsibilities:**
- Aggregate multiple Django API calls into single frontend requests
- WebSocket connection management with auto-reconnect
- Binary data frame encoding/decoding for waveform streaming
- Request caching and rate limiting
- Authentication token management

---

## 7. DOCKER COMPOSE CONFIGURATION

```yaml
# docker-compose.yml

services:
  # ============ DATABASE ============
  postgres:
    image: timescale/timescaledb:latest-pg16
    container_name: neural-postgres
    ports:
      - "5435:5432"
    environment:
      POSTGRES_DB: neural_interface
      POSTGRES_USER: neural_admin
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U neural_admin -d neural_interface"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ============ MESSAGE BROKER ============
  redis:
    image: redis:7-alpine
    container_name: neural-redis
    ports:
      - "6385:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s

  # ============ DJANGO BACKEND ============
  django:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: neural-django
    ports:
      - "8085:8085"
    environment:
      - DATABASE_URL=postgresql://neural_admin:${DB_PASSWORD}@postgres:5432/neural_interface
      - REDIS_URL=redis://redis:6379
      - DJANGO_SETTINGS_MODULE=config.settings.production
      - SECRET_KEY=${DJANGO_SECRET_KEY}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - recording_data:/app/data
      - ./backend:/app
    command: >
      sh -c "python manage.py migrate &&
             daphne -b 0.0.0.0 -p 8085 config.asgi:application"

  # ============ NODE.JS BFF ============
  bff:
    build:
      context: ./bff
      dockerfile: Dockerfile
    container_name: neural-bff
    ports:
      - "3026:3026"
    environment:
      - DJANGO_API_URL=http://django:8085
      - REDIS_URL=redis://redis:6379
      - PORT=3026
    depends_on:
      - django
      - redis

  # ============ REACT FRONTEND ============
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        - VITE_API_URL=http://172.168.1.95:3026
        - VITE_WS_URL=ws://172.168.1.95:3026/ws
    container_name: neural-frontend
    ports:
      - "3025:80"
    depends_on:
      - bff

  # ============ DATA ACQUISITION AGENT ============
  agent-data-acquisition:
    build:
      context: ./backend
      dockerfile: Dockerfile.agent
    container_name: neural-agent-acquisition
    ports:
      - "8088:8088"
    environment:
      - AGENT_NAME=data_acquisition
      - AGENT_PORT=8088
      - REDIS_URL=redis://redis:6379
      - MCP_SERVER_URL=http://django:8085/mcp
    depends_on:
      - redis
      - django
    volumes:
      - recording_data:/app/data
      - /dev/bus/usb:/dev/bus/usb      # USB passthrough for FPGA
    privileged: true                     # Required for USB access
    devices:
      - /dev/bus/usb:/dev/bus/usb

  # ============ SIGNAL PROCESSING AGENT ============
  agent-signal-processing:
    build:
      context: ./backend
      dockerfile: Dockerfile.agent
    container_name: neural-agent-processing
    ports:
      - "8089:8089"
    environment:
      - AGENT_NAME=signal_processing
      - AGENT_PORT=8089
      - REDIS_URL=redis://redis:6379
      - MCP_SERVER_URL=http://django:8085/mcp
    depends_on:
      - redis
      - django

  # ============ HARDWARE CONTROL AGENT ============
  agent-hardware-control:
    build:
      context: ./backend
      dockerfile: Dockerfile.agent
    container_name: neural-agent-hardware
    ports:
      - "8090:8090"
    environment:
      - AGENT_NAME=hardware_control
      - AGENT_PORT=8090
      - REDIS_URL=redis://redis:6379
      - MCP_SERVER_URL=http://django:8085/mcp
    depends_on:
      - redis
      - django
    volumes:
      - /dev/bus/usb:/dev/bus/usb
    privileged: true

  # ============ STORAGE AGENT ============
  agent-storage:
    build:
      context: ./backend
      dockerfile: Dockerfile.agent
    container_name: neural-agent-storage
    ports:
      - "8091:8091"
    environment:
      - AGENT_NAME=storage
      - AGENT_PORT=8091
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://neural_admin:${DB_PASSWORD}@postgres:5432/neural_interface
      - MCP_SERVER_URL=http://django:8085/mcp
    depends_on:
      - redis
      - django
      - postgres
    volumes:
      - recording_data:/app/data

  # ============ AI/ML AGENT ============
  agent-ai-ml:
    build:
      context: ./backend
      dockerfile: Dockerfile.agent
    container_name: neural-agent-aiml
    ports:
      - "8092:8092"
    environment:
      - AGENT_NAME=ai_ml
      - AGENT_PORT=8092
      - REDIS_URL=redis://redis:6379
      - MCP_SERVER_URL=http://django:8085/mcp
    depends_on:
      - redis
      - django

  # ============ NOTIFICATION AGENT ============
  agent-notification:
    build:
      context: ./backend
      dockerfile: Dockerfile.agent
    container_name: neural-agent-notification
    ports:
      - "8093:8093"
    environment:
      - AGENT_NAME=notification
      - AGENT_PORT=8093
      - REDIS_URL=redis://redis:6379
      - MCP_SERVER_URL=http://django:8085/mcp
      - SMTP_HOST=${SMTP_HOST}
      - SMTP_PORT=${SMTP_PORT}
    depends_on:
      - redis
      - django

  # ============ LLM AGENT (LangGraph) ============
  agent-llm:
    build:
      context: ./backend
      dockerfile: Dockerfile.agent
    container_name: neural-agent-llm
    ports:
      - "8094:8094"
    environment:
      - AGENT_NAME=llm
      - AGENT_PORT=8094
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://neural_admin:${DB_PASSWORD}@postgres:5432/neural_interface
      - MCP_SERVER_URL=http://django:8085/mcp
      - OLLAMA_BASE_URL=http://host.docker.internal:12434
      - OLLAMA_CHAT_MODEL=deepseek-r1:7b
      - OLLAMA_EMBED_MODEL=nomic-embed-text
      - LANGFUSE_HOST=http://langfuse:3100
      - LANGFUSE_PUBLIC_KEY=${LANGFUSE_PUBLIC_KEY}
      - LANGFUSE_SECRET_KEY=${LANGFUSE_SECRET_KEY}
    extra_hosts:
      - "host.docker.internal:host-gateway"   # Access host Ollama from container
    depends_on:
      - redis
      - django
      - postgres
      - langfuse

  # ============ LANGFUSE (LLM Observability) ============
  langfuse:
    image: langfuse/langfuse:2
    container_name: neural-langfuse
    ports:
      - "8095:3000"
    environment:
      - DATABASE_URL=postgresql://neural_admin:${DB_PASSWORD}@postgres:5432/langfuse
      - NEXTAUTH_SECRET=${LANGFUSE_NEXTAUTH_SECRET}
      - NEXTAUTH_URL=http://172.168.1.95:8095
      - SALT=${LANGFUSE_SALT}
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres_data:
  redis_data:
  recording_data:
```

---

## 8. NEW FEATURES (Business Value Enhancements)

### 8.1 Experiment Management System
- **Experiment Wizard:** Step-by-step guided setup for new experiments
- **Protocol Templates:** Pre-defined experimental protocols (in-vivo, in-vitro, impedance testing)
- **Experiment Scheduling:** Plan and queue experiments with calendar view
- **Collaborative Notes:** Multiple researchers can annotate experiments
- **Experiment Comparison:** Side-by-side comparison of results across experiments

### 8.2 Advanced Analytics & AI
- **Spike Sorting:** Automated template-matching and clustering-based spike sorting
- **Anomaly Detection:** ML-based detection of electrode failures, motion artifacts, noise bursts
- **Signal Quality Scoring:** Per-channel signal quality index (SNR, noise floor, impedance)
- **Automated Parameter Optimization:** AI suggests optimal bias/gain/threshold settings
- **Trend Analysis:** Track signal quality degradation over time

### 8.3 Data Management & Export
- **Multi-format Export:** HDF5, CSV, MAT (MATLAB), NWB (Neurodata Without Borders)
- **Recording Browser:** Search, filter, sort past recordings with previews
- **Data Tagging:** Tag recordings with custom labels for organization
- **Storage Analytics:** Disk usage monitoring, automatic archiving policies
- **Cloud Backup:** Optional S3-compatible cloud storage integration

### 8.4 Real-time Collaboration
- **Multi-user Access:** Multiple researchers view/control simultaneously
- **Role-Based Permissions:** Admin, Researcher, Viewer roles
- **Live Sharing:** Share real-time view via URL (view-only mode)
- **Activity Feed:** See who did what, when

### 8.5 System Monitoring & Reliability
- **Agent Health Dashboard:** Monitor all agent CPU/memory/status
- **Data Integrity Monitoring:** Packet loss, sequence gaps, CRC errors
- **USB Bandwidth Meter:** Real-time throughput visualization
- **Alert System:** Configurable thresholds for:
  - Packet loss rate > threshold
  - Buffer utilization > 80%
  - Temperature out of range
  - Electrode impedance anomaly
  - Disk space running low
- **Automatic Recovery:** Agent auto-restart on failure

### 8.6 Reporting & Documentation
- **Auto-generated Experiment Reports:** PDF/HTML reports with:
  - Configuration summary
  - Recording statistics (duration, channels, spikes)
  - Signal quality metrics
  - Key waveform snapshots
  - Spike rate maps
- **Lab Notebook Integration:** Structured notes with timestamp correlation
- **Export to Publication:** Generate publication-ready figures

### 8.7 Enhanced Visualization
- **3D Electrode Array View:** Three-dimensional visualization of electrode positions with activity overlay
- **Spectrogram View:** Time-frequency analysis display
- **Raster Plot:** Spike raster across all channels
- **Cross-correlation Display:** Inter-channel correlation analysis
- **Recording Timeline:** Scrollable timeline with event markers and annotations
- **Dark/Light Theme:** User-selectable UI themes
- **Responsive Design:** Works on tablets for bedside monitoring

### 8.8 Hardware Diagnostics
- **Impedance Testing Mode:** Automated impedance measurement across all sites
- **Self-test Routines:** FPGA/DAC/ADC self-diagnostic tests
- **Calibration Wizard:** Guided calibration with verification
- **Hardware Change Log:** Track firmware versions, configuration changes

---

## 9. DATA FLOW — RECORDING SESSION

```
                         ┌─────────────────────────────────────┐
                         │         USER (Browser)              │
                         │   http://172.168.1.95:3025          │
                         └─────────────┬───────────────────────┘
                                       │ 1. Click "Start Recording"
                                       ▼
                         ┌─────────────────────────────────────┐
                         │   Frontend (React/TypeScript)       │
                         │   POST /api/recordings/start        │
                         └─────────────┬───────────────────────┘
                                       │ 2. REST API call
                                       ▼
                         ┌─────────────────────────────────────┐
                         │   BFF (Node.js) :3026               │
                         │   Validates, proxies to Django      │
                         └─────────────┬───────────────────────┘
                                       │ 3. Forward to Django
                                       ▼
                         ┌─────────────────────────────────────┐
                         │   Django Orchestrator :8085         │
                         │   1. Create Recording record in DB  │
                         │   2. Send MCP tool_call to agents   │
                         └──┬──────────┬───────────────────────┘
                            │          │
               4a. MCP call │          │ 4b. MCP call
                            ▼          ▼
            ┌──────────────────┐  ┌──────────────────────┐
            │ HW Control Agent │  │ Data Acq Agent       │
            │ Configure FPGA   │  │ Start USB streaming   │
            │ (bias, clock,    │  │ Ring buffer → Redis   │
            │  gain, pixels)   │  │ stream                │
            └──────────────────┘  └──────────┬───────────┘
                                              │
                                    5. Raw data published to Redis
                                              │
                    ┌─────────────────────────┼─────────────────────┐
                    │                         │                     │
                    ▼                         ▼                     ▼
        ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
        │ Signal Proc Agent│   │ Storage Agent     │   │ AI/ML Agent      │
        │ Spike detection  │   │ Write to HDF5     │   │ Spike sorting    │
        │ FFT, filtering   │   │ Update DB metadata│   │ Anomaly detect   │
        │ → processed data │   │                   │   │                  │
        └────────┬─────────┘   └───────────────────┘   └────────┬─────────┘
                 │                                               │
                 │ 6. Processed data + spike events              │
                 │    published to Redis                         │
                 │                                               │
                 ▼                                               ▼
        ┌──────────────────────────────────────────────────────────────┐
        │   Django Channels WebSocket → BFF WebSocket → Browser       │
        │   Binary frames: waveform data (60 FPS)                     │
        │   JSON frames: spike events, telemetry (10 FPS)             │
        └──────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
        ┌──────────────────────────────────────────────────────────────┐
        │   Frontend WebGL Renderer                                    │
        │   ArrayBuffer → Ring Buffer → LOD decimation → GPU render   │
        │   Spike heatmap, waveform traces, PCB data, telemetry       │
        └──────────────────────────────────────────────────────────────┘
```

---

## 10. IMPLEMENTATION PHASES

### Phase 1: Foundation (Infrastructure & Core Setup)
**Estimated Scope:** Docker Compose, PostgreSQL, Redis, Django skeleton, React skeleton

1. Create project directory structure
2. Docker Compose with all services
3. PostgreSQL + TimescaleDB setup with schema migrations
4. Django project with DRF, Channels, authentication
5. React + TypeScript + Vite project scaffolding
6. Node.js BFF skeleton
7. Nginx configuration for port 3025
8. Environment configuration (.env files)
9. Basic health check endpoints

### Phase 2: Agent Framework & MCP/A2A + LLM Foundation
**Scope:** Agent base class, MCP server, A2A bus, agent registration, LangGraph setup

1. Base agent class with health check, registration, lifecycle
2. MCP server implementation in Django
3. A2A message bus using Redis Streams (Google A2A SDK)
4. Agent registry and discovery
5. Tool registration framework
6. Resource subscription framework
7. LangGraph StateGraph skeleton with Ollama integration
8. LangFuse observability setup
9. pgvector extension + RAG schema migration

### Phase 3: Core Agents — Data Acquisition & Hardware Control
**Scope:** Port existing CNEAv5.py and SerialThread.py logic into agents

1. Data Acquisition Agent wrapping CNEAv5.py + ok.py
2. Ring buffer implementation (shared memory, 160 MB)
3. Hardware Control Agent with all configuration endpoints
4. USB data streaming to Redis
5. FPGA device initialization and management
6. All existing hardware control features as MCP tools

### Phase 4: Signal Processing & Storage Agents
**Scope:** Real-time processing pipeline, data persistence

1. Signal Processing Agent with spike detection
2. FFT analysis, filtering, noise reduction
3. Storage Agent with HDF5 writer
4. Multi-format export (CSV, MAT, NWB)
5. Recording metadata management in PostgreSQL
6. Data integrity monitoring (packet loss, sequence gaps)

### Phase 5: Frontend — Core UI
**Scope:** Main dashboard, controls, basic visualization

1. App layout with sidebar navigation
2. Dashboard page with system status
3. Recording controls (start/stop/duration)
4. All hardware configuration panels (bias, clock, TIA, gain, pixel, stim)
5. WebSocket connection for real-time data
6. Basic waveform display (Canvas 2D initially)

### Phase 6: Frontend — Advanced Visualization
**Scope:** WebGL rendering, heatmap, full visualization suite

1. WebGL waveform renderer with LOD decimation
2. 64×64 electrode spike heatmap
3. Interactive electrode array map
4. PCB data display
5. DC level visualization
6. FFT/spectrogram display
7. Telemetry dashboard

### Phase 7: LLM Agent, RAG, AI/ML & Advanced Features
**Scope:** LLM conversational control, RAG knowledge base, intelligent analysis, experiment management

1. LLM Agent (LangGraph) with full tool-calling to all agents
2. RAG pipeline: document indexing, embedding (nomic-embed-text), pgvector retrieval
3. Short-term memory (LangGraph checkpointer with PostgreSQL)
4. Long-term memory: semantic (pgvector), episodic (DB), procedural (preferences)
5. Chat panel in frontend with streaming responses + tool call display
6. AI/ML Agent with spike sorting
7. Anomaly detection with LLM-powered explanations
8. Automated parameter optimization with RAG-backed suggestions
9. Experiment management (wizard, templates, scheduling)
10. Recording browser and playback
11. Auto-generated experiment reports (LLM + data)

### Phase 8: Collaboration, Notifications & Polish
**Scope:** Multi-user, alerts, themes, final polish

1. User management with RBAC
2. Notification Agent with email/webhook alerts
3. Configurable threshold alerts
4. Activity feed and audit logging
5. Dark/light theme
6. Responsive design
7. Configuration presets manager
8. Agent health monitoring dashboard

---

## 11. TECHNOLOGY STACK SUMMARY

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | React | 18+ | UI framework |
| | TypeScript | 5+ | Type safety |
| | Vite | 5+ | Build tool |
| | Redux Toolkit | 2+ | State management |
| | WebGL 2.0 | - | GPU waveform rendering |
| | Tailwind CSS | 3+ | Styling |
| | shadcn/ui | - | UI component library |
| **BFF** | Node.js | 20 LTS | Backend-for-Frontend |
| | Express | 4+ | HTTP server |
| | ws | 8+ | WebSocket server |
| **Backend** | Django | 5+ | REST API + orchestrator |
| | Django REST Framework | 3.15+ | API serialization |
| | Django Channels | 4+ | WebSocket support |
| | Daphne | 4+ | ASGI server |
| | Celery | 5+ | Background tasks |
| **Agents** | FastAPI | 0.100+ | Agent HTTP servers |
| | NumPy | 1.26+ | Numerical computation |
| | SciPy | 1.12+ | Signal processing |
| | PyTables | 3.9+ | HDF5 I/O |
| | scikit-learn | 1.4+ | ML algorithms |
| **LLM/Agentic** | LangGraph | 0.2+ | Stateful multi-agent workflows |
| | LangChain Core | 0.3+ | LLM abstractions, tool bindings |
| | langchain-ollama | 0.2+ | Ollama LLM integration |
| | LangFuse | 2.0+ | LLM observability (self-hosted) |
| | Google A2A SDK | 0.1+ | Agent-to-Agent protocol |
| | MCP Python SDK | 1.0+ | Model Context Protocol |
| **LLM** | Ollama | latest | LLM inference server |
| | DeepSeek-R1:7b | - | Chat, reasoning, tool calling |
| | nomic-embed-text | - | RAG vector embeddings (768d) |
| **Database** | PostgreSQL | 16 | Relational data |
| | TimescaleDB | 2.14+ | Time-series extension |
| | pgvector | 0.7+ | Vector similarity search (RAG) |
| **Messaging** | Redis | 7+ | Pub/sub, streams, cache |
| **Infrastructure** | Docker | 24+ | Containerization |
| | Docker Compose | 2+ | Multi-container orchestration |
| | Nginx | 1.25+ | Reverse proxy, static files |

---

## 12. ENVIRONMENT CONFIGURATION

```env
# .env file
# Database
DB_PASSWORD=neural_secure_password_2024
POSTGRES_PORT=5435

# Django
DJANGO_SECRET_KEY=your-secret-key-here
DJANGO_DEBUG=false

# Redis
REDIS_PORT=6385

# Frontend
FRONTEND_PORT=3025
VITE_API_URL=http://172.168.1.95:3026
VITE_WS_URL=ws://172.168.1.95:3026/ws

# BFF
BFF_PORT=3026

# Agent Ports
AGENT_ACQUISITION_PORT=8088
AGENT_PROCESSING_PORT=8089
AGENT_HARDWARE_PORT=8090
AGENT_STORAGE_PORT=8091
AGENT_AIML_PORT=8092
AGENT_NOTIFICATION_PORT=8093

# MCP
MCP_SERVER_PORT=8087

# LLM (Ollama — existing on host)
OLLAMA_BASE_URL=http://172.168.1.95:12434
OLLAMA_CHAT_MODEL=deepseek-r1:7b
OLLAMA_EMBED_MODEL=nomic-embed-text
LLM_AGENT_PORT=8094

# LangFuse (LLM Observability)
LANGFUSE_PORT=8095
LANGFUSE_PUBLIC_KEY=pk-lf-xxxx
LANGFUSE_SECRET_KEY=sk-lf-xxxx
LANGFUSE_NEXTAUTH_SECRET=your-nextauth-secret
LANGFUSE_SALT=your-salt-here

# Host IP
HOST_IP=172.168.1.95
```

---

## 13. PERFORMANCE TARGETS

| Metric | Target | Notes |
|--------|--------|-------|
| **Data ingest rate** | 80 MB/s sustained | Zero packet loss for 30+ minutes |
| **Ring buffer size** | 160 MB (2 sec burst) | Protects against UI stalls |
| **UI frame rate** | 60 FPS | Waveform rendering |
| **Waveform display** | 64+ channels simultaneously | LOD decimation |
| **Pan/zoom latency** | < 100 ms | Interactive controls |
| **Spike detection latency** | < 10 ms | Real-time threshold crossing |
| **WebSocket latency** | < 50 ms | Server → browser |
| **API response time** | < 200 ms (p95) | REST endpoints |
| **System startup** | < 60 sec | All Docker containers |
| **Agent recovery** | < 5 sec | Auto-restart on failure |

---

## 14. SECURITY CONSIDERATIONS

- JWT-based authentication with refresh tokens
- Role-based access control (Admin, Researcher, Viewer)
- API rate limiting per user/role
- Input validation on all endpoints
- CORS configuration restricted to known origins
- Database connection pooling with SSL
- Secrets managed via environment variables (never in code)
- Audit logging of all configuration changes
- Network isolation via Docker Compose internal network

---

## 15. FILE DELIVERABLES SUMMARY

```
capstone-project1/
├── docker-compose.yml
├── .env
├── .env.example
├── README.md
├── Makefile                    -- Build/run shortcuts
│
├── frontend/                   -- React + TypeScript (Port 3025)
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/                    -- Full React application
│
├── bff/                        -- Node.js BFF (Port 3026)
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/                    -- Express + WebSocket server
│
├── backend/                    -- Django + Agents (Port 8085)
│   ├── Dockerfile
│   ├── Dockerfile.agent
│   ├── requirements.txt
│   ├── manage.py
│   ├── config/                 -- Django settings
│   ├── apps/                   -- Django apps
│   ├── agents/                 -- Agent microservices (7 agents)
│   │   ├── llm/               -- LangGraph + RAG + Memory
│   │   ├── data_acquisition/
│   │   ├── signal_processing/
│   │   ├── hardware_control/
│   │   ├── storage/
│   │   ├── ai_ml/
│   │   └── notification/
│   ├── mcp/                    -- MCP protocol implementation
│   └── channels/               -- Django Channels consumers
│
├── database/
│   └── init.sql                -- Database initialization
│
├── nginx/
│   └── nginx.conf              -- Reverse proxy configuration
│
└── legacy/                     -- Original PyQt5 code (preserved)
    ├── GUI.py
    ├── CNEAv5.py
    ├── SerialThread.py
    ├── SpikeDetection.py
    ├── ok.py
    ├── _ok.pyd
    ├── okFrontPanel.dll
    └── *.bit
```

---

This plan transforms the CNEAv5 desktop application into a professional-grade, web-based, multi-agent neural interfacing platform while preserving every existing feature and adding significant business value through:

- **LLM-powered conversational control** (DeepSeek-R1:7b via Ollama on RTX 5090) — natural language system operation
- **RAG-based institutional memory** (pgvector + nomic-embed-text) — system learns from every experiment
- **LangGraph stateful workflows** — intelligent multi-step reasoning with MCP tool calling
- **LangFuse observability** — full tracing of all LLM interactions
- **Multi-agent architecture** (8 agents via MCP + A2A) — modular, scalable, fault-tolerant
- **Advanced real-time visualization** (WebGL, 60 FPS, 64+ channels)
- **Multi-user collaboration** with RBAC
- **Experiment management** with scheduling, templates, and auto-generated reports
