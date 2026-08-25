/**
 * Pure Zod schemas for the dimension CRUD flow. No DB / auth imports so
 * the unit tests can run in isolation.
 */
import { z } from 'zod';
import { DIMENSION_KINDS } from '@/db/schema';

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const trimmedString = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(max).optional(),
  );

const optionalShortString = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(max).optional(),
  );

const colorSlug = z
  .string()
  .trim()
  .regex(/^tk-[a-z0-9-]+$/, 'Color debe empezar por tk- (p.ej. tk-odio)');

export const CreateDimensionInput = z.object({
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(80),
  slug: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z
      .string()
      .trim()
      .max(80)
      .regex(/^[a-z0-9-]+$/, 'El slug solo puede tener minúsculas, números y guiones')
      .optional(),
  ),
  kind: z.enum(DIMENSION_KINDS, {
    errorMap: () => ({ message: 'Tipo de dimensión no válido' }),
  }),
  scaleId: z.string().min(1, 'Escala requerida'),
  shortDescription: optionalShortString(160),
  longDescription: trimmedString(2000),
  color: colorSlug,
});

export const UpdateDimensionInput = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  kind: z.enum(DIMENSION_KINDS, {
    errorMap: () => ({ message: 'Tipo de dimensión no válido' }),
  }),
  scaleId: z.string().min(1, 'Escala requerida'),
  shortDescription: optionalShortString(160),
  longDescription: trimmedString(2000),
  color: colorSlug,
});

export const ArchiveDimensionInput = z.object({
  id: z.string().min(1),
});

/** Mirror of the form-derivation logic for the auto-slug. */
export const autoSlug = (name: string): string => slug(name).slice(0, 80);
