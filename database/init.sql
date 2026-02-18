-- CNEAv5 Neural Interfacing Platform — Database Initialization
-- Runs on first PostgreSQL startup via docker-entrypoint-initdb.d

-- Create langfuse database for LLM observability
CREATE DATABASE langfuse;

-- Enable extensions on neural_interface database
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS vector;

-- ============ USERS & AUTH ============
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(150) UNIQUE NOT NULL,
    email VARCHAR(254),
    password_hash VARCHAR(128) NOT NULL,
    first_name VARCHAR(150) DEFAULT '',
    last_name VARCHAR(150) DEFAULT '',
    role VARCHAR(20) DEFAULT 'researcher' CHECK (role IN ('admin', 'researcher', 'viewer')),
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ EXPERIMENTS ============
CREATE TABLE IF NOT EXISTS experiments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    device_name VARCHAR(100) DEFAULT '',
    experiment_mode VARCHAR(50) DEFAULT '',
    protocol_type VARCHAR(50) DEFAULT 'general',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'configured', 'running', 'completed', 'failed', 'archived')),
    tags JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ RECORDINGS ============
CREATE TABLE IF NOT EXISTS recordings (
    id SERIAL PRIMARY KEY,
    experiment_id INTEGER REFERENCES experiments(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    duration_seconds FLOAT,
    sample_rate FLOAT NOT NULL DEFAULT 10000,
    channel_count INTEGER DEFAULT 4096,
    file_path VARCHAR(500),
    file_size_bytes BIGINT DEFAULT 0,
    total_samples BIGINT DEFAULT 0,
    total_spikes BIGINT DEFAULT 0,
    packet_loss_count BIGINT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'recording' CHECK (status IN ('recording', 'completed', 'failed', 'processing', 'archived')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ HARDWARE CONFIGS ============
CREATE TABLE IF NOT EXISTS hardware_configs (
    id SERIAL PRIMARY KEY,
    recording_id INTEGER REFERENCES recordings(id) ON DELETE CASCADE,
    experiment_id INTEGER REFERENCES experiments(id) ON DELETE CASCADE,
    name VARCHAR(255) DEFAULT '',
    bias_params JSONB NOT NULL DEFAULT '{}',
    clock_config JSONB NOT NULL DEFAULT '{}',
    gain_mode VARCHAR(50) DEFAULT 'GainX100',
    pixel_config JSONB DEFAULT '{}',
    tia_config JSONB DEFAULT '{}',
    stim_config JSONB DEFAULT '{}',
    waveform_config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ CONFIG PRESETS ============
CREATE TABLE IF NOT EXISTS config_presets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    category VARCHAR(50) DEFAULT 'full' CHECK (category IN ('bias', 'clock', 'pixel', 'stimulation', 'tia', 'gain', 'full')),
    config_data JSONB NOT NULL DEFAULT '{}',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ SPIKE EVENTS (TimescaleDB hypertable) ============
CREATE TABLE IF NOT EXISTS spike_events (
    time TIMESTAMPTZ NOT NULL,
    recording_id INTEGER NOT NULL,
    site_id INTEGER NOT NULL,
    amplitude FLOAT,
    threshold FLOAT,
    sample_index BIGINT
);
SELECT create_hypertable('spike_events', 'time', if_not_exists => TRUE);

-- ============ SYSTEM TELEMETRY (TimescaleDB hypertable) ============
CREATE TABLE IF NOT EXISTS system_telemetry (
    time TIMESTAMPTZ NOT NULL,
    agent_name VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value FLOAT NOT NULL,
    metadata JSONB DEFAULT '{}'
);
SELECT create_hypertable('system_telemetry', 'time', if_not_exists => TRUE);

-- ============ AUDIT LOG ============
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INTEGER,
    details JSONB DEFAULT '{}',
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ ELECTRODE SITES ============
CREATE TABLE IF NOT EXISTS electrode_sites (
    id SERIAL PRIMARY KEY,
    site_index INTEGER UNIQUE NOT NULL,
    row_index INTEGER NOT NULL,
    col_index INTEGER NOT NULL,
    is_stim_capable BOOLEAN DEFAULT FALSE,
    impedance_ohms FLOAT,
    notes TEXT DEFAULT '',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'noisy', 'dead', 'excluded'))
);

-- ============ WAVEFORM LIBRARY ============
CREATE TABLE IF NOT EXISTS waveforms (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    waveform_type VARCHAR(50) DEFAULT 'arbitrary' CHECK (waveform_type IN ('sine', 'square', 'triangle', 'sawtooth', 'pulse', 'arbitrary')),
    sample_count INTEGER NOT NULL,
    sample_data JSONB NOT NULL DEFAULT '[]',
    parameters JSONB DEFAULT '{}',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ ANNOTATIONS ============
CREATE TABLE IF NOT EXISTS annotations (
    id SERIAL PRIMARY KEY,
    recording_id INTEGER REFERENCES recordings(id) ON DELETE CASCADE,
    timestamp_offset FLOAT,
    annotation_type VARCHAR(50) DEFAULT 'note' CHECK (annotation_type IN ('event', 'note', 'artifact', 'marker', 'issue', 'resolution')),
    content TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ RAG DOCUMENTS (pgvector) ============
CREATE TABLE IF NOT EXISTS rag_documents (
    id SERIAL PRIMARY KEY,
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('experiment', 'config', 'annotation', 'troubleshooting', 'protocol', 'chat')),
    source_id INTEGER,
    title VARCHAR(500) DEFAULT '',
    content TEXT NOT NULL,
    embedding vector(768),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rag_documents_embedding
    ON rag_documents USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_rag_documents_source
    ON rag_documents (source_type, source_id);

-- ============ CHAT HISTORY ============
CREATE TABLE IF NOT EXISTS chat_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(100),
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    tool_calls JSONB,
    embedding vector(768),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_history_embedding
    ON chat_history USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_chat_history_session
    ON chat_history (session_id, created_at);

-- ============ AGENT REGISTRY ============
CREATE TABLE IF NOT EXISTS agent_registry (
    id SERIAL PRIMARY KEY,
    agent_name VARCHAR(100) UNIQUE NOT NULL,
    agent_url VARCHAR(500) NOT NULL,
    agent_type VARCHAR(50) NOT NULL,
    port INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'unknown' CHECK (status IN ('healthy', 'unhealthy', 'unknown', 'stopped')),
    capabilities JSONB DEFAULT '[]',
    mcp_tools JSONB DEFAULT '[]',
    last_heartbeat TIMESTAMPTZ,
    registered_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ USER PREFERENCES (Procedural Memory) ============
CREATE TABLE IF NOT EXISTS user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    preference_key VARCHAR(200) NOT NULL,
    preference_value JSONB NOT NULL,
    learned_from VARCHAR(100) DEFAULT 'manual',
    confidence FLOAT DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, preference_key)
);

-- ============ SEED DATA ============

-- Initialize 4096 electrode sites (64x64 array)
INSERT INTO electrode_sites (site_index, row_index, col_index, is_stim_capable)
SELECT
    s,
    s / 64,
    s % 64,
    FALSE
FROM generate_series(0, 4095) AS s
ON CONFLICT (site_index) DO NOTHING;

-- Create default admin user (password: admin123 — change in production)
INSERT INTO users (username, email, password_hash, role)
VALUES ('admin', 'admin@neural-lab.local', 'pbkdf2_sha256$720000$placeholder$hash=', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Create default config presets
INSERT INTO config_presets (name, description, category, config_data, is_default) VALUES
('In-Vivo Cortical', 'Standard cortical recording preset', 'full', '{
    "gain_mode": "GainX300",
    "spike_threshold_sigma": 4,
    "noise_reduction": true,
    "sample_rate_divider": 20000,
    "bias": {"BP_OTA": 1.5, "BP_CI": 1.2, "VR": 1.0, "NMIR": 0.8}
}', true),
('In-Vitro Slice', 'Brain slice recording preset', 'full', '{
    "gain_mode": "GainX100",
    "spike_threshold_sigma": 5,
    "noise_reduction": true,
    "sample_rate_divider": 20000,
    "bias": {"BP_OTA": 1.2, "BP_CI": 1.0, "VR": 0.8, "NMIR": 0.6}
}', true),
('Impedance Test', 'Electrode impedance measurement', 'full', '{
    "gain_mode": "GainX40",
    "spike_threshold_sigma": 5,
    "noise_reduction": false,
    "sample_rate_divider": 10000
}', true)
ON CONFLICT DO NOTHING;
