/**
 * Pure Zod schemas for the project CRUD form. No DB or auth imports here
 * so they can be unit-tested without pulling in next-auth / better-sqlite3.
 */
import { z } from 'zod';

const trimmed = (s: unknown) => (typeof s === 'string' ? s.trim() : s);

export const CreateProjectInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(80, 'El nombre no puede superar 80 caracteres'),
  description: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(500, 'La descripción no puede superar 500 caracteres').optional(),
  ),
});

export const UpdateProjectInput = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  description: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(500).optional(),
  ),
});

export const IdInput = z.object({ id: z.string().min(1) });
