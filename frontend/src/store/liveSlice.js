import { createSlice } from "@reduxjs/toolkit";

/**
 * Real vaqtdagi holat. SSE oqimidan kelgan har bir o'lchov shu yerga
 * tushadi — sahifalar Redux'dan o'qiydi, ulanish esa bitta joyda.
 */
const liveSlice = createSlice({
  name: "live",
  initialState: { connected: false, snapshot: null, error: null, receivedAt: null },
  reducers: {
    connected(state) {
      state.connected = true;
      state.error = null;
    },
    disconnected(state, { payload }) {
      state.connected = false;
      state.error = payload || null;
    },
    tick(state, { payload }) {
      state.snapshot = payload;
      state.receivedAt = Date.now();
      state.connected = true;
    },
  },
});

export const { connected, disconnected, tick } = liveSlice.actions;
export default liveSlice.reducer;
