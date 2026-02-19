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
import ReactMarkdown from "react-markdown";
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
  Download,
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

/**
 * Generate a standalone HTML report from a markdown message for PDF download.
 */
function generateReportHTML(content: string, timestamp: string): string {
  // Simple markdown-to-HTML converter for tables, headings, bold, lists
  let html = content;

  // Convert markdown tables to HTML tables
  html = html.replace(
    /^(\|.+\|)\n(\|[\s:|-]+\|)\n((?:\|.+\|\n?)+)/gm,
    (_match, headerRow: string, _separator: string, bodyRows: string) => {
      const headers = headerRow
        .split("|")
        .filter((c: string) => c.trim())
        .map((c: string) => `<th>${c.trim()}</th>`)
        .join("");
      const rows = bodyRows
        .trim()
        .split("\n")
        .map((row: string) => {
          const cells = row
            .split("|")
            .filter((c: string) => c.trim())
            .map((c: string) => {
              let cellContent = c.trim();
              // Bold text in cells
              cellContent = cellContent.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
              return `<td>${cellContent}</td>`;
            })
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");
      return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    }
  );

  // Headings
  html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/((?:<li>.+<\/li>\n?)+)/g, "<ul>$1</ul>");

  // Horizontal rules
  html = html.replace(/^---$/gm, "<hr/>");

  // Paragraphs - wrap non-tag lines
  html = html.replace(/^(?!<[a-z/])(.+)$/gm, "<p>$1</p>");

  // Clean up double-wrapped or empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, "");

  const dateStr = new Date(timestamp).toLocaleString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>CNEAv5 - AI Assistant Report</title>
<style>
  @page { margin: 20mm 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    color: #1e293b;
    line-height: 1.6;
    padding: 0;
    background: #fff;
  }
  .header {
    background: linear-gradient(135deg, #0f172a, #1e293b);
    color: white;
    padding: 24px 32px;
    margin-bottom: 24px;
    border-radius: 0 0 12px 12px;
  }
  .header h1 {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 4px;
    letter-spacing: 0.5px;
  }
  .header .subtitle {
    font-size: 12px;
    color: #94a3b8;
  }
  .header .logo {
    font-size: 11px;
    color: #06b6d4;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    margin-bottom: 8px;
  }
  .content {
    padding: 0 32px 32px;
  }
  h2 {
    font-size: 17px;
    font-weight: 700;
    color: #0f172a;
    border-bottom: 2px solid #06b6d4;
    padding-bottom: 6px;
    margin: 20px 0 12px;
  }
  h3 {
    font-size: 14px;
    font-weight: 700;
    color: #334155;
    margin: 16px 0 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  h4 {
    font-size: 13px;
    font-weight: 600;
    color: #475569;
    margin: 12px 0 6px;
  }
  p {
    margin: 6px 0;
    font-size: 13px;
    color: #334155;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 12px;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    overflow: hidden;
  }
  thead {
    background: #0f172a;
    color: white;
  }
  th {
    padding: 10px 14px;
    text-align: left;
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    border-right: 1px solid rgba(255,255,255,0.1);
  }
  th:last-child { border-right: none; }
  td {
    padding: 8px 14px;
    border-top: 1px solid #e2e8f0;
    border-right: 1px solid #e2e8f0;
    color: #334155;
  }
  td:last-child { border-right: none; }
  tbody tr:nth-child(even) {
    background: #f8fafc;
  }
  tbody tr:hover {
    background: #f1f5f9;
  }
  strong {
    font-weight: 600;
    color: #0f172a;
  }
  em {
    color: #64748b;
    font-style: normal;
  }
  ul, ol {
    margin: 8px 0 8px 20px;
    font-size: 13px;
  }
  li {
    margin: 3px 0;
    color: #334155;
  }
  hr {
    border: none;
    border-top: 1px solid #e2e8f0;
    margin: 16px 0;
  }
  .footer {
    margin-top: 32px;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
    font-size: 10px;
    color: #94a3b8;
    text-align: center;
  }
  @media print {
    .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    thead { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tbody tr:nth-child(even) { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="logo">CNEAv5 Neural Interface Platform</div>
    <h1>AI Assistant Report</h1>
    <div class="subtitle">Generated: ${dateStr}</div>
  </div>
  <div class="content">
    ${html}
    <div class="footer">
      CNEAv5 Neural Interface Research Platform &mdash; AI Assistant Report &mdash; ${dateStr}
    </div>
  </div>
</body>
</html>`;
}

function downloadAsPDF(content: string, timestamp: string) {
  const html = generateReportHTML(content, timestamp);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);

  // Open styled report in new window for print/save as PDF
  const printWindow = window.open(url, "_blank");
  if (printWindow) {
    printWindow.onload = () => {
      // Brief delay to let styles render
      setTimeout(() => {
        printWindow.print();
      }, 400);
    };
  }

  // Clean up blob after a delay
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
          {isUser ? (
            message.content
          ) : (
            <div className="chat-markdown">
              <ReactMarkdown
                components={{
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-3 rounded-lg border-2 border-neural-border-bright shadow-sm">
                      <table className="w-full text-xs border-collapse">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead className="bg-neural-bg border-b-2 border-neural-accent-cyan/30 text-neural-text-secondary">
                      {children}
                    </thead>
                  ),
                  th: ({ children }) => (
                    <th className="px-3 py-2 text-left font-bold text-[11px] uppercase tracking-wider whitespace-nowrap text-neural-accent-cyan border-r border-neural-border last:border-r-0">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="px-3 py-2 border-t border-neural-border border-r border-neural-border last:border-r-0 text-neural-text-primary font-mono text-[11px] whitespace-nowrap">
                      {children}
                    </td>
                  ),
                  tr: ({ children }) => (
                    <tr className="hover:bg-neural-accent-cyan/5 neural-transition">
                      {children}
                    </tr>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-bold text-neural-accent-cyan">{children}</strong>
                  ),
                  em: ({ children }) => (
                    <em className="text-neural-text-secondary not-italic">{children}</em>
                  ),
                  ul: ({ children }) => (
                    <ul className="my-1.5 ml-3 space-y-0.5 list-disc list-outside marker:text-neural-accent-cyan/60">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="my-1.5 ml-3 space-y-0.5 list-decimal list-outside marker:text-neural-accent-cyan/60">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className="text-sm leading-relaxed">{children}</li>
                  ),
                  code: ({ children, className }) => {
                    const isBlock = className?.includes("language-");
                    return isBlock ? (
                      <pre className="my-2 p-2 rounded-lg bg-neural-bg border border-neural-border overflow-x-auto">
                        <code className="text-xs font-mono text-neural-accent-green">{children}</code>
                      </pre>
                    ) : (
                      <code className="px-1 py-0.5 rounded bg-neural-bg text-xs font-mono text-neural-accent-amber">
                        {children}
                      </code>
                    );
                  },
                  h2: ({ children }) => (
                    <h2 className="text-sm font-bold text-neural-accent-cyan mt-3 mb-2 pb-1 border-b border-neural-accent-cyan/30">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-xs font-bold text-neural-text-primary uppercase tracking-wider mt-3 mb-1.5 flex items-center gap-1.5 border-b border-neural-border pb-1">
                      {children}
                    </h3>
                  ),
                  h4: ({ children }) => (
                    <h4 className="text-xs font-semibold text-neural-text-secondary mt-2 mb-1">{children}</h4>
                  ),
                  p: ({ children }) => (
                    <p className="my-1 leading-relaxed">{children}</p>
                  ),
                  hr: () => (
                    <hr className="my-2 border-neural-border" />
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
          {message.isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-neural-accent-cyan ml-0.5 animate-neural-pulse" />
          )}
        </div>

        {message.toolCalls?.map((tc) => (
          <ToolCallDisplay key={tc.id} toolCall={tc} />
        ))}

        <div className="flex items-center gap-2 mt-1 px-1">
          <span className="text-xs text-neural-text-muted">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {!isUser && !message.isStreaming && message.content.length > 20 && (
            <button
              onClick={() => downloadAsPDF(message.content, message.timestamp)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-neural-text-muted hover:text-neural-accent-cyan hover:bg-neural-accent-cyan/10 neural-transition"
              title="Download as PDF report"
            >
              <Download className="w-3 h-3" />
              <span>PDF</span>
            </button>
          )}
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
    <div className="fixed inset-0 z-40 md:relative md:inset-auto md:z-auto w-full md:w-96 flex flex-col bg-neural-surface border-l border-neural-border h-full">
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
