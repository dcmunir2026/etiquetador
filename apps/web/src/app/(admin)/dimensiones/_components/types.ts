import type { DimensionKind } from '@/lib/dimension-kinds';

export type Scale = {
  id: string;
  name: string;
  kind: string;
  levels: { label: string; value: string; order: number; color?: string | null }[];
};

/** A single value row for a dimension. `order` is the persisted sort order;
 *  in the form it tracks the array index. */
export type DimensionValueRow = {
  label: string;
  value: string;
  color: string;
  order: number;
};

export type DimensionCard = {
  id: string;
  name: string;
  slug: string;
  kind: DimensionKind;
  scaleId: string | null;
  /** Joined from `intensity_scales.name`. Used by the form to decide
   *  whether the scale is a global preset or a custom scale. */
  scaleName: string | null;
  status: 'active' | 'archived';
  shortDescription: string | null;
  longDescription: string | null;
  /** Visual "TK color" id (e.g. `tk-odio`). The form's step 4 reads/writes
   *  this; the column is currently NOT persisted in the DB (see STATUS.md
   *  tech debt) so it falls back to a derived default on edit. */
  color: string | null;
  creatorName: string | null;
  creatorEmail: string | null;
  /** Full list of values, sorted by `order`. */
  values: DimensionValueRow[];
  taxonomyCount: number;
  projectCount: number;
};
