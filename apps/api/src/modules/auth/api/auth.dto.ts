import { z } from 'zod';
export const LoginDto = z.object({ username: z.string().min(3).max(32), password: z.string().min(1) });
export const UserResponse = z.object({ id: z.uuid(), username: z.string(), role: z.enum(['admin', 'user']) });
