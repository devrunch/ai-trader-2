import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '../../shared/api/http';
const sessionSchema = z.object({ user: z.object({ id: z.uuid(), username: z.string(), role: z.enum(['admin', 'user']) }) });
export function useSession() { return useQuery({ queryKey: ['auth', 'session'], queryFn: ({ signal }) => apiFetch('/v1/auth/me', { schema: sessionSchema, signal }), retry: false, staleTime: 60_000 }); }
