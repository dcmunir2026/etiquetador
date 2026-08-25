/**
 * Pure Zod schemas for the taxonomy CRUD flow. No DB / auth imports so
 * the unit tests can run in isolation.
 */
import { z } from 'zod';

const TAXONOMY_COLORS = ['rose', 'amber', 'cyan', 'violet'] as const;
export type TaxonomyColor = (typeof TAXONOMY_COLORS)[number];

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

const colorSlug = z.enum(TAXONOMY_COLORS, {
  errorMap: () => ({ message: 'Color no válido (rose, amber, cyan, violet)' }),
});

const BaseFields = z.object({
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(80),
  shortDescription: optionalShortString(160),
  longDescription: trimmedString(2000),
  color: colorSlug,
});

export const CreateTaxonomyInput = BaseFields;
export const UpdateTaxonomyInput = BaseFields.extend({
  id: z.string().min(1),
});

export const ArchiveTaxonomyInput = z.object({
  id: z.string().min(1),
});

export const AddDimensionToTaxonomyInput = z.object({
  taxonomyId: z.string().min(1),
  dimensionId: z.string().min(1),
});

export const RemoveDimensionFromTaxonomyInput = z.object({
  taxonomyId: z.string().min(1),
  dimensionId: z.string().min(1),
});

/** Mirror of the form-derivation logic for the auto-slug. */
export const autoSlug = (name: string): string => slug(name).slice(0, 80);

export const TAXONOMY_COLOR_OPTIONS: ReadonlyArray<{
  id: TaxonomyColor;
  label: string;
  preview: string;
}> = [
  { id: 'rose', label: 'Rosa', preview: 'linear-gradient(135deg,#7a1a1c,#b04143)' },
  { id: 'amber', label: 'Ámbar', preview: 'linear-gradient(135deg,#5a4400,#8a6300)' },
  { id: 'cyan', label: 'Cian', preview: 'linear-gradient(135deg,#0d4a5a,#1a7088)' },
  { id: 'violet', label: 'Violeta', preview: 'linear-gradient(135deg,#3d2a4d,#5a4080)' },
];
