import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AgentQueueStatsSchema, DataGapsResponseSchema, DataSourcesResponseSchema, OpsFeedsSchema, OpsInstrumentsSchema, OpsJobsSchema, ZerodhaStatusSchema } from '@aitrader/contracts';
import { z } from 'zod';
import { apiFetch } from '../../shared/api/http';

const connectedSchema = z.object({ connected: z.literal(true), expiresAt: z.string() });
const disconnectedSchema = z.object({ connected: z.literal(false) });
const nothing = z.unknown();

const adminKeys = {
  zerodha: ['admin', 'zerodha'] as const,
  feeds: ['admin', 'feeds'] as const,
  jobs: ['admin', 'jobs'] as const,
  agentQueue: ['admin', 'agent-queue'] as const,
  instruments: ['admin', 'instruments'] as const,
  sources: ['admin', 'sources'] as const,
};

export function useZerodhaStatus() {
  return useQuery({ queryKey: adminKeys.zerodha, queryFn: ({ signal }) => apiFetch('/v1/admin/zerodha', { schema: ZerodhaStatusSchema, signal }) });
}

/** Exchanges a Kite request_token. Used by the paste dialog and the callback page. */
export function useConnectZerodha() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (requestToken: string) => apiFetch('/v1/admin/zerodha/token', { schema: connectedSchema, method: 'POST', body: { requestToken } }),
    onSettled: () => client.invalidateQueries({ queryKey: adminKeys.zerodha }),
  });
}

export function useAutoLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch('/v1/admin/zerodha/auto-login', { schema: connectedSchema, method: 'POST' }),
    onSettled: () => client.invalidateQueries({ queryKey: adminKeys.zerodha }),
  });
}

export function useDisconnectZerodha() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch('/v1/admin/zerodha/disconnect', { schema: disconnectedSchema, method: 'POST' }),
    onSettled: () => client.invalidateQueries({ queryKey: adminKeys.zerodha }),
  });
}

/** Polls every 5 s while the tab is visible; TanStack pauses the interval when the document is hidden. */
export function useFeeds() {
  return useQuery({ queryKey: adminKeys.feeds, queryFn: ({ signal }) => apiFetch('/v1/admin/ops/feeds', { schema: OpsFeedsSchema, signal }),
    refetchInterval: 5_000, refetchIntervalInBackground: false });
}

export function useJobs() {
  return useQuery({ queryKey: adminKeys.jobs, queryFn: ({ signal }) => apiFetch('/v1/admin/ops/jobs', { schema: OpsJobsSchema, signal }) });
}

/** The assistant's background run queue. */
export function useAgentQueue() {
  return useQuery({ queryKey: adminKeys.agentQueue, queryFn: ({ signal }) => apiFetch('/v1/admin/ops/agent-queue', { schema: AgentQueueStatsSchema, signal }), refetchInterval: 10_000, refetchIntervalInBackground: false });
}

export function useRunJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiFetch(`/v1/admin/ops/jobs/${encodeURIComponent(name)}/run`, { schema: nothing, method: 'POST' }),
    onSettled: () => client.invalidateQueries({ queryKey: adminKeys.jobs }),
  });
}

export function useInstrumentSources() {
  return useQuery({ queryKey: adminKeys.instruments, queryFn: ({ signal }) => apiFetch('/v1/admin/ops/instruments', { schema: OpsInstrumentsSchema, signal }) });
}

export function useRefreshInstruments() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch('/v1/admin/ops/instruments/refresh', { schema: nothing, method: 'POST' }),
    onSettled: () => client.invalidateQueries({ queryKey: adminKeys.instruments }),
  });
}

export function useDataGaps() {
  return useQuery({ queryKey: ['admin', 'data-gaps'], queryFn: ({ signal }) => apiFetch('/v1/admin/data-gaps', { schema: DataGapsResponseSchema, signal }), refetchInterval: 60_000, refetchIntervalInBackground: false });
}

export function useDataSources() {
  return useQuery({ queryKey: adminKeys.sources, queryFn: ({ signal }) => apiFetch('/v1/admin/ops/sources', { schema: DataSourcesResponseSchema, signal }), refetchInterval: 30_000, refetchIntervalInBackground: false });
}
