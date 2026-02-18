import { configureStore } from "@reduxjs/toolkit";
import recordingReducer from "./slices/recordingSlice";
import configReducer from "./slices/configSlice";
import visualizationReducer from "./slices/visualizationSlice";
import agentReducer from "./slices/agentSlice";
import chatReducer from "./slices/chatSlice";

export const store = configureStore({
  reducer: {
    recording: recordingReducer,
    config: configReducer,
    visualization: visualizationReducer,
    agents: agentReducer,
    chat: chatReducer,
  },
  devTools: import.meta.env.DEV,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
