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

// A single value row, as edited by the wizard's step 3.
const ValueRowSchema = z.object({
  label: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(32),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Color debe ser hex (#rrggbb)'),
  order: z.number().int().min(0).max(19),
});

const CustomValuesSchema = z.array(ValueRowSchema).min(1).max(20);

export const CreateDimensionInput = z.object({
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(80),
  kind: z.enum(DIMENSION_KINDS, {
    errorMap: () => ({ message: 'Tipo de dimensión no válido' }),
  }),
  scaleId: z.string().nullable().optional(),
  shortDescription: optionalShortString(160),
  longDescription: trimmedString(2000),
  color: colorSlug,
  customValues: CustomValuesSchema,
});

export const UpdateDimensionInput = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  kind: z.enum(DIMENSION_KINDS, {
    errorMap: () => ({ message: 'Tipo de dimensión no válido' }),
  }),
  scaleId: z.string().nullable().optional(),
  shortDescription: optionalShortString(160),
  longDescription: trimmedString(2000),
  color: colorSlug,
  customValues: CustomValuesSchema,
});

export const ArchiveDimensionInput = z.object({
  id: z.string().min(1),
});

/** Mirror of the form-derivation logic for the auto-slug. */
export const autoSlug = (name: string): string => slug(name).slice(0, 80);
