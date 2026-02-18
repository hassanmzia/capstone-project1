import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { ChatMessage, ToolCall } from "@/types/neural";

export interface LLMModel {
  id: string;
  name: string;
  provider: string;
  description: string;
}

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  sessionId: string | null;
  isPanelOpen: boolean;
  error: string | null;
  suggestedActions: string[];
  selectedModelId: string;
  availableModels: LLMModel[];
}

const initialState: ChatState = {
  messages: [
    {
      id: "system-welcome",
      role: "assistant",
      content: "Welcome to CNEAv5 Neural Interface. I can help you configure hardware, manage recordings, analyze neural data, and control experiments. What would you like to do?",
      timestamp: new Date().toISOString(),
    },
  ],
  isStreaming: false,
  sessionId: null,
  isPanelOpen: false,
  error: null,
  suggestedActions: [
    "Start a new recording",
    "Show system status",
    "Load default preset",
    "Run spike sorting",
  ],
  selectedModelId: "ollama/deepseek-r1:7b",
  availableModels: [
    { id: "ollama/deepseek-r1:7b", name: "DeepSeek-R1 7B", provider: "ollama", description: "Local - fast reasoning model (default)" },
    { id: "ollama/llama3:8b", name: "Llama 3 8B", provider: "ollama", description: "Local - Meta's open model" },
    { id: "openai/gpt-4o", name: "GPT-4o", provider: "openai", description: "OpenAI - flagship multimodal model" },
    { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", description: "OpenAI - fast and affordable" },
    { id: "anthropic/claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", provider: "anthropic", description: "Anthropic - balanced speed & intelligence" },
    { id: "anthropic/claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", provider: "anthropic", description: "Anthropic - fast and compact" },
  ],
};

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    addMessage(state, action: PayloadAction<ChatMessage>) {
      state.messages.push(action.payload);
    },
    updateLastMessage(state, action: PayloadAction<{ content: string }>) {
      const last = state.messages[state.messages.length - 1];
      if (last && last.role === "assistant") {
        last.content = action.payload.content;
      }
    },
    addToolCallToMessage(state, action: PayloadAction<{ messageId: string; toolCall: ToolCall }>) {
      const msg = state.messages.find((m) => m.id === action.payload.messageId);
      if (msg) {
        if (!msg.toolCalls) msg.toolCalls = [];
        msg.toolCalls.push(action.payload.toolCall);
      }
    },
    updateToolCallStatus(
      state,
      action: PayloadAction<{ messageId: string; toolCallId: string; status: ToolCall["status"]; result?: string }>
    ) {
      const msg = state.messages.find((m) => m.id === action.payload.messageId);
      const tc = msg?.toolCalls?.find((t) => t.id === action.payload.toolCallId);
      if (tc) {
        tc.status = action.payload.status;
        if (action.payload.result !== undefined) tc.result = action.payload.result;
      }
    },
    setStreaming(state, action: PayloadAction<boolean>) {
      state.isStreaming = action.payload;
      // When streaming ends, clear isStreaming flag on the last assistant message
      if (!action.payload) {
        const last = state.messages[state.messages.length - 1];
        if (last && last.role === "assistant") {
          last.isStreaming = false;
        }
      }
    },
    setSessionId(state, action: PayloadAction<string>) {
      state.sessionId = action.payload;
    },
    togglePanel(state) {
      state.isPanelOpen = !state.isPanelOpen;
    },
    openPanel(state) {
      state.isPanelOpen = true;
    },
    closePanel(state) {
      state.isPanelOpen = false;
    },
    setChatError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    setSuggestedActions(state, action: PayloadAction<string[]>) {
      state.suggestedActions = action.payload;
    },
    setSelectedModel(state, action: PayloadAction<string>) {
      state.selectedModelId = action.payload;
    },
    setAvailableModels(state, action: PayloadAction<LLMModel[]>) {
      state.availableModels = action.payload;
    },
    clearMessages(state) {
      state.messages = [initialState.messages[0]];
      state.sessionId = null;
    },
  },
});

export const {
  addMessage, updateLastMessage, addToolCallToMessage, updateToolCallStatus,
  setStreaming, setSessionId, togglePanel, openPanel, closePanel,
  setChatError, setSuggestedActions, setSelectedModel, setAvailableModels,
  clearMessages,
} = chatSlice.actions;

export default chatSlice.reducer;
