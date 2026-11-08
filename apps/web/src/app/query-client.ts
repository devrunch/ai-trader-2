import { QueryClient } from '@tanstack/react-query';
import { isRetryable } from '../shared/api';
export function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: {
    staleTime: 30_000, gcTime: 300_000,
    retry: (n, err) => n < 2 && isRetryable(err), refetchOnWindowFocus: true,
  } } });
}
