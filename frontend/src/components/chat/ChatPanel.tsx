import { useState, useRef, useEffect, useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import type { RootState } from "@/store";
import {
  addMessage,
  updateLastMessage,
  closePanel,
  setStreaming,
  setSuggestedActions,
  setSessionId,
  setSelectedModel,
} from "@/store/slices/chatSlice";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  X,
  Send,
  Loader2,
  Bot,
  User,
  Wrench,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
} from "lucide-react";
import type { ChatMessage, ToolCall } from "@/types/neural";
import { generateId } from "@/utils/uuid";

function ToolCallDisplay({ toolCall }: { toolCall: ToolCall }) {
  return (
    <div className="my-2 p-2 rounded-lg bg-neural-bg border border-neural-border text-xs">
      <div className="flex items-center gap-2 mb-1">
        <Wrench className="w-3 h-3 text-neural-accent-amber" />
        <span className="font-mono text-neural-accent-amber">{toolCall.name}</span>
        {toolCall.status === "completed" ? (
          <CheckCircle2 className="w-3 h-3 text-neural-accent-green ml-auto" />
        ) : toolCall.status === "running" ? (
          <Loader2 className="w-3 h-3 text-neural-accent-cyan ml-auto animate-spin" />
        ) : toolCall.status === "error" ? (
          <AlertCircle className="w-3 h-3 text-neural-accent-red ml-auto" />
        ) : null}
      </div>
      {toolCall.result && (
        <pre className="text-neural-text-muted whitespace-pre-wrap overflow-hidden max-h-20">
          {toolCall.result}
        </pre>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
          isUser ? "bg-neural-accent-blue/20" : "bg-neural-accent-cyan/20"
        }`}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5 text-neural-accent-blue" />
        ) : (
          <Bot className="w-3.5 h-3.5 text-neural-accent-cyan" />
        )}
      </div>

      <div className={`max-w-[85%] ${isUser ? "text-right" : ""}`}>
        <div
          className={`inline-block rounded-xl px-3 py-2 text-sm leading-relaxed ${
            isUser
              ? "bg-neural-accent-blue/20 text-neural-text-primary rounded-tr-sm"
              : "bg-neural-surface-alt text-neural-text-primary rounded-tl-sm"
          }`}
        >
          {message.content}
          {message.isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-neural-accent-cyan ml-0.5 animate-neural-pulse" />
          )}
        </div>

        {message.toolCalls?.map((tc) => (
          <ToolCallDisplay key={tc.id} toolCall={tc} />
        ))}

        <div className="text-xs text-neural-text-muted mt-1 px-1">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

function ModelSelector() {
  const dispatch = useDispatch();
  const { selectedModelId, availableModels } = useSelector(
    (state: RootState) => state.chat
  );
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedModel = availableModels.find((m) => m.id === selectedModelId);
  const providerColor: Record<string, string> = {
    ollama: "text-neural-accent-green",
    openai: "text-neural-accent-amber",
    anthropic: "text-neural-accent-purple",
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-neural-surface-alt border border-neural-border hover:border-neural-accent-cyan/40 neural-transition"
      >
        <span className={providerColor[selectedModel?.provider ?? "ollama"]}>
          {selectedModel?.name ?? "Select model"}
        </span>
        <ChevronDown className={`w-3 h-3 text-neural-text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-neural-surface border border-neural-border rounded-lg shadow-xl z-50 py-1 max-h-72 overflow-y-auto">
          {["ollama", "openai", "anthropic"].map((provider) => {
            const models = availableModels.filter((m) => m.provider === provider);
            if (models.length === 0) return null;
            return (
              <div key={provider}>
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neural-text-muted">
                  {provider === "ollama" ? "Local (Ollama)" : provider === "openai" ? "OpenAI" : "Anthropic"}
                </div>
                {models.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      dispatch(setSelectedModel(model.id));
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-neural-surface-alt neural-transition ${
                      model.id === selectedModelId ? "bg-neural-accent-cyan/10" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-neural-text-primary">{model.name}</span>
                      {model.id === selectedModelId && (
                        <CheckCircle2 className="w-3 h-3 text-neural-accent-cyan" />
                      )}
                    </div>
                    <div className="text-[10px] text-neural-text-muted mt-0.5">{model.description}</div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ChatPanel() {
  const dispatch = useDispatch();
  const { messages, isPanelOpen, isStreaming, suggestedActions, sessionId, selectedModelId } = useSelector(
    (state: RootState) => state.chat
  );
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamBufferRef = useRef("");
  const assistantMsgIdRef = useRef<string | null>(null);
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Safety net: force-reset streaming after 90s if chat.end never arrives
  useEffect(() => {
    if (isStreaming) {
      streamTimeoutRef.current = setTimeout(() => {
        dispatch(setStreaming(false));
        assistantMsgIdRef.current = null;
        streamBufferRef.current = "";
      }, 90_000);
    } else if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
      streamTimeoutRef.current = null;
    }
    return () => {
      if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
    };
  }, [isStreaming, dispatch]);

  // Ensure we have a session ID
  useEffect(() => {
    if (!sessionId) {
      dispatch(setSessionId(generateId()));
    }
  }, [sessionId, dispatch]);

  const handleWsMessage = useCallback(
    (data: unknown) => {
      const msg = data as { type?: string; token?: string };

      if (msg.type === "chat.token" && msg.token) {
        if (!assistantMsgIdRef.current) {
          // Create assistant message on first token
          const id = generateId();
          assistantMsgIdRef.current = id;
          streamBufferRef.current = msg.token;
          dispatch(
            addMessage({
              id,
              role: "assistant",
              content: msg.token,
              timestamp: new Date().toISOString(),
              isStreaming: true,
            })
          );
        } else {
          streamBufferRef.current += msg.token;
          dispatch(updateLastMessage({ content: streamBufferRef.current }));
        }
      } else if (msg.type === "chat.end") {
        dispatch(setStreaming(false));
        assistantMsgIdRef.current = null;
        streamBufferRef.current = "";
        dispatch(
          setSuggestedActions([
            "Show more details",
            "Run analysis",
            "Export results",
            "Configure parameters",
          ])
        );
      } else if ((msg as Record<string, unknown>).error) {
        dispatch(setStreaming(false));
        assistantMsgIdRef.current = null;
        streamBufferRef.current = "";
      }
    },
    [dispatch]
  );

  const { sendMessage, isConnected } = useWebSocket({
    url: "/ws/chat",
    onMessage: handleWsMessage,
    reconnect: true,
    reconnectInterval: 3000,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;

    if (!isConnected) {
      dispatch(
        addMessage({
          id: generateId(),
          role: "assistant",
          content: "Unable to reach the AI assistant. Please wait for the connection to be restored.",
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    dispatch(addMessage(userMessage));
    dispatch(setStreaming(true));
    dispatch(setSuggestedActions([]));

    sendMessage({
      type: "chat.message",
      session_id: sessionId,
      content: input.trim(),
      model: selectedModelId,
    });

    setInput("");
  };

  const handleSuggestedAction = (action: string) => {
    setInput(action);
  };

  if (!isPanelOpen) return null;

  return (
    <div className="w-96 flex flex-col bg-neural-surface border-l border-neural-border h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-neural-border shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-neural-accent-purple" />
          <span className="text-sm font-semibold text-neural-text-primary">AI Assistant</span>
          <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-neural-accent-green" : "bg-neural-text-muted"}`} title={isConnected ? "Connected" : "Disconnected"} />
        </div>
        <div className="flex items-center gap-1">
          <ModelSelector />
          <button
            onClick={() => dispatch(closePanel())}
            className="p-1.5 rounded-lg text-neural-text-muted hover:text-neural-text-primary hover:bg-neural-surface-alt neural-transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isStreaming && (
          <div className="flex items-center gap-2 text-xs text-neural-text-muted">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested actions */}
      {suggestedActions.length > 0 && !isStreaming && (
        <div className="px-4 py-2 border-t border-neural-border/50">
          <div className="flex flex-wrap gap-1.5">
            {suggestedActions.map((action) => (
              <button
                key={action}
                onClick={() => handleSuggestedAction(action)}
                className="px-2.5 py-1 rounded-full text-xs bg-neural-surface-alt text-neural-text-secondary hover:text-neural-accent-cyan hover:bg-neural-accent-cyan/10 border border-neural-border hover:border-neural-accent-cyan/30 neural-transition"
              >
                {action}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-neural-border shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about recordings, hardware, analysis..."
            rows={1}
            className="flex-1 bg-neural-surface-alt border border-neural-border rounded-lg px-3 py-2 text-sm text-neural-text-primary placeholder:text-neural-text-muted resize-none focus:outline-none focus:border-neural-accent-cyan/50 max-h-24"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="p-2 rounded-lg bg-neural-accent-cyan/20 text-neural-accent-cyan hover:bg-neural-accent-cyan/30 disabled:opacity-30 disabled:cursor-not-allowed neural-transition shrink-0"
          >
            {isStreaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
