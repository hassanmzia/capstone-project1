"""
LLM Agent - Full implementation with LangGraph, RAG pipeline, and memory system.

Provides conversational AI capabilities including:
- Chat completions with streaming (SSE)
- RAG (Retrieval-Augmented Generation) queries
- Document indexing and search
- Experiment report generation
- Parameter suggestion
- User preference memory
- LangGraph-based stateful workflows with safety-checked tool calling
"""

import asyncio
import json
import logging
import os
import uuid
from typing import Any, AsyncGenerator, Dict, List, Optional

import httpx
from fastapi import Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from agents.base_agent import BaseAgent

from .graph import NeuralAssistantState, compile_graph
from .memory.long_term import LongTermMemory
from .memory.procedural import ProceduralMemory
from .memory.short_term import ShortTermMemory
from .rag.embedder import OllamaEmbedder
from .rag.indexer import DocumentIndexer
from .rag.pipeline import RAGPipeline
from .rag.retriever import DocumentRetriever
from .providers import get_available_models, parse_model_id, stream_chat as provider_stream_chat
from .tools.mcp_bridge import MCPToolBridge

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Environment configuration
# ---------------------------------------------------------------------------
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:12434")
OLLAMA_CHAT_MODEL = os.getenv("OLLAMA_CHAT_MODEL", "deepseek-r1:7b")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://neural_admin:neural_secure_password_2024@localhost:5435/neural_interface",
)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")


# ---------------------------------------------------------------------------
# Pydantic request / response models
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str = Field(..., description="Message role: 'user', 'assistant', or 'system'")
    content: str = Field(..., description="Message content")


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., description="Conversation messages")
    session_id: Optional[str] = Field(None, description="Session ID for continuity")
    user_id: Optional[int] = Field(None, description="User ID for preference tracking")
    system_context: Optional[Dict[str, Any]] = Field(
        None, description="Active recording, device, config context"
    )
    stream: bool = Field(False, description="Whether to stream the response via SSE")
    model: Optional[str] = Field(None, description="Override the default chat model")
    temperature: float = Field(0.7, description="Sampling temperature")


class ChatResponse(BaseModel):
    agent: str = "llm"
    session_id: str
    reply: str
    requires_confirmation: bool = False
    pending_tool_call: Optional[Dict[str, Any]] = None
    sources: List[Dict[str, Any]] = Field(default_factory=list)
    usage: Dict[str, int] = Field(default_factory=lambda: {
        "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0
    })


class RAGQueryRequest(BaseModel):
    query: str = Field(..., description="Natural language question")
    top_k: int = Field(5, description="Number of documents to retrieve")
    source_types: Optional[List[str]] = Field(
        None, description="Filter by source type"
    )
    context: Optional[Dict[str, Any]] = Field(None, description="Additional context")


class RAGIndexRequest(BaseModel):
    content: str = Field(..., description="Document text content")
    source_type: str = Field(..., description="Document source type")
    source_id: Optional[int] = Field(None, description="Source record ID")
    title: str = Field("", description="Document title")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")


class RAGSearchRequest(BaseModel):
    query: str = Field(..., description="Search query")
    top_k: int = Field(5, description="Maximum results")
    source_types: Optional[List[str]] = Field(None, description="Filter types")


class ReportRequest(BaseModel):
    session_id: str = Field(..., description="Recording session to report on")
    detail_level: str = Field("standard", description="brief, standard, or detailed")
    experiment_id: Optional[int] = Field(None, description="Experiment ID")


class ParameterSuggestionRequest(BaseModel):
    experiment_goal: str = Field(..., description="Experimental objective description")
    constraints: Optional[Dict[str, Any]] = Field(
        None, description="Hardware or safety constraints"
    )


# ---------------------------------------------------------------------------
# LLM Agent
# ---------------------------------------------------------------------------

class LLMAgent(BaseAgent):
    """Agent wrapping large-language-model interactions with LangGraph,
    RAG pipeline, and multi-tier memory system."""

    def __init__(self):
        super().__init__(
            agent_name=os.getenv("AGENT_NAME", "llm"),
            agent_port=int(os.getenv("AGENT_PORT", "8094")),
            agent_type="llm",
        )

        # Components (initialised on startup)
        self._graph = None
        self._embedder: Optional[OllamaEmbedder] = None
        self._retriever: Optional[DocumentRetriever] = None
        self._indexer: Optional[DocumentIndexer] = None
        self._rag_pipeline: Optional[RAGPipeline] = None
        self._short_term: Optional[ShortTermMemory] = None
        self._long_term: Optional[LongTermMemory] = None
        self._procedural: Optional[ProceduralMemory] = None
        self._mcp_bridge: Optional[MCPToolBridge] = None

        self._register_routes()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Initialise all sub-systems on startup."""
        await super().start()

        # Embedder
        self._embedder = OllamaEmbedder(
            base_url=OLLAMA_BASE_URL,
            model=OLLAMA_EMBED_MODEL,
        )

        # RAG components
        self._retriever = DocumentRetriever(
            embedder=self._embedder,
            db_url=DATABASE_URL,
        )
        self._indexer = DocumentIndexer(
            embedder=self._embedder,
            db_url=DATABASE_URL,
        )
        self._rag_pipeline = RAGPipeline(
            embedder=self._embedder,
            retriever=self._retriever,
            llm_url=OLLAMA_BASE_URL,
            model=OLLAMA_CHAT_MODEL,
        )

        # Memory
        self._short_term = ShortTermMemory(redis_url=REDIS_URL)
        self._long_term = LongTermMemory(
            embedder=self._embedder,
            db_url=DATABASE_URL,
        )
        self._procedural = ProceduralMemory(db_url=DATABASE_URL)

        # MCP bridge
        self._mcp_bridge = MCPToolBridge()

        # LangGraph
        self._init_langgraph()

        logger.info(
            "LLM Agent started: ollama=%s, model=%s, embed=%s",
            OLLAMA_BASE_URL, OLLAMA_CHAT_MODEL, OLLAMA_EMBED_MODEL,
        )

    async def stop(self) -> None:
        """Gracefully shut down all sub-systems."""
        if self._embedder:
            await self._embedder.close()
        if self._retriever:
            await self._retriever.close()
        if self._indexer:
            await self._indexer.close()
        if self._short_term:
            await self._short_term.close()
        if self._long_term:
            await self._long_term.close()
        if self._procedural:
            await self._procedural.close()
        await super().stop()

    # ------------------------------------------------------------------
    # LangGraph initialisation
    # ------------------------------------------------------------------

    def _init_langgraph(self) -> None:
        """Compile the LangGraph state machine."""
        try:
            self._graph = compile_graph()
            logger.info("LangGraph Neural Assistant graph compiled.")
        except Exception as exc:
            logger.error("Failed to compile LangGraph: %s", exc)
            self._graph = None

    # ------------------------------------------------------------------
    # FastAPI Routes
    # ------------------------------------------------------------------

    def _register_routes(self) -> None:
        """Register all API endpoints."""

        # --- Chat (with optional SSE streaming) ---
        @self.app.post("/chat")
        async def chat(request: ChatRequest):
            """Chat endpoint with optional SSE streaming."""
            if request.stream:
                return StreamingResponse(
                    self._stream_chat(request),
                    media_type="text/event-stream",
                    headers={
                        "Cache-Control": "no-cache",
                        "Connection": "keep-alive",
                        "X-Accel-Buffering": "no",
                    },
                )
            return await self.handle_chat(request)

        # --- Available models ---
        @self.app.get("/models")
        async def list_models():
            """Return the list of available LLM providers/models."""
            return {"models": get_available_models()}

        # --- RAG endpoints ---
        @self.app.post("/rag/query")
        async def rag_query(request: RAGQueryRequest):
            """Direct RAG query endpoint."""
            return await self.handle_rag_query(request)

        @self.app.post("/rag/index")
        async def rag_index(request: RAGIndexRequest):
            """Index a new document into the knowledge base."""
            return await self.handle_rag_index(request)

        @self.app.get("/rag/search")
        async def rag_search(
            query: str = Query(..., description="Search query"),
            top_k: int = Query(5, description="Max results"),
            source_types: Optional[str] = Query(
                None, description="Comma-separated source types"
            ),
        ):
            """Search for similar documents in the knowledge base."""
            types_list = (
                [s.strip() for s in source_types.split(",")]
                if source_types
                else None
            )
            return await self.handle_rag_search(query, top_k, types_list)

        # --- Report generation ---
        @self.app.post("/report/generate")
        async def generate_report(request: ReportRequest):
            """Generate an experiment/session report."""
            return await self.handle_report(request)

        # --- Parameter suggestion ---
        @self.app.post("/suggest/parameters")
        async def suggest_parameters(request: ParameterSuggestionRequest):
            """Suggest optimal recording/stimulation parameters."""
            return await self.handle_suggest_parameters(request)

        # --- Memory / preferences ---
        @self.app.get("/memory/preferences/{user_id}")
        async def get_preferences(user_id: int):
            """Get learned user preferences."""
            return await self.handle_get_preferences(user_id)

    # ------------------------------------------------------------------
    # Chat handler
    # ------------------------------------------------------------------

    async def handle_chat(self, request: ChatRequest) -> ChatResponse:
        """Process a chat request through the LangGraph pipeline."""
        session_id = request.session_id or str(uuid.uuid4())

        # Load session context from short-term memory
        if self._short_term:
            session_ctx = await self._short_term.get_context(session_id)
            previous_messages = session_ctx.get("messages", [])
        else:
            previous_messages = []

        # Combine previous messages with new ones
        all_messages = previous_messages + [
            {"role": m.role, "content": m.content} for m in request.messages
        ]

        # Build initial state
        initial_state: NeuralAssistantState = {
            "messages": all_messages,
            "system_context": request.system_context or {},
            "rag_results": [],
            "tool_results": [],
            "requires_confirmation": False,
            "pending_tool_call": None,
        }

        # Add user_id to system_context if provided
        if request.user_id:
            initial_state["system_context"]["user_id"] = request.user_id

        # Run the LangGraph
        if self._graph is not None:
            try:
                final_state = await self._graph.ainvoke(initial_state)
            except Exception as exc:
                logger.error("LangGraph execution error: %s", exc)
                final_state = await self._fallback_chat(initial_state)
        else:
            final_state = await self._fallback_chat(initial_state)

        # Extract the assistant reply
        reply = ""
        final_messages = final_state.get("messages", [])
        for msg in reversed(final_messages):
            if isinstance(msg, dict) and msg.get("role") == "assistant":
                reply = msg.get("content", "")
                break

        # Persist to short-term memory
        if self._short_term:
            await self._short_term.store_context(session_id, {
                "messages": final_messages,
                "system_context": final_state.get("system_context", {}),
            })

        return ChatResponse(
            agent=self.agent_name,
            session_id=session_id,
            reply=reply,
            requires_confirmation=final_state.get("requires_confirmation", False),
            pending_tool_call=final_state.get("pending_tool_call"),
            sources=[
                {
                    "title": d.get("title", ""),
                    "source_type": d.get("source_type", ""),
                    "score": d.get("similarity_score", 0),
                }
                for d in final_state.get("rag_results", [])
            ],
        )

    async def _stream_chat(
        self, request: ChatRequest
    ) -> AsyncGenerator[str, None]:
        """Stream the chat response as Server-Sent Events.

        Every pre-streaming step (Redis, router, RAG) is wrapped in
        try/except so that a failure in any sub-system never prevents
        the user from receiving *some* response.
        """
        session_id = request.session_id or str(uuid.uuid4())

        # ── 1. Load session context (graceful fallback) ──────────────
        previous_messages: list = []
        try:
            if self._short_term:
                session_ctx = await self._short_term.get_context(session_id)
                previous_messages = session_ctx.get("messages", [])
        except Exception as exc:
            logger.warning("Failed to load session context: %s", exc)

        all_messages = previous_messages + [
            {"role": m.role, "content": m.content} for m in request.messages
        ]

        initial_state: NeuralAssistantState = {
            "messages": all_messages,
            "system_context": request.system_context or {},
            "rag_results": [],
            "tool_results": [],
            "requires_confirmation": False,
            "pending_tool_call": None,
        }
        if request.user_id:
            initial_state["system_context"]["user_id"] = request.user_id

        from .nodes.responder import BASE_SYSTEM_PROMPT

        # ── 2. Build system prompt (skip router for streaming) ───────
        # The intent router makes a separate LLM call that adds 15-30s
        # latency.  For the streaming path we go straight to the LLM
        # and let it decide how to respond naturally.
        system_prompt = BASE_SYSTEM_PROMPT
        rag_results = initial_state.get("rag_results", [])
        if rag_results:
            rag_block = "\n\nRelevant Knowledge Base Documents:"
            for i, doc in enumerate(rag_results, 1):
                rag_block += (
                    f"\n[{i}] {doc.get('title', 'Untitled')} "
                    f"(score: {doc.get('similarity_score', 0):.2f})\n"
                    f"    {doc.get('content', '')[:500]}"
                )
            system_prompt += rag_block

        llm_messages = [{"role": "system", "content": system_prompt}]
        for msg in all_messages:
            role = msg.get("role", "user") if isinstance(msg, dict) else getattr(msg, "role", "user")
            content = msg.get("content", "") if isinstance(msg, dict) else getattr(msg, "content", "")
            if role in ("user", "assistant"):
                llm_messages.append({"role": role, "content": content})

        # ── 5. Stream from the selected provider ─────────────────────
        model_id = request.model
        full_response = ""
        try:
            async for token in provider_stream_chat(
                messages=llm_messages,
                model_id=model_id,
                temperature=request.temperature,
            ):
                full_response += token
                yield f"data: {json.dumps({'token': token, 'session_id': session_id})}\n\n"
        except Exception as exc:
            error_msg = f"Streaming error: {exc}"
            logger.error("Provider streaming failed: %s", exc)
            yield f"data: {json.dumps({'token': error_msg, 'session_id': session_id})}\n\n"
            full_response = error_msg

        # If the provider returned nothing, send a fallback message
        if not full_response.strip():
            fallback = (
                "I'm sorry, I couldn't generate a response. "
                "Please check that the language model service is running and try again."
            )
            yield f"data: {json.dumps({'token': fallback, 'session_id': session_id})}\n\n"
            full_response = fallback

        # ── 6. Persist conversation (graceful fallback) ──────────────
        all_messages.append({"role": "assistant", "content": full_response})
        try:
            if self._short_term:
                await self._short_term.store_context(session_id, {
                    "messages": all_messages,
                    "system_context": initial_state.get("system_context", {}),
                })
        except Exception as exc:
            logger.warning("Failed to persist session: %s", exc)

        yield f"data: {json.dumps({'done': True, 'session_id': session_id})}\n\n"
        yield "data: [DONE]\n\n"

    async def _fallback_chat(
        self, state: NeuralAssistantState
    ) -> NeuralAssistantState:
        """Fallback chat when LangGraph is not available.

        Calls Ollama directly without the full graph pipeline.
        """
        messages = state.get("messages", [])
        from .nodes.responder import BASE_SYSTEM_PROMPT

        llm_messages = [{"role": "system", "content": BASE_SYSTEM_PROMPT}]
        for msg in messages:
            role = msg.get("role", "user") if isinstance(msg, dict) else getattr(msg, "role", "user")
            content = msg.get("content", "") if isinstance(msg, dict) else getattr(msg, "content", "")
            if role in ("user", "assistant"):
                llm_messages.append({"role": role, "content": content})

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
                resp = await client.post(
                    f"{OLLAMA_BASE_URL}/api/chat",
                    json={
                        "model": OLLAMA_CHAT_MODEL,
                        "messages": llm_messages,
                        "stream": False,
                    },
                )
                resp.raise_for_status()
                reply = resp.json().get("message", {}).get("content", "")
        except Exception as exc:
            logger.error("Fallback chat error: %s", exc)
            reply = (
                "I apologize, but I cannot generate a response right now. "
                "The language model service appears to be unavailable."
            )

        messages_out = list(messages)
        messages_out.append({"role": "assistant", "content": reply})
        return {**state, "messages": messages_out}

    # ------------------------------------------------------------------
    # RAG handlers
    # ------------------------------------------------------------------

    async def handle_rag_query(self, request: RAGQueryRequest) -> Dict[str, Any]:
        """Execute a RAG query and return the grounded answer."""
        if self._rag_pipeline is None:
            return {
                "agent": self.agent_name,
                "error": "RAG pipeline not initialised.",
            }

        try:
            answer = await self._rag_pipeline.query(
                question=request.query,
                context=request.context,
                top_k=request.top_k,
                source_types=request.source_types,
            )
            return {
                "agent": self.agent_name,
                "answer": answer,
                "query": request.query,
            }
        except Exception as exc:
            logger.error("RAG query error: %s", exc)
            return {
                "agent": self.agent_name,
                "error": str(exc),
                "query": request.query,
            }

    async def handle_rag_index(self, request: RAGIndexRequest) -> Dict[str, Any]:
        """Index a document into the knowledge base."""
        if self._indexer is None:
            return {"error": "Document indexer not initialised."}

        try:
            chunks_indexed = await self._indexer.index_document(
                content=request.content,
                source_type=request.source_type,
                source_id=request.source_id,
                title=request.title,
                metadata=request.metadata,
            )
            return {
                "agent": self.agent_name,
                "status": "indexed",
                "chunks_indexed": chunks_indexed,
                "title": request.title,
                "source_type": request.source_type,
            }
        except Exception as exc:
            logger.error("RAG index error: %s", exc)
            return {"agent": self.agent_name, "error": str(exc)}

    async def handle_rag_search(
        self, query: str, top_k: int, source_types: Optional[List[str]]
    ) -> Dict[str, Any]:
        """Search for similar documents."""
        if self._retriever is None:
            return {"error": "Document retriever not initialised."}

        try:
            results = await self._retriever.search(
                query=query, top_k=top_k, source_types=source_types
            )
            return {
                "agent": self.agent_name,
                "query": query,
                "results": results,
                "count": len(results),
            }
        except Exception as exc:
            logger.error("RAG search error: %s", exc)
            return {"agent": self.agent_name, "error": str(exc)}

    # ------------------------------------------------------------------
    # Report generation
    # ------------------------------------------------------------------

    async def handle_report(self, request: ReportRequest) -> Dict[str, Any]:
        """Generate a natural language experiment/session report."""
        # Retrieve relevant context via RAG
        report_query = (
            f"Generate a {request.detail_level} report for session "
            f"{request.session_id}"
        )
        if request.experiment_id:
            report_query += f" from experiment {request.experiment_id}"

        context = {}
        if self._rag_pipeline:
            try:
                answer = await self._rag_pipeline.query(
                    question=report_query,
                    context=context,
                    source_types=["experiment", "annotation", "recording"],
                )
                return {
                    "agent": self.agent_name,
                    "report": answer,
                    "session_id": request.session_id,
                    "detail_level": request.detail_level,
                }
            except Exception as exc:
                logger.error("Report generation error: %s", exc)

        # Fallback: generate without RAG context
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
                resp = await client.post(
                    f"{OLLAMA_BASE_URL}/api/chat",
                    json={
                        "model": OLLAMA_CHAT_MODEL,
                        "messages": [
                            {
                                "role": "system",
                                "content": (
                                    "You are a scientific report generator for neural "
                                    "interface experiments. Generate a clear, structured "
                                    f"report at the '{request.detail_level}' detail level."
                                ),
                            },
                            {"role": "user", "content": report_query},
                        ],
                        "stream": False,
                    },
                )
                resp.raise_for_status()
                report = resp.json().get("message", {}).get("content", "")
                return {
                    "agent": self.agent_name,
                    "report": report,
                    "session_id": request.session_id,
                    "detail_level": request.detail_level,
                }
        except Exception as exc:
            return {
                "agent": self.agent_name,
                "error": f"Report generation failed: {exc}",
            }

    # ------------------------------------------------------------------
    # Parameter suggestion
    # ------------------------------------------------------------------

    async def handle_suggest_parameters(
        self, request: ParameterSuggestionRequest
    ) -> Dict[str, Any]:
        """Suggest optimal parameters for an experimental goal."""
        # Import safety limits
        safety_limits = {
            "vs_max_voltage": 3.6,
            "vs_min_voltage": 0.0,
            "stim_max_current_ua": 500,
            "stim_max_charge_per_phase_nc": 100,
            "max_stim_frequency_hz": 200000,
            "max_pcb_temperature_c": 45.0,
            "max_ic_temperature_c": 42.0,
            "bias_voltage_max": 3.3,
        }

        constraints_text = ""
        if request.constraints:
            constraints_text = "\nUser constraints: " + json.dumps(
                request.constraints, indent=2
            )

        prompt = f"""Given the following experimental goal, suggest optimal recording/stimulation parameters for the CNEAv5 neural interface platform.

Experimental Goal: {request.experiment_goal}
{constraints_text}

Hardware Safety Limits (MUST NOT be exceeded):
{json.dumps(safety_limits, indent=2)}

Provide your suggestions in a structured format with:
1. Recommended parameters and their values
2. Justification for each parameter choice
3. Any warnings or considerations
4. Alternative parameter sets if applicable"""

        # Also check RAG for relevant context
        rag_context = ""
        if self._retriever:
            try:
                docs = await self._retriever.search(
                    query=request.experiment_goal, top_k=3
                )
                if docs:
                    rag_context = "\n\nRelevant knowledge:\n" + "\n".join(
                        f"- {d['content'][:200]}" for d in docs
                    )
            except Exception:
                pass

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
                resp = await client.post(
                    f"{OLLAMA_BASE_URL}/api/chat",
                    json={
                        "model": OLLAMA_CHAT_MODEL,
                        "messages": [
                            {
                                "role": "system",
                                "content": (
                                    "You are a neuroscience research parameter advisor. "
                                    "Suggest safe, effective parameters for neural recordings."
                                    + rag_context
                                ),
                            },
                            {"role": "user", "content": prompt},
                        ],
                        "stream": False,
                    },
                )
                resp.raise_for_status()
                suggestion = resp.json().get("message", {}).get("content", "")
                return {
                    "agent": self.agent_name,
                    "suggestion": suggestion,
                    "experiment_goal": request.experiment_goal,
                    "safety_limits_applied": True,
                }
        except Exception as exc:
            return {
                "agent": self.agent_name,
                "error": f"Parameter suggestion failed: {exc}",
            }

    # ------------------------------------------------------------------
    # Memory / preferences
    # ------------------------------------------------------------------

    async def handle_get_preferences(self, user_id: int) -> Dict[str, Any]:
        """Get learned user preferences."""
        if self._procedural is None:
            return {"error": "Procedural memory not initialised."}

        try:
            prefs = await self._procedural.get_preferences(user_id)
            return {
                "agent": self.agent_name,
                "user_id": user_id,
                "preferences": prefs,
            }
        except Exception as exc:
            logger.error("Get preferences error: %s", exc)
            return {"agent": self.agent_name, "error": str(exc)}

    # ------------------------------------------------------------------
    # MCP tool declarations
    # ------------------------------------------------------------------

    def get_mcp_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "llm.chat",
                "description": (
                    "Chat with the neural interface assistant about experiments, "
                    "data, and device configuration."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "messages": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "role": {"type": "string"},
                                    "content": {"type": "string"},
                                },
                                "required": ["role", "content"],
                            },
                        },
                        "session_id": {"type": "string"},
                        "stream": {"type": "boolean", "default": False},
                    },
                    "required": ["messages"],
                },
            },
            {
                "name": "llm.query_knowledge",
                "description": (
                    "Query the neuroscience and device knowledge base using RAG."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Natural language question",
                        },
                        "top_k": {"type": "integer", "default": 5},
                        "source_types": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["query"],
                },
            },
            {
                "name": "llm.index_document",
                "description": "Index a document into the RAG knowledge base.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "content": {"type": "string"},
                        "source_type": {"type": "string"},
                        "title": {"type": "string", "default": ""},
                        "source_id": {"type": "integer"},
                        "metadata": {"type": "object"},
                    },
                    "required": ["content", "source_type"],
                },
            },
            {
                "name": "llm.generate_report",
                "description": (
                    "Generate a natural language report summarising a recording "
                    "session or experiment."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "session_id": {
                            "type": "string",
                            "description": "Recording session to report on",
                        },
                        "detail_level": {
                            "type": "string",
                            "enum": ["brief", "standard", "detailed"],
                            "default": "standard",
                        },
                        "experiment_id": {"type": "integer"},
                    },
                    "required": ["session_id"],
                },
            },
            {
                "name": "llm.suggest_parameters",
                "description": (
                    "Use LLM reasoning to suggest recording or stimulation "
                    "parameters for a given experimental goal."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "experiment_goal": {
                            "type": "string",
                            "description": "Description of the experimental objective",
                        },
                        "constraints": {
                            "type": "object",
                            "description": "Hardware or safety constraints",
                        },
                    },
                    "required": ["experiment_goal"],
                },
            },
            {
                "name": "llm.explain_anomaly",
                "description": (
                    "Provide a natural language explanation for a detected "
                    "anomaly in neural data."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "anomaly_id": {
                            "type": "string",
                            "description": "Anomaly identifier",
                        },
                        "context": {
                            "type": "object",
                            "description": "Additional context",
                        },
                    },
                    "required": ["anomaly_id"],
                },
            },
            {
                "name": "llm.natural_language_query",
                "description": (
                    "Translate a natural language question into structured "
                    "queries across neural data storage."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "question": {
                            "type": "string",
                            "description": "Natural language question about stored data",
                        },
                    },
                    "required": ["question"],
                },
            },
            {
                "name": "llm.get_preferences",
                "description": "Retrieve learned user preferences.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "user_id": {
                            "type": "integer",
                            "description": "User ID",
                        },
                    },
                    "required": ["user_id"],
                },
            },
        ]


def main() -> None:
    agent = LLMAgent()
    agent.run()


if __name__ == "__main__":
    main()
