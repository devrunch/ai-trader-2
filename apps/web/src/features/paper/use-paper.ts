import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PaperAccountResponseSchema, PaperFillsResponseSchema, PaperOrderResponseSchema, PaperOrdersResponseSchema, PaperPositionsResponseSchema,
  type PaperOrderType, type PaperPlaceOrderRequest, type PaperProduct, type PaperSide,
} from '@aitrader/contracts';
import type { z } from 'zod';
import { apiFetch } from '../../shared/api/http';

type PaperPositionsResponse = z.infer<typeof PaperPositionsResponseSchema>;
type PaperOrdersResponse = z.infer<typeof PaperOrdersResponseSchema>;

// Fast only while something is open; otherwise a slow refresh. React Query pauses polling in hidden tabs.
const ACTIVE_MS = 5_000;
const IDLE_MS = 30_000;

export function usePaperAccount() {
  return useQuery({ queryKey: ['paper', 'account'], refetchInterval: IDLE_MS,
    queryFn: ({ signal }) => apiFetch('v1/paper/account', { schema: PaperAccountResponseSchema, signal }) });
}

/** Positions are marked to market on the server; polling keeps P&L current without ticks entering React state. */
export function usePaperPositions() {
  return useQuery<PaperPositionsResponse>({ queryKey: ['paper', 'positions'],
    refetchInterval: query => (query.state.data?.positions.some(p => p.quantity !== 0) ? ACTIVE_MS : IDLE_MS),
    queryFn: ({ signal }) => apiFetch('v1/paper/positions', { schema: PaperPositionsResponseSchema, signal }) });
}

export function useOpenPaperOrders() {
  return useQuery<PaperOrdersResponse>({ queryKey: ['paper', 'orders', 'open'],
    refetchInterval: query => ((query.state.data?.orders.length ?? 0) > 0 ? ACTIVE_MS : IDLE_MS),
    queryFn: ({ signal }) => apiFetch('v1/paper/orders?status=open', { schema: PaperOrdersResponseSchema, signal }) });
}

/** Filled trades, newest first; only fetched while the History tab is open. */
export function usePaperFills(enabled: boolean) {
  return useQuery({ queryKey: ['paper', 'fills'], enabled, refetchInterval: IDLE_MS,
    queryFn: ({ signal }) => apiFetch('v1/paper/fills?limit=100', { schema: PaperFillsResponseSchema, signal }) });
}

export function useCancelPaperOrder() {
  const client = useQueryClient();
  return useMutation({ retry: 0,
    mutationFn: (id: string) => apiFetch(`v1/paper/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST', schema: PaperOrderResponseSchema }),
    onSettled: () => client.invalidateQueries({ queryKey: ['paper'] }) });
}

export interface TicketValues { side: PaperSide; type: Extract<PaperOrderType, 'market' | 'limit'>; product: Extract<PaperProduct, 'MIS' | 'CNC'>; quantity: string; limitPrice: string }

const newClientId = (): string => `web-${crypto.randomUUID()}`;

/**
 * Order ticket state. One clientOrderId per order: a double submit or a retry of the same order reuses it (FR-PT-3), and it
 * changes only after the server answered. Orders are never queued offline (E9): no automatic retry.
 */
export function useOrderTicket(symbol: string, initialSide: PaperSide = 'buy') {
  const client = useQueryClient();
  const [values, setValues] = useState<TicketValues>({ side: initialSide, type: 'market', product: 'MIS', quantity: '1', limitPrice: '' });
  const [clientOrderId, setClientOrderId] = useState(newClientId);
  const place = useMutation({ retry: 0,
    mutationFn: (request: PaperPlaceOrderRequest) => apiFetch('v1/paper/orders', { method: 'POST', body: request, schema: PaperOrderResponseSchema }),
    onSuccess: () => { setClientOrderId(newClientId()); },
    onSettled: () => client.invalidateQueries({ queryKey: ['paper'] }) });
  const update = (patch: Partial<TicketValues>) => { setValues(current => ({ ...current, ...patch })); };
  const submit = () => {
    const request: PaperPlaceOrderRequest = { clientOrderId, instrumentId: symbol, side: values.side, type: values.type, product: values.product,
      quantity: Number(values.quantity), ...(values.type === 'limit' ? { limitPrice: Number(values.limitPrice) } : {}) };
    place.mutate(request);
  };
  return { values, update, submit, place };
}
