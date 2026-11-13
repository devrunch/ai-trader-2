import { z } from 'zod';

const isoDate = z.string().transform(value => new Date(value).toISOString());

/** Validates a saved-spec table row and normalises its timestamps; modules extend it with their own spec schema and columns. */
export const savedSpecRow = z.object({ id: z.string(), userId: z.string(), name: z.string(), spec: z.unknown(), createdAt: isoDate, updatedAt: isoDate });
