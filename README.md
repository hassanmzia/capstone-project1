# CNEAv5 Neural Interfacing Platform

![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![React](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Django](https://img.shields.io/badge/Django_5-092E20?style=for-the-badge&logo=django&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript_5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Python](https://img.shields.io/badge/Python_3.11-3776AB?style=for-the-badge&logo=python&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

---

## Table of Contents

1. [Overview](#overview)
2. [Key Features](#key-features)
3. [Architecture Overview](#architecture-overview)
4. [Tech Stack](#tech-stack)
5. [Project Structure](#project-structure)
6. [Services Overview](#services-overview)
7. [Agent System](#agent-system)
8. [Prerequisites](#prerequisites)
9. [Installation and Setup](#installation-and-setup)
10. [Environment Variables](#environment-variables)
11. [API Documentation](#api-documentation)
12. [Frontend Pages](#frontend-pages)
13. [Deployment](#deployment)
14. [Development](#development)
15. [Security](#security)
16. [License](#license)
17. [Contributors and Credits](#contributors-and-credits)

---

## Overview

The **CNEAv5 Neural Interfacing Platform** is a full-stack, real-time neural data acquisition, visualization, and analysis platform designed for high-density electrophysiology research. It interfaces with a **4096-channel electrode array** arranged in a **64x64 grid** through an **Opal Kelly FPGA** over USB 3.0, enabling researchers to capture, process, and analyze neural signals at scale.

The platform evolved from a legacy Python/Tkinter desktop application into a modern, containerized **microservices architecture** built for production deployment. It features a responsive web-based interface for real-time data visualization, an extensible backend with Django and ASGI WebSocket support, and **7 AI-powered agents** orchestrated through the **Model Context Protocol (MCP)** for intelligent data acquisition, signal processing, hardware control, storage management, machine learning analysis, notifications, and conversational AI assistance.

An integrated **LLM-powered chatbot assistant** with **Retrieval-Augmented Generation (RAG)** capabilities provides researchers with a natural-language interface for querying experimental data, requesting analysis summaries, and controlling the system. The platform supports multiple LLM backends including Ollama (local), OpenAI, and Anthropic, with full observability via Langfuse.

---

## Key Features

### Real-Time Data Acquisition and Visualization
- Simultaneous streaming from all **4096 channels** (64x64 electrode grid) via FPGA hardware interface
- Multi-panel visualization dashboard with **Heatmap**, **Raster**, **Spectrogram**, **Waveform**, and **FFT** displays
- WebGL-accelerated rendering with Level-of-Detail (LOD) engine for performant visualization of high-channel-count data
- Ring buffer architecture for efficient real-time data windowing in the browser
- Dedicated Web Worker for off-thread FFT computation

### FPGA Hardware Control
- Direct communication with **Opal Kelly FPGA** over USB 3.0 for low-latency data acquisition
- Configurable bias parameters, clock settings, transimpedance amplifier (TIA) tuning, and gain modes
- Programmable electrical stimulation with per-pixel channel selection
- Hardware preset management for reproducible experiment configurations
- PCB telemetry monitoring and diagnostics

### Intelligent Signal Processing
- Real-time **spike detection** with configurable thresholds and refractory periods
- Bandpass filtering, noise rejection, and signal conditioning
- FFT-based spectral analysis and spectrogram generation
- Spike sorting with template matching and clustering algorithms

### AI/ML-Powered Analysis
- Automated **spike sorting** using scikit-learn clustering pipelines
- Neural activity pattern recognition and anomaly detection
- Statistical analysis of firing rates, inter-spike intervals, and spatial activation maps
- HDF5 and CSV data export for offline analysis in MATLAB, Python, or R

### LLM Chatbot Assistant
- **LangGraph**-based conversational agent with multi-turn dialogue support
- **RAG pipeline** with pgvector for semantic search over experimental documentation and metadata
- Multi-provider LLM support: **Ollama** (local, default: deepseek-r1:7b), **OpenAI**, and **Anthropic**
- Configurable embedding model (default: nomic-embed-text) for document vectorization
- Full **Langfuse** integration for LLM observability, cost tracking, and prompt evaluation

### Experiment and Recording Management
- Structured experiment lifecycle: create, configure, record, analyze, archive
- Recording browser with search, filtering, and metadata tagging
- Live recording dashboard with real-time status monitoring
- Batch export to HDF5 and CSV formats with configurable channel selection

### Access Control and Security
- **Role-Based Access Control (RBAC)** with four roles: Admin, Researcher, Operator, Viewer
- JWT authentication with access and refresh token rotation
- SSL/TLS encryption via Nginx reverse proxy with modern cipher suites
- Security headers (HSTS, X-Frame-Options, X-Content-Type-Options, XSS Protection)

### Notifications and Alerting
- Configurable threshold-based alerts for neural activity anomalies
- Real-time notification delivery via WebSocket push
- Event logging and audit trail for all system operations

### Platform Qualities
- Fully containerized with **Docker Compose** (14 services)
- Mobile-responsive design with TailwindCSS v4
- SSL/HTTPS production-ready deployment
- Health checks and automatic service restart policies

---

## Architecture Overview

The CNEAv5 platform follows a layered microservices architecture with clear separation of concerns across six tiers: Presentation, API Gateway, BFF (Backend-for-Frontend), Application, Agent, and Data.

The **Presentation Layer** is a React 19 single-page application built with Vite and TypeScript. It uses Redux Toolkit for global state management and communicates with the backend through both REST API calls and persistent WebSocket connections for real-time data streaming. WebGL rendering and dedicated Web Workers handle the computational demands of visualizing 4096 channels simultaneously.

The **API Gateway** is an Nginx reverse proxy that terminates SSL/TLS, serves the static frontend build, and routes traffic to the appropriate backend service. It forwards `/api/` and `/ws/` paths to the BFF, `/admin/` and `/mcp/` to Django, and all other paths to the frontend.

The **BFF Layer** is a Node.js Express server that acts as the intermediary between the frontend and all backend services. It proxies REST requests to Django, manages WebSocket connections for real-time data streaming, and handles Redis pub/sub subscriptions for relaying neural data, spike events, chat messages, agent status updates, and telemetry to connected browser clients.

The **Application Layer** is a Django 5 application served by Daphne (ASGI) with Django Channels for WebSocket support. It manages all business logic, database models, REST API endpoints, JWT authentication, and the MCP tool registry. Celery handles background tasks with Redis as the message broker.

The **Agent Layer** consists of 7 independent FastAPI microservices, each responsible for a specialized domain. Agents register their capabilities as MCP tools with the central Django orchestrator on startup and maintain health via a Redis-based heartbeat system. They expose A2A (Agent-to-Agent) discovery endpoints and communicate through both direct HTTP calls and Redis pub/sub messaging.

The **Data Layer** uses PostgreSQL 16 with the TimescaleDB extension for time-series neural data and the pgvector extension for embedding storage (RAG). Redis 7 serves as the message broker for Celery, the pub/sub backbone for real-time data relay, and a shared state cache for agent heartbeats and session data.

```
+------------------------------------------------------------------+
|                     PRESENTATION LAYER                            |
|  React 19 + Vite + TypeScript + Redux Toolkit + TailwindCSS v4   |
|  [Heatmap] [Raster] [Spectrogram] [Waveform] [FFT] [Dashboard]  |
|  WebGL Renderer | LOD Engine | Ring Buffer | FFT Web Worker       |
+-------------------------------+----------------------------------+
                                |
                          HTTPS :3025
                                |
+-------------------------------v----------------------------------+
|                       API GATEWAY (Nginx)                        |
|              SSL Termination + Reverse Proxy                     |
|  /         -> Frontend    /api/, /ws/ -> BFF                     |
|  /admin/   -> Django      /mcp/       -> Django                  |
+------+------------------------+------------------+---------------+
       |                        |                  |
       v                        v                  v
+-------------+    +------------------------+  +------------------+
|  Frontend   |    |    BFF LAYER           |  |  APPLICATION     |
|  (static)   |    |  Node.js + Express     |  |  LAYER           |
|  nginx :80  |    |  WebSocket relay       |  |  Django 5 +      |
|             |    |  REST proxy            |  |  Daphne/ASGI     |
|             |    |  Redis pub/sub client  |  |  Django Channels  |
|             |    |  Port :3026            |  |  Celery           |
|             |    +------------------------+  |  JWT Auth         |
|             |                                |  MCP Registry     |
|             |                                |  Port :8085       |
+-------------+                                +--------+---------+
                                                        |
                    +-----------------------------------+
                    |
+-------------------v----------------------------------------------+
|                       AGENT LAYER (FastAPI)                       |
|                                                                   |
|  +-------------+ +-------------+ +-------------+ +-------------+ |
|  | Data Acq.   | | Signal Proc.| | HW Control  | | Storage     | |
|  | :8088       | | :8089       | | :8090       | | :8091       | |
|  +-------------+ +-------------+ +-------------+ +-------------+ |
|  +-------------+ +-------------+ +-------------+                 |
|  | AI/ML       | | Notification| | LLM (Lang-  |                 |
|  | :8092       | | :8093       | | Graph) :8094|                 |
|  +-------------+ +-------------+ +-------------+                 |
|                                                                   |
|  Each agent: FastAPI + Redis pub/sub + MCP tool registration      |
|              A2A discovery (/.well-known/agent.json)               |
|              Heartbeat loop (5s interval, 15s TTL)                |
+-------------------+----------------------------------------------+
                    |
+-------------------v----------------------------------------------+
|                        DATA LAYER                                 |
|                                                                   |
|  +---------------------------+  +------------------------------+ |
|  | PostgreSQL 16             |  | Redis 7                      | |
|  | + TimescaleDB (time-      |  | - Message broker (Celery)    | |
|  |   series hypertables)     |  | - Pub/sub (real-time relay)  | |
|  | + pgvector (RAG           |  | - Agent heartbeat cache      | |
|  |   embeddings)             |  | - Session/state store        | |
|  | Port :5435                |  | Port :6385                   | |
|  +---------------------------+  +------------------------------+ |
|                                                                   |
|  +------------------------------+                                 |
|  | Langfuse (LLM Observability) |                                 |
|  | Port :8095                   |                                 |
|  +------------------------------+                                 |
+------------------------------------------------------------------+
```

---

## Tech Stack

| Category | Technology | Details |
|---|---|---|
| **Frontend** | React 19, TypeScript 5.7, Vite 6 | Single-page application with hot module reload |
| **State Management** | Redux Toolkit 2.5, React Redux 9.2 | Slices for agents, chat, config, recordings, visualization |
| **Styling** | TailwindCSS v4 | Utility-first CSS with Vite plugin integration |
| **Visualization** | WebGL, Recharts, Custom Canvas | Heatmap, raster, spectrogram, waveform, FFT displays |
| **Icons** | Lucide React | Consistent iconography throughout the UI |
| **Routing** | React Router DOM 7 | Client-side routing with nested layouts |
| **Markdown** | react-markdown 10 | Chat message rendering with markdown support |
| **BFF** | Node.js, Express 4, WebSocket (ws 8) | REST proxy and WebSocket relay server |
| **BFF Middleware** | Helmet 8, CORS, Compression, Rate Limiting | Security and performance middleware stack |
| **BFF Data** | ioredis 5, Axios, http-proxy-middleware 3 | Redis client, HTTP proxy, API forwarding |
| **Backend** | Python 3.11, Django 5, Django REST Framework | Application server with REST API |
| **ASGI** | Daphne 4, Django Channels 4, channels-redis 4 | WebSocket support and async request handling |
| **Auth** | djangorestframework-simplejwt 5.3 | JWT access and refresh token authentication |
| **Background Tasks** | Celery 5.4, Redis 5 | Asynchronous task queue for long-running operations |
| **Scientific** | NumPy 1.26, SciPy 1.12, scikit-learn 1.4 | Signal processing, filtering, ML pipelines |
| **Data Formats** | h5py 3.10, PyTables 3.9 | HDF5 read/write for neural recording data |
| **Agents** | FastAPI 0.115, Uvicorn 0.30, httpx 0.27 | Independent microservice agents |
| **LLM Framework** | LangGraph 0.2, LangChain Core 0.3, LangChain-Ollama 0.2 | Agentic LLM workflows with tool use |
| **LLM Providers** | Ollama (deepseek-r1:7b), OpenAI, Anthropic | Local and cloud LLM backends |
| **Embeddings** | pgvector 0.3, nomic-embed-text | Vector similarity search for RAG |
| **Observability** | Langfuse 2 | LLM tracing, cost tracking, prompt evaluation |
| **Database** | PostgreSQL 16 + TimescaleDB | Time-series optimized relational database |
| **Cache/Broker** | Redis 7 Alpine | Message broker, pub/sub, caching |
| **Web Server** | Nginx Alpine | SSL termination, reverse proxy, static file serving |
| **Containerization** | Docker Compose 3.9 | Multi-service orchestration with health checks |
| **SSL/TLS** | TLSv1.2, TLSv1.3 | ECDHE cipher suites, HSTS, session tickets disabled |
| **Protocol** | MCP (Model Context Protocol) | Standardized tool registration and execution for agents |
| **Hardware** | Opal Kelly FPGA, USB 3.0 | 4096-channel electrode array interface |

---

## Project Structure

```
capstone-project1/
├── frontend/                          # React TypeScript SPA
│   ├── Dockerfile                     # Multi-stage build (node -> nginx)
│   ├── package.json                   # Dependencies and scripts
│   ├── tsconfig.json                  # TypeScript configuration
│   └── src/
│       ├── main.tsx                   # Application entry point
│       ├── App.tsx                    # Root component with router
│       ├── routes.tsx                 # Route definitions
│       ├── index.css                  # Global styles (Tailwind imports)
│       ├── components/
│       │   ├── layout/                # AppLayout, Header, Sidebar, StatusBar
│       │   ├── common/                # LODEngine, RingBuffer, WebGLRenderer
│       │   ├── auth/                  # LoginPage
│       │   ├── dashboard/             # DashboardPage
│       │   ├── visualization/         # VisualizationPage, SpikeHeatmap,
│       │   │                          # RasterDisplay, SpectrogramDisplay,
│       │   │                          # WaveformDisplay, FFTDisplay,
│       │   │                          # ElectrodeArrayMap, TelemetryPanel,
│       │   │                          # PCBDataDisplay
│       │   ├── controls/              # ControlsPage (FPGA config UI)
│       │   ├── recordings/            # RecordingBrowserPage, RecordingDetailPage,
│       │   │                          # LiveRecordingDashboard
│       │   ├── experiments/           # ExperimentListPage, ExperimentDetailPage
│       │   ├── analysis/              # AnalysisPage, AnalysisDetailPage,
│       │   │                          # NewAnalysisPage
│       │   ├── reports/               # ReportsPage, ReportViewPage
│       │   ├── chat/                  # ChatPanel (LLM assistant)
│       │   ├── notifications/         # NotificationPanel
│       │   └── settings/              # SettingsPage
│       ├── store/
│       │   ├── index.ts               # Redux store configuration
│       │   └── slices/                # agentSlice, chatSlice, configSlice,
│       │                              # recordingSlice, visualizationSlice
│       ├── contexts/                  # AuthContext, NeuralDataContext,
│       │                              # RecordingSessionContext, SpikeEventsContext
│       ├── hooks/                     # useDataStream, useNotifications,
│       │                              # useSpikeEvents, useWebSocket
│       ├── services/
│       │   └── api.ts                 # Axios API client
│       ├── workers/
│       │   └── fft.worker.ts          # Off-thread FFT computation
│       ├── types/                     # TypeScript type definitions
│       └── utils/                     # Utility functions
│
├── bff/                               # Node.js Backend-for-Frontend
│   ├── Dockerfile                     # Node.js build
│   ├── package.json                   # Express, ws, ioredis, helmet, etc.
│   ├── tsconfig.json                  # TypeScript configuration
│   └── src/
│       └── index.ts                   # Express server, WebSocket relay, REST proxy
│
├── backend/                           # Django + Agent services
│   ├── Dockerfile                     # Django/Daphne container
│   ├── Dockerfile.agent               # Shared agent container image
│   ├── requirements.txt               # Python dependencies
│   ├── manage.py                      # Django management
│   ├── config/                        # Django project configuration
│   │   ├── settings/                  # Split settings (base, development, production)
│   │   ├── urls.py                    # URL routing
│   │   ├── asgi.py                    # ASGI application (Daphne)
│   │   └── wsgi.py                    # WSGI fallback
│   ├── apps/                          # Django applications
│   │   ├── users/                     # User management and RBAC
│   │   ├── experiments/               # Experiment lifecycle
│   │   ├── recordings/                # Recording CRUD and metadata
│   │   ├── hardware/                  # Hardware configuration models
│   │   ├── presets/                   # Configuration presets
│   │   ├── analysis/                  # Analysis jobs and results
│   │   ├── agents_app/                # Agent registry and status
│   │   └── notifications/             # Notification models and dispatch
│   ├── mcp/                           # MCP server (tool registry and execution)
│   │   ├── urls.py                    # /mcp/tools/call, /mcp/tools/list,
│   │   │                              # /mcp/resources/list, /mcp/agents/register
│   │   └── views.py                   # MCP endpoint handlers
│   ├── ws/                            # Django Channels consumers
│   │   ├── routing.py                 # WebSocket URL routing
│   │   ├── neural_data.py             # Neural data streaming consumer
│   │   ├── spike_events.py            # Spike event consumer
│   │   ├── chat.py                    # Chat message consumer
│   │   ├── agent_status.py            # Agent health consumer
│   │   ├── notifications.py           # Notification consumer
│   │   └── telemetry.py               # Hardware telemetry consumer
│   └── agents/                        # FastAPI microservice agents
│       ├── base_agent.py              # Abstract base class for all agents
│       ├── data_acquisition/          # FPGA data streaming agent
│       ├── signal_processing/         # Spike detection and filtering agent
│       ├── hardware_control/          # FPGA configuration agent
│       ├── storage/                   # Recording storage and export agent
│       ├── ai_ml/                     # ML analysis agent
│       ├── notification/              # Alert and notification agent
│       └── llm/                       # LangGraph chatbot agent
│
├── database/
│   └── init.sql                       # PostgreSQL/TimescaleDB/pgvector init
│
├── nginx/
│   └── nginx.conf                     # SSL reverse proxy configuration
│
├── ssl/                               # SSL certificates (not committed)
│   ├── fullchain.pem                  # Certificate chain
│   └── private.key                    # Private key
│
├── legacy/                            # Original Python/Tkinter desktop application
│   ├── CNEAv5.py                      # Legacy FPGA interface code
│   ├── GUI.py                         # Legacy Tkinter GUI
│   ├── SerialThread.py                # Legacy serial communication
│   ├── SpikeDetection.py              # Legacy spike detection
│   ├── *.bit                          # FPGA bitstream files
│   └── ok.py                          # Opal Kelly Python bindings
│
├── docker-compose.yml                 # Full stack orchestration (14 services)
├── .env.example                       # Environment variable template
├── .env                               # Active environment configuration
├── Makefile                           # Build and management shortcuts
└── docs/                              # Additional documentation
```

---

## Services Overview

The platform runs as 14 Docker containers orchestrated by Docker Compose:

| # | Service | Container Name | Port | Description |
|---|---|---|---|---|
| 1 | **PostgreSQL + TimescaleDB** | `neural-postgres` | `5435:5432` | Primary database with time-series and vector extensions |
| 2 | **Redis** | `neural-redis` | `6385:6379` | Message broker, pub/sub, cache (512MB, allkeys-lru) |
| 3 | **Django** | `neural-django` | `8085:8085` | Application server (Daphne/ASGI), REST API, MCP registry |
| 4 | **BFF** | `neural-bff` | `3026:3026` | Node.js WebSocket relay and REST proxy |
| 5 | **Nginx** | `neural-nginx` | `3025:3025`, `80:80` | SSL termination, reverse proxy, static frontend |
| 6 | **Frontend** | `neural-frontend` | `80` (internal) | React SPA served via Nginx upstream |
| 7 | **Data Acquisition Agent** | `neural-agent-acquisition` | `8088:8088` | FPGA communication and data streaming |
| 8 | **Signal Processing Agent** | `neural-agent-processing` | `8089:8089` | Spike detection, filtering, FFT |
| 9 | **Hardware Control Agent** | `neural-agent-hardware` | `8090:8090` | FPGA parameter configuration |
| 10 | **Storage Agent** | `neural-agent-storage` | `8091:8091` | Recording management, HDF5/CSV export |
| 11 | **AI/ML Agent** | `neural-agent-aiml` | `8092:8092` | Spike sorting, pattern recognition |
| 12 | **Notification Agent** | `neural-agent-notification` | `8093:8093` | Threshold alerts, event notifications |
| 13 | **LLM Agent** | `neural-agent-llm` | `8094:8094` | LangGraph chatbot with RAG |
| 14 | **Langfuse** | `neural-langfuse` | `8095:3000` | LLM observability and tracing dashboard |

All services use `restart: unless-stopped` and critical services (PostgreSQL, Redis) include health checks with dependency ordering to ensure correct startup sequencing.

---

## Agent System

### Overview

The agent layer implements a **distributed microservices architecture** where each agent is an independent FastAPI application responsible for a specific domain. All agents extend a shared `BaseAgent` class that provides:

- **MCP tool registration**: On startup, each agent POSTs its tool definitions (name, description, input schema) to the central Django MCP server at `/mcp/agents/register` with exponential backoff retry logic.
- **A2A discovery**: Each agent serves an agent card at `/.well-known/agent.json` following the Agent-to-Agent protocol, enabling dynamic service discovery.
- **Heartbeat loop**: Every 5 seconds, each agent publishes its status to the `agent:heartbeat` Redis channel and sets a key with a 15-second TTL, allowing the orchestrator to detect agent failures.
- **Health endpoint**: A `/health` endpoint returns the agent's name, type, and current status.

### Model Context Protocol (MCP)

The MCP server, hosted within the Django application at `/mcp/`, acts as the central tool registry and execution dispatcher:

| Endpoint | Method | Description |
|---|---|---|
| `/mcp/agents/register` | POST | Agents register their tools (name, description, input_schema) |
| `/mcp/tools/list` | GET | List all registered tools across all agents |
| `/mcp/tools/call` | POST | Execute a specific tool by routing to the owning agent |
| `/mcp/resources/list` | GET | List available resources exposed by agents |

When a tool is invoked (e.g., by the LLM agent), the MCP server looks up which agent owns that tool and forwards the execution request. This decouples tool consumers from tool providers and allows agents to be added, removed, or updated independently.

### Agent Details

#### 1. Data Acquisition Agent (Port 8088)

Responsible for interfacing with the Opal Kelly FPGA hardware to stream neural data from the 4096-channel electrode array.

- **FPGA Communication**: Manages the USB 3.0 connection to the FPGA, configuring endpoints and initiating data transfers
- **Channel Sampling**: Reads raw ADC values from the 64x64 electrode grid at configurable sampling rates
- **Data Streaming**: Publishes acquired data frames to Redis pub/sub channels for consumption by the BFF, signal processing agent, and storage agent
- **Recording Control**: Start, stop, and pause data acquisition sessions
- **MCP Tools**: `start_acquisition`, `stop_acquisition`, `get_acquisition_status`, `configure_sampling`

#### 2. Signal Processing Agent (Port 8089)

Performs real-time digital signal processing on incoming neural data streams.

- **Spike Detection**: Applies amplitude thresholding with configurable sensitivity to identify action potentials in real time
- **Bandpass Filtering**: Implements Butterworth and FIR filters for isolating neural frequency bands (typically 300Hz - 3kHz for spikes, 1-300Hz for LFP)
- **FFT Analysis**: Computes power spectral density estimates for frequency-domain visualization
- **Noise Reduction**: Common average referencing (CAR) and adaptive filtering for artifact rejection
- **MCP Tools**: `detect_spikes`, `apply_filter`, `compute_fft`, `get_signal_stats`

#### 3. Hardware Control Agent (Port 8090)

Manages all configurable parameters of the FPGA and analog front-end circuitry.

- **Bias Configuration**: Sets reference voltages and bias currents for the electrode array amplifiers
- **Clock Settings**: Configures sampling clock frequency and phase for the ADC array
- **TIA Tuning**: Adjusts transimpedance amplifier feedback resistors and bandwidth
- **Gain Mode**: Switches between gain settings for different signal amplitude ranges
- **Stimulation Control**: Programs electrical stimulation patterns with per-channel pixel selection, amplitude, pulse width, and frequency
- **MCP Tools**: `set_bias`, `set_clock`, `configure_tia`, `set_gain_mode`, `start_stimulation`, `stop_stimulation`, `load_preset`

#### 4. Storage Agent (Port 8091)

Handles persistent storage of neural recordings and experiment metadata.

- **Recording Management**: Creates, updates, and deletes recording sessions with full metadata tracking
- **HDF5 Export**: Writes neural data to HDF5 files with channel maps, timestamps, and experiment annotations
- **CSV Export**: Exports selected channels and time ranges to CSV for external analysis
- **File Operations**: Manages the recording data volume, handles file listing, cleanup, and disk usage monitoring
- **Database Access**: Direct PostgreSQL connection for recording metadata queries
- **MCP Tools**: `create_recording`, `export_hdf5`, `export_csv`, `list_recordings`, `get_disk_usage`

#### 5. AI/ML Agent (Port 8092)

Provides machine learning capabilities for automated neural data analysis.

- **Spike Sorting**: Clusters detected spikes into putative neural units using PCA dimensionality reduction and k-means/GMM clustering (scikit-learn)
- **Pattern Recognition**: Identifies recurring spatiotemporal activation patterns across the electrode array
- **Anomaly Detection**: Flags unusual neural activity patterns that deviate from established baselines
- **Statistical Analysis**: Computes firing rate maps, inter-spike interval distributions, and cross-correlation matrices
- **MCP Tools**: `sort_spikes`, `detect_patterns`, `detect_anomalies`, `compute_statistics`

#### 6. Notification Agent (Port 8093)

Manages alerts, notifications, and event logging for the platform.

- **Threshold Alerts**: Monitors neural data metrics and triggers alerts when configurable thresholds are exceeded
- **Email Notifications**: Sends email alerts for critical events (recording completion, hardware errors, anomaly detection)
- **Event Logging**: Maintains an audit log of all significant system events
- **WebSocket Push**: Publishes notification events to Redis for real-time delivery to connected clients
- **MCP Tools**: `create_alert`, `send_notification`, `get_event_log`, `configure_threshold`

#### 7. LLM Agent (Port 8094)

The conversational AI assistant powered by LangGraph with RAG capabilities.

- **LangGraph Chatbot**: Multi-turn dialogue with memory, supporting complex research queries about experimental data
- **RAG Pipeline**: Retrieves relevant context from pgvector-indexed experiment documentation, recording metadata, and analysis results before generating responses
- **Multi-Provider Support**: Configurable LLM backend -- Ollama for local inference (default: deepseek-r1:7b), or cloud APIs via OpenAI and Anthropic keys
- **Embedding Model**: Uses nomic-embed-text (via Ollama) for document vectorization and semantic similarity search
- **Tool Use**: Can invoke other agents' MCP tools during conversations (e.g., "start a new recording" or "show me the latest spike sorting results")
- **Langfuse Integration**: All LLM calls are traced with Langfuse for observability, latency monitoring, token usage tracking, and prompt evaluation
- **MCP Tools**: `chat`, `search_documents`, `get_conversation_history`

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **Docker** | 20.10+ | Container runtime |
| **Docker Compose** | 2.0+ | Multi-container orchestration |
| **Node.js** | 18+ | Required only for local frontend/BFF development |
| **Python** | 3.11+ | Required only for local backend development |
| **Ollama** | Latest | Optional; required for local LLM inference |
| **SSL Certificates** | -- | Required for HTTPS deployment (fullchain.pem + private.key) |
| **Opal Kelly FPGA** | XEM7310 or compatible | Optional for development; required for live data acquisition |
| **Available Ports** | See Services table | 3025, 3026, 5435, 6385, 8085, 8088-8095 |

---

## Installation and Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/capstone-project1.git
cd capstone-project1
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Open `.env` and configure all required values. At minimum, set secure passwords and secret keys:

```bash
DB_PASSWORD=your_secure_database_password
DJANGO_SECRET_KEY=your_random_50_char_secret_key
LANGFUSE_PUBLIC_KEY=your_langfuse_public_key
LANGFUSE_SECRET_KEY=your_langfuse_secret_key
LANGFUSE_NEXTAUTH_SECRET=your_nextauth_secret
LANGFUSE_SALT=your_random_salt
HOST_IP=your_server_ip_address
```

### 3. Place SSL Certificates

For HTTPS deployment, place your SSL certificate files in the `ssl/` directory:

```bash
ssl/fullchain.pem    # Full certificate chain (server cert + intermediate CAs)
ssl/private.key      # Private key (must match the certificate)
```

If you do not have certificates, you can generate self-signed ones for development:

```bash
mkdir -p ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/private.key \
  -out ssl/fullchain.pem \
  -subj "/CN=localhost"
```

### 4. (Optional) Install Ollama for Local LLM

If you want the LLM chatbot to run locally without cloud API keys:

```bash
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull deepseek-r1:7b
ollama pull nomic-embed-text
```

### 5. Build and Start All Services

```bash
docker-compose up -d --build
```

This will build and start all 14 services. The first build may take several minutes as it downloads base images and installs dependencies. Django will automatically run database migrations on startup.

### 6. Verify Deployment

Check that all containers are running:

```bash
docker-compose ps
```

Check the health of core services:

```bash
# Django health check
curl -k https://localhost:3025/api/v1/auth/token/ -X POST

# PostgreSQL
docker exec neural-postgres pg_isready -U neural_admin -d neural_interface

# Redis
docker exec neural-redis redis-cli ping
```

### 7. Access the Platform

- **Web Interface**: `https://your-domain:3025` or `https://localhost:3025`
- **Django Admin**: `https://your-domain:3025/admin/`
- **Langfuse Dashboard**: `http://your-server-ip:8095`

---

## Environment Variables

All environment variables are defined in the `.env` file and consumed by `docker-compose.yml`.

### Database

| Variable | Default | Description |
|---|---|---|
| `DB_PASSWORD` | *(required)* | PostgreSQL password for the application user |
| `POSTGRES_DB` | `neural_interface` | Database name |
| `POSTGRES_USER` | `neural_admin` | Database username |
| `POSTGRES_PORT` | `5435` | Host port mapped to PostgreSQL container (internal: 5432) |

### Django Backend

| Variable | Default | Description |
|---|---|---|
| `DJANGO_SECRET_KEY` | *(required)* | Django secret key for cryptographic signing |
| `DJANGO_DEBUG` | `false` | Enable Django debug mode (set to `true` for development only) |
| `DJANGO_ALLOWED_HOSTS` | `*` | Comma-separated list of allowed hostnames |

### Redis

| Variable | Default | Description |
|---|---|---|
| `REDIS_PORT` | `6385` | Host port mapped to Redis container (internal: 6379) |

### BFF (Backend-for-Frontend)

| Variable | Default | Description |
|---|---|---|
| `BFF_PORT` | `3026` | Host port for the Node.js BFF server |
| `HOST_IP` | `172.168.1.95` | Server IP address for service-to-service communication |

### Frontend

| Variable | Default | Description |
|---|---|---|
| `FRONTEND_PORT` | `3025` | Host HTTPS port for the Nginx reverse proxy |
| `VITE_API_URL` | `/api` | API base URL (build-time variable baked into the frontend) |
| `VITE_WS_URL` | `wss://demo.eminencetechsolutions.com:3025/ws` | WebSocket URL (build-time variable) |

### Agent Ports

| Variable | Default | Description |
|---|---|---|
| `AGENT_ACQUISITION_PORT` | `8088` | Data Acquisition Agent host port |
| `AGENT_PROCESSING_PORT` | `8089` | Signal Processing Agent host port |
| `AGENT_HARDWARE_PORT` | `8090` | Hardware Control Agent host port |
| `AGENT_STORAGE_PORT` | `8091` | Storage Agent host port |
| `AGENT_AIML_PORT` | `8092` | AI/ML Agent host port |
| `AGENT_NOTIFICATION_PORT` | `8093` | Notification Agent host port |
| `AGENT_LLM_PORT` | `8094` | LLM Agent host port |
| `MCP_SERVER_PORT` | `8087` | MCP server port (internal to Django) |

### LLM Configuration

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://172.168.1.95:12434` | Ollama API endpoint (use `host.docker.internal` for Docker) |
| `OLLAMA_CHAT_MODEL` | `deepseek-r1:7b` | Ollama model for chat completion |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Ollama model for text embeddings (RAG) |
| `OPENAI_API_KEY` | *(empty)* | OpenAI API key (optional, enables OpenAI models in chat) |
| `ANTHROPIC_API_KEY` | *(empty)* | Anthropic API key (optional, enables Claude models in chat) |

### Langfuse (LLM Observability)

| Variable | Default | Description |
|---|---|---|
| `LANGFUSE_PORT` | `8095` | Host port for the Langfuse web UI |
| `LANGFUSE_PUBLIC_KEY` | *(required)* | Langfuse project public key |
| `LANGFUSE_SECRET_KEY` | *(required)* | Langfuse project secret key |
| `LANGFUSE_NEXTAUTH_SECRET` | *(required)* | NextAuth.js secret for Langfuse session encryption |
| `LANGFUSE_SALT` | *(required)* | Salt for Langfuse password hashing |

---

## API Documentation

### REST API Endpoints

All REST endpoints are accessible through the BFF proxy at `/api/` or directly via Django at port `8085`.

#### Authentication

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/auth/token/` | Obtain JWT access and refresh tokens |
| POST | `/api/v1/auth/token/refresh/` | Refresh an expired access token |
| GET | `/api/v1/users/` | List users (admin only) |
| POST | `/api/v1/users/` | Create a new user account |

#### Experiments

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/experiments/` | List all experiments (filtered by user role) |
| POST | `/api/v1/experiments/` | Create a new experiment |
| GET | `/api/v1/experiments/{id}/` | Retrieve experiment details |
| PUT | `/api/v1/experiments/{id}/` | Update experiment metadata |
| DELETE | `/api/v1/experiments/{id}/` | Delete an experiment |

#### Recordings

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/recordings/` | List recordings with search and filter |
| POST | `/api/v1/recordings/` | Create a new recording session |
| GET | `/api/v1/recordings/{id}/` | Retrieve recording details and metadata |
| PUT | `/api/v1/recordings/{id}/` | Update recording metadata |
| DELETE | `/api/v1/recordings/{id}/` | Delete a recording |

#### Hardware Configuration

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/hardware/` | Get current hardware configuration |
| PUT | `/api/v1/hardware/` | Update hardware parameters |
| GET | `/api/v1/presets/` | List configuration presets |
| POST | `/api/v1/presets/` | Save current config as a preset |

#### Analysis

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/analysis/` | List analysis jobs |
| POST | `/api/v1/analysis/` | Submit a new analysis job |
| GET | `/api/v1/analysis/{id}/` | Retrieve analysis results |

#### Agents

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/agents/` | List all registered agents and their status |
| GET | `/api/v1/agents/{name}/` | Get details for a specific agent |

#### Notifications

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/notifications/` | List notifications for the current user |
| PUT | `/api/v1/notifications/{id}/` | Mark a notification as read |

#### MCP (Model Context Protocol)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/mcp/agents/register` | Register an agent and its tools |
| GET | `/mcp/tools/list` | List all registered MCP tools |
| POST | `/mcp/tools/call` | Execute a registered tool |
| GET | `/mcp/resources/list` | List available MCP resources |

#### Health

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health/` | Django application health check |

### WebSocket Channels

Real-time data is streamed through WebSocket connections managed by the BFF server. Clients connect via `wss://your-domain:3025/ws/` (proxied through Nginx to the BFF at port 3026).

The BFF subscribes to Redis pub/sub channels and relays messages to connected WebSocket clients:

| Channel | Direction | Description |
|---|---|---|
| `recording:data` | Server -> Client | Raw neural data frames (4096 channels per frame) |
| `recording:spikes` | Server -> Client | Detected spike events with timestamps and channel IDs |
| `chat:message` | Bidirectional | LLM chatbot messages (user queries and assistant responses) |
| `agents:status` | Server -> Client | Agent heartbeat and health status updates |
| `visualization:stream` | Server -> Client | Processed visualization data (heatmap, raster, spectrum) |
| `telemetry:data` | Server -> Client | FPGA hardware telemetry and diagnostics |
| `notifications:push` | Server -> Client | Real-time alert and notification delivery |

Django Channels consumers (`backend/ws/`) handle the server-side WebSocket logic, subscribing to Redis channels and serializing data for transmission:

- `neural_data.py` -- Neural data streaming consumer
- `spike_events.py` -- Spike event consumer
- `chat.py` -- Chat message consumer
- `agent_status.py` -- Agent health consumer
- `notifications.py` -- Notification consumer
- `telemetry.py` -- Hardware telemetry consumer

---

## Frontend Pages

The React frontend is a single-page application with client-side routing. All pages are rendered within a shared `AppLayout` that includes a collapsible sidebar, header with user menu, and status bar.

### Dashboard (`/`)

The system overview page providing at-a-glance status of the entire platform. Displays recording statistics (active, completed, total), agent health indicators with live heartbeat status, recent experiment activity, quick-action buttons for starting recordings and accessing common workflows, and system resource usage summaries.

### Visualization (`/visualization`)

The primary data visualization page with a multi-panel layout for simultaneous real-time monitoring:

- **Spike Heatmap**: 64x64 grid color-coded by firing rate or signal amplitude, providing a spatial view of neural activity across the entire electrode array
- **Raster Display**: Temporal spike raster plot showing detected action potentials across channels over time
- **Spectrogram Display**: Time-frequency representation of neural signals with configurable frequency bands
- **Waveform Display**: Raw or filtered voltage traces for selected channels with zoom and pan
- **FFT Display**: Real-time power spectral density computed in a dedicated Web Worker
- **Electrode Array Map**: Physical electrode layout with selectable channels
- **Telemetry Panel**: Live FPGA hardware metrics (temperature, voltage rails, USB throughput)
- **PCB Data Display**: Printed circuit board diagnostic information

### Controls (`/controls`)

The FPGA hardware configuration page with parameter controls organized into functional groups:

- Bias voltage and current parameters with slider and numeric input controls
- Clock frequency and phase configuration
- Transimpedance amplifier (TIA) feedback and bandwidth settings
- Gain mode selection (low, medium, high)
- Electrical stimulation configuration with channel pixel selection, amplitude, pulse width, and frequency
- Preset management: save, load, and delete configuration presets for reproducible experiments

### Recording Browser (`/recordings`)

A searchable, filterable table of all recording sessions with columns for name, date, duration, channel count, experiment association, and status. Supports:

- Full-text search across recording metadata
- Filtering by date range, experiment, and status
- Batch export to HDF5 or CSV
- Navigation to individual recording detail pages with waveform preview and metadata editing

### Live Recording Dashboard

A dedicated real-time monitoring view displayed during active recording sessions, showing elapsed time, data throughput, channel quality metrics, and live waveform previews.

### Experiments (`/experiments`)

Experiment lifecycle management with list and detail views. Create new experiments with title, description, protocol notes, and associated hardware presets. Track experiment sessions, link recordings, and review analysis results.

### Analysis (`/analysis`)

Submit, monitor, and review analysis jobs. Create new analyses by selecting recordings, choosing analysis types (spike sorting, pattern recognition, statistical summary), and configuring parameters. View results with interactive charts and export capabilities.

### Reports (`/reports`)

Generate and view formatted reports from analysis results. Reports combine visualizations, statistical summaries, and researcher annotations into shareable documents.

### Chat (Sidebar Panel)

A slide-out chat panel accessible from any page. Provides a natural-language interface to the LLM agent for querying data, requesting summaries, and controlling the system. Supports markdown rendering, multi-turn conversations, and model selection (Ollama/OpenAI/Anthropic).

### Settings (`/settings`)

User profile management (display name, email, password change) and system-level settings (notification preferences, default visualization layout, theme configuration).

### Login (`/login`)

Authentication page with username/password form, JWT token handling, and redirect to dashboard on success.

---

## Deployment

### Production Deployment with Docker Compose

The platform is designed for single-server production deployment using Docker Compose with Nginx SSL termination.

#### 1. Server Requirements

- Linux server (Ubuntu 22.04+ recommended)
- Minimum 8GB RAM, 4 CPU cores
- Docker and Docker Compose installed
- Domain name with DNS A record pointing to the server IP
- SSL certificate for the domain (Let's Encrypt or commercial CA)

#### 2. SSL Certificate Setup

Place your certificate files:

```bash
ssl/fullchain.pem     # Server certificate + intermediate chain
ssl/private.key       # RSA/ECDSA private key
```

For Let's Encrypt:

```bash
sudo certbot certonly --standalone -d your-domain.com
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/
cp /etc/letsencrypt/live/your-domain.com/privkey.pem ssl/private.key
```

#### 3. Configure Nginx

Update `nginx/nginx.conf` with your domain name:

```nginx
server_name your-domain.com your-server-ip localhost;
```

The default configuration listens on port 3025 for HTTPS and port 80 for HTTP (with automatic redirect to HTTPS). SSL is configured with TLSv1.2 and TLSv1.3, strong ECDHE cipher suites, and security headers including HSTS.

#### 4. Configure Environment

Update `.env` with production values:

```bash
HOST_IP=your-server-ip
DJANGO_ALLOWED_HOSTS=your-domain.com,your-server-ip,localhost
DJANGO_DEBUG=false
VITE_API_URL=/api
VITE_WS_URL=wss://your-domain.com:3025/ws
```

#### 5. Deploy

```bash
docker-compose up -d --build
```

#### 6. Port Mapping Summary

| External Port | Service | Protocol |
|---|---|---|
| 80 | Nginx (HTTP redirect) | HTTP |
| 3025 | Nginx (HTTPS) | HTTPS |
| 3026 | BFF (WebSocket/REST) | HTTP/WS |
| 5435 | PostgreSQL | TCP |
| 6385 | Redis | TCP |
| 8085 | Django | HTTP |
| 8088-8094 | Agent services | HTTP |
| 8095 | Langfuse | HTTP |

For production, consider restricting external access to only ports 80 and 3025 using firewall rules (`ufw`, `iptables`, or cloud security groups), and accessing internal services through the Nginx proxy or SSH tunneling.

---

## Development

### Local Development Setup

For development, you can run individual services outside Docker while keeping databases and supporting services containerized.

#### Start Infrastructure Services Only

```bash
docker-compose up -d postgres redis langfuse
```

#### Frontend Development

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server starts at `http://localhost:5173` with hot module replacement. Set `VITE_API_URL` and `VITE_WS_URL` in a `.env.local` file to point to your local BFF.

#### BFF Development

```bash
cd bff
npm install
npm run dev
```

The BFF starts on port 3026 with `nodemon` for automatic restarts on file changes.

#### Backend Development

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 0.0.0.0:8085
```

For WebSocket support during development, use Daphne instead of the Django development server:

```bash
daphne -b 0.0.0.0 -p 8085 config.asgi:application
```

#### Agent Development

Each agent can be started individually:

```bash
cd backend
source venv/bin/activate
AGENT_NAME=data_acquisition AGENT_PORT=8088 python -m agents.data_acquisition.main
```

#### Running All Agents

To start all agents alongside Django using Docker:

```bash
docker-compose up -d agent-data-acquisition agent-signal-processing agent-hardware-control \
  agent-storage agent-ai-ml agent-notification agent-llm
```

#### Useful Commands

```bash
# View logs for a specific service
docker-compose logs -f django

# Restart a single service
docker-compose restart agent-llm

# Run Django management commands
docker exec -it neural-django python manage.py createsuperuser
docker exec -it neural-django python manage.py shell

# Access PostgreSQL
docker exec -it neural-postgres psql -U neural_admin -d neural_interface

# Monitor Redis pub/sub
docker exec -it neural-redis redis-cli subscribe "agent:heartbeat"

# Rebuild a single service
docker-compose build django && docker-compose up -d django
```

---

## Security

The CNEAv5 platform implements defense-in-depth security across all layers:

### Authentication and Authorization

- **JWT Authentication**: Access tokens (short-lived) and refresh tokens (long-lived) issued by `djangorestframework-simplejwt`. Tokens are validated on every API request.
- **Role-Based Access Control (RBAC)**: Four permission levels control access to platform features:
  - **Admin**: Full system access including user management, agent configuration, and system settings
  - **Researcher**: Create/manage experiments and recordings, run analyses, access all data
  - **Operator**: Start/stop recordings, adjust hardware parameters, view data
  - **Viewer**: Read-only access to recordings, experiments, and visualizations

### Transport Security

- **SSL/TLS Encryption**: All client traffic is encrypted via Nginx with TLSv1.2 and TLSv1.3
- **HTTP to HTTPS Redirect**: Port 80 automatically redirects to HTTPS on port 3025
- **Strong Cipher Suites**: ECDHE key exchange with AES-GCM and CHACHA20-POLY1305
- **HSTS**: Strict-Transport-Security header with 1-year max-age and includeSubDomains
- **Session Security**: SSL session cache enabled, session tickets disabled for forward secrecy

### Application Security

- **Security Headers**: X-Frame-Options (SAMEORIGIN), X-Content-Type-Options (nosniff), X-XSS-Protection, Referrer-Policy (strict-origin-when-cross-origin)
- **CORS Configuration**: Controlled via `django-cors-headers` with explicit allowed origins
- **Rate Limiting**: Express rate limiter on the BFF to prevent abuse
- **Helmet Middleware**: Comprehensive HTTP security headers on the BFF
- **Input Validation**: Pydantic models for agent inputs, Django REST Framework serializers for API inputs
- **SQL Injection Prevention**: Django ORM parameterized queries; no raw SQL
- **CSRF Protection**: Django CSRF middleware for session-based endpoints
- **Request Size Limits**: Nginx `client_max_body_size` set to 50MB

### Infrastructure Security

- **Container Isolation**: Each service runs in its own Docker container with minimal attack surface
- **Volume Mounting**: SSL keys mounted as read-only (`:ro`)
- **Redis Memory Limits**: Capped at 512MB with `allkeys-lru` eviction to prevent memory exhaustion
- **Health Checks**: Automated health monitoring with restart policies to recover from failures
- **Secret Management**: Sensitive values stored in `.env` (excluded from version control via `.gitignore`)

---

## License

This project is licensed under the **MIT License**.

```
MIT License

Copyright (c) 2025 Eminence Tech Solutions

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Contributors and Credits

**Eminence Tech Solutions**

Designed and developed as a capstone project for real-time neural interfacing research. The platform modernizes the legacy CNEAv5 Python/Tkinter desktop application into a production-grade, web-based system with AI-powered analysis capabilities.

---

*For questions, issues, or contributions, please open an issue in the project repository.*
