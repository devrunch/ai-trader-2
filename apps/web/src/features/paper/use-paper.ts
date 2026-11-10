import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PaperAccountResponseSchema, PaperOrderResponseSchema, PaperOrdersResponseSchema, PaperPositionsResponseSchema,
  type PaperOrderType, type PaperPlaceOrderRequest, type PaperProduct, type PaperSide,
} from '@aitrader/contracts';
import { apiFetch } from '../../shared/api/http';

const POLL_MS = 5_000;

export function usePaperAccount() {
  return useQuery({ queryKey: ['paper', 'account'], refetchInterval: POLL_MS,
    queryFn: ({ signal }) => apiFetch('v1/paper/account', { schema: PaperAccountResponseSchema, signal }) });
}

/** Positions are marked to market on the server; polling keeps P&L current without ticks entering React state. */
export function usePaperPositions() {
  return useQuery({ queryKey: ['paper', 'positions'], refetchInterval: POLL_MS,
    queryFn: ({ signal }) => apiFetch('v1/paper/positions', { schema: PaperPositionsResponseSchema, signal }) });
}

export function useOpenPaperOrders() {
  return useQuery({ queryKey: ['paper', 'orders', 'open'], refetchInterval: POLL_MS,
    queryFn: ({ signal }) => apiFetch('v1/paper/orders?status=open', { schema: PaperOrdersResponseSchema, signal }) });
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
export function useOrderTicket(symbol: string) {
  const client = useQueryClient();
  const [values, setValues] = useState<TicketValues>({ side: 'buy', type: 'market', product: 'MIS', quantity: '1', limitPrice: '' });
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
