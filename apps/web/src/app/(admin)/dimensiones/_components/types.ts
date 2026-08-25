import type { DimensionKind } from '@/lib/dimension-kinds';

export type Scale = {
  id: string;
  name: string;
  kind: string;
  levels: { label: string; value: string; order: number }[];
};

export type DimensionCard = {
  id: string;
  name: string;
  slug: string;
  kind: DimensionKind;
  scaleId: string | null;
  status: 'active' | 'archived';
  shortDescription: string | null;
  creatorName: string | null;
  creatorEmail: string | null;
  values: string[];
  taxonomyCount: number;
  projectCount: number;
};
