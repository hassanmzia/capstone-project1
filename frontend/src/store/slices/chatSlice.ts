import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { ChatMessage, ToolCall } from "@/types/neural";

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  sessionId: string | null;
  isPanelOpen: boolean;
  error: string | null;
  suggestedActions: string[];
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
    clearMessages(state) {
      state.messages = [initialState.messages[0]];
      state.sessionId = null;
    },
  },
});

export const {
  addMessage, updateLastMessage, addToolCallToMessage, updateToolCallStatus,
  setStreaming, setSessionId, togglePanel, openPanel, closePanel,
  setChatError, setSuggestedActions, clearMessages,
} = chatSlice.actions;

export default chatSlice.reducer;
