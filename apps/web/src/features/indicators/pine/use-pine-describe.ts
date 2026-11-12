import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { IndicatorDefinitionSchema } from '@aitrader/contracts';
import { apiFetch } from '../../../shared/api';
import { problemFromError } from './pine-problems';

const DescribeResponseSchema = z.object({ definition: IndicatorDefinitionSchema });

/** Compiles a script on the server; a failure carries the line to show in the editor. */
export function usePineDescribe() {
  const mutation = useMutation({
    mutationFn: (source: string) => apiFetch('/v1/indicators/describe', { schema: DescribeResponseSchema, method: 'POST', body: { source } }).then(r => r.definition),
  });
  return {
    describe: mutation.mutateAsync,
    pending: mutation.isPending,
    definition: mutation.data,
    problem: mutation.error ? (problemFromError(mutation.error) ?? { message: 'The script could not be checked' }) : undefined,
    reset: mutation.reset,
  };
}
