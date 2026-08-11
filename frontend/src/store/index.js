import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { api } from "./api";
import auth from "./authSlice";
import live from "./liveSlice";

export const store = configureStore({
  reducer: { [api.reducerPath]: api.reducer, auth, live },
  middleware: (getDefault) =>
    getDefault({
      // SSE o'lchovlari sekundiga bir necha marta keladi — har birini
      // tekshirish ortiqcha yuk beradi.
      serializableCheck: { ignoredActions: ["live/tick"] },
    }).concat(api.middleware),
});

setupListeners(store.dispatch);
