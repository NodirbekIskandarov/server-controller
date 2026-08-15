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
  tagTypes: [
    "Session", "Projects", "Docker", "Services", "Security", "Traffic",
    "Deploy", "Billing", "Audit", "Ufw", "Files", "File",
  ],
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

    billing: build.query({ query: () => "/billing", providesTags: ["Billing"] }),

    deployList: build.query({ query: () => "/deploy", providesTags: ["Deploy"] }),
    triggerDeploy: build.mutation({
      query: ({ project, izoh }) => ({
        url: `/deploy/${project}`,
        method: "POST",
        body: { izoh },
      }),
      invalidatesTags: ["Deploy"],
    }),

    // ---- Boshqaruv (yozish amallari) ----------------------------------
    // Har bir mutatsiya o'zi tegadigan ro'yxatni ham, audit jurnalini ham
    // bekor qiladi: amaldan keyin ekranda eski holat qolib ketmasin.

    /** Himoya chegaralari — tugmalarni oldindan bloklash uchun. */
    limits: build.query({ query: () => "/control/limits" }),

    serviceAction: build.mutation({
      query: ({ unit, amal }) => ({
        url: "/control/service",
        method: "POST",
        body: { unit, amal },
      }),
      invalidatesTags: ["Services", "Audit"],
    }),
    dockerAction: build.mutation({
      query: ({ nom, amal }) => ({
        url: "/control/docker",
        method: "POST",
        body: { nom, amal },
      }),
      invalidatesTags: ["Docker", "Audit"],
    }),
    fail2ban: build.mutation({
      query: ({ amal, jail, ip }) => ({
        url: "/control/fail2ban",
        method: "POST",
        body: { amal, jail, ip },
      }),
      invalidatesTags: ["Security", "Audit"],
    }),

    ufwRules: build.query({ query: () => "/control/ufw", providesTags: ["Ufw"] }),
    ufwAdd: build.mutation({
      query: (body) => ({ url: "/control/ufw", method: "POST", body }),
      invalidatesTags: ["Ufw", "Security", "Audit"],
    }),
    ufwDelete: build.mutation({
      query: (number) => ({ url: `/control/ufw/${number}`, method: "DELETE" }),
      invalidatesTags: ["Ufw", "Security", "Audit"],
    }),

    audit: build.query({
      query: ({ limit = 200, amal = "" } = {}) =>
        `/audit?qator=${limit}${amal ? `&amal=${encodeURIComponent(amal)}` : ""}`,
      providesTags: ["Audit"],
    }),

    // ---- Fayllar -----------------------------------------------------
    fileList: build.query({
      query: (path) => (path ? `/files/list?yol=${encodeURIComponent(path)}` : "/files/list"),
      providesTags: ["Files"],
    }),
    file: build.query({
      query: (path) => `/files?yol=${encodeURIComponent(path)}`,
      providesTags: ["File"],
    }),
    saveFile: build.mutation({
      query: ({ yol, matn }) => ({ url: "/files", method: "POST", body: { yol, matn } }),
      // Fayllar ro'yxati ham yangilanadi — zaxira nusxa yangi fayl sifatida
      // paydo bo'ladi.
      invalidatesTags: ["File", "Files", "Audit"],
    }),
  }),
});

export const {
  useSessionQuery, useLoginMutation, useLogoutMutation,
  useSystemQuery, useProjectsQuery, useDockerQuery, useServicesQuery,
  useServiceLogsQuery, useSecurityQuery, useTrafficQuery,
  useBillingQuery,
  useDeployListQuery, useTriggerDeployMutation,
  useLimitsQuery,
  useServiceActionMutation, useDockerActionMutation, useFail2banMutation,
  useUfwRulesQuery, useUfwAddMutation, useUfwDeleteMutation,
  useAuditQuery,
  useFileListQuery, useFileQuery, useSaveFileMutation,
} = api;
