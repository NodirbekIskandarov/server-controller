import { createSlice } from "@reduxjs/toolkit";
import { api } from "./api";

const authSlice = createSlice({
  name: "auth",
  initialState: { username: null, ready: false },
  reducers: {
    sessionLost(state) {
      state.username = null;
      state.ready = true;
    },
  },
  extraReducers: (b) => {
    b.addMatcher(api.endpoints.session.matchFulfilled, (s, { payload }) => {
      s.username = payload.username;
      s.ready = true;
    })
      .addMatcher(api.endpoints.session.matchRejected, (s) => {
        s.username = null;
        s.ready = true;
      })
      .addMatcher(api.endpoints.login.matchFulfilled, (s, { payload }) => {
        s.username = payload.username;
        s.ready = true;
      })
      .addMatcher(api.endpoints.logout.matchFulfilled, (s) => {
        s.username = null;
        s.ready = true;
      });
  },
});

export const { sessionLost } = authSlice.actions;
export default authSlice.reducer;
