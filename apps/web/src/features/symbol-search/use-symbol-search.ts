import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { INSTRUMENT_TYPES, InstrumentSearchResponseSchema, type InstrumentSummary } from '@aitrader/contracts';
import { apiFetch } from '../../shared/api/http';
import { recentSymbols } from './recent-symbols';

export function useSymbolSearchDialog(initial: string, onClose: () => void, onSelect: (id: string) => void) {
  const [q, setQ] = useState(initial);
  const [exchange, setExchange] = useState<string>();
  const [type, setType] = useState<InstrumentSummary['type']>();
  const [recents] = useState(recentSymbols.get);
  const query = useSymbolSearch(q, { exchange, type });
  function select(id: string) { recentSymbols.push(id); onSelect(id); onClose(); }
  function changeExchange(name: string) { setExchange(name === 'All' ? undefined : name); }
  function changeType(name: string) { setType(INSTRUMENT_TYPES.find((value) => value === name)); }
  return { q, setQ, exchange, changeExchange, type, changeType, recents, query, select };
}

export function useSymbolSearch(q: string, { exchange, type }: { exchange?: string | undefined; type?: InstrumentSummary['type'] | undefined }) {
  const [debounced, setDebounced] = useState<string>();
  useEffect(() => {
    const timer = setTimeout(() => { setDebounced(q); }, 150);
    return () => { clearTimeout(timer); };
  }, [q]);
  return useQuery({
    queryKey: ['instruments', 'search', debounced, exchange, type],
    enabled: debounced !== undefined,
    placeholderData: keepPreviousData,
    retry: false,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ q: debounced ?? '', limit: '20' });
      if (exchange) params.set('exchange', exchange);
      if (type) params.set('type', type);
      return apiFetch(`v1/instruments/search?${params}`, { schema: InstrumentSearchResponseSchema, signal });
    },
  });
}
