import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { sessionLost } from "./authSlice";

const baseQuery = fetchBaseQuery({
  baseUrl: "/api",
  credentials: "same-origin",
});

// 401 kelsa sessiya tugagan — foydalanuvchini kirish oynasiga qaytaramiz.
const withAuth = async (args, api, extra) => {
  const result = await baseQuery(args, api, extra);
  const isLogin = typeof args === "object" && args.url === "/auth/login";
  if (result.error?.status === 401 && !isLogin) api.dispatch(sessionLost());
  return result;
};

export const api = createApi({
  reducerPath: "api",
  baseQuery: withAuth,
  tagTypes: ["Session", "Projects", "Docker", "Services", "Security", "Traffic"],
  // Kuzatuv panelida ma'lumot eskirmasligi kerak.
  keepUnusedDataFor: 30,
  endpoints: (build) => ({
    session: build.query({ query: () => "/auth/session", providesTags: ["Session"] }),
    login: build.mutation({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
      invalidatesTags: ["Session"],
    }),
    logout: build.mutation({
      query: () => ({ url: "/auth/logout", method: "POST" }),
      invalidatesTags: ["Session"],
    }),

    system: build.query({ query: () => "/system" }),
    projects: build.query({
      query: (refresh) => (refresh ? "/projects?yangila=1" : "/projects"),
      providesTags: ["Projects"],
    }),
    docker: build.query({ query: () => "/docker", providesTags: ["Docker"] }),
    services: build.query({ query: () => "/services", providesTags: ["Services"] }),
    serviceLogs: build.query({
      query: (unit) => `/services/${encodeURIComponent(unit)}/logs?qator=120`,
    }),
    security: build.query({ query: () => "/security", providesTags: ["Security"] }),
    traffic: build.query({
      query: (minutes = 60) => `/traffic?daqiqa=${minutes}`,
      providesTags: ["Traffic"],
    }),
  }),
});

export const {
  useSessionQuery, useLoginMutation, useLogoutMutation,
  useSystemQuery, useProjectsQuery, useDockerQuery, useServicesQuery,
  useServiceLogsQuery, useSecurityQuery, useTrafficQuery,
} = api;
