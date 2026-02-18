import { useState, useRef, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import type { RootState } from "@/store";
import {
  addMessage,
  togglePanel,
  closePanel,
  setStreaming,
  setSuggestedActions,
} from "@/store/slices/chatSlice";
import {
  X,
  Send,
  Loader2,
  Bot,
  User,
  Wrench,
  ChevronDown,
  Minimize2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { ChatMessage, ToolCall } from "@/types/neural";

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

export default function ChatPanel() {
  const dispatch = useDispatch();
  const { messages, isPanelOpen, isStreaming, suggestedActions } = useSelector(
    (state: RootState) => state.chat
  );
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    dispatch(addMessage(userMessage));
    setInput("");
    dispatch(setStreaming(true));

    // Simulate assistant response
    setTimeout(() => {
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `I understand you want to "${input.trim()}". Let me help you with that. This is a placeholder response - the actual LLM integration will stream responses from the backend agent.`,
        timestamp: new Date().toISOString(),
      };
      dispatch(addMessage(assistantMessage));
      dispatch(setStreaming(false));
      dispatch(
        setSuggestedActions([
          "Show more details",
          "Run analysis",
          "Export results",
          "Configure parameters",
        ])
      );
    }, 1500);
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
        </div>
        <div className="flex items-center gap-1">
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
