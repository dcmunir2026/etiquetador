// Shared TypeScript types and Zod schemas used across apps and packages.

export type UUID = string;

export type ISODateString = string;

export type ProjectStatus = 'active' | 'archived';

export type IntensityScaleKind =
  | 'binary' // 0, 1
  | 'three-level' // 0, 1, 2
  | 'five-level' // 0..4
  | 'likert' // -2..+2
  | 'free-text'; // string

export type SegmentationUnit = 'token' | 'word' | 'sentence' | 'paragraph' | 'character';

export type DimensionKind = 'category' | 'intensity' | 'flag' | 'free-text';

export type RoleScope = 'system' | 'project';

export type PermissionAction =
  | 'project:read'
  | 'project:write'
  | 'project:delete'
  | 'project:archive'
  | 'user:invite'
  | 'user:assign-role'
  | 'dimension:write'
  | 'package:read'
  | 'package:assign'
  | 'package:label'
  | 'package:submit'
  | 'package:approve'
  | 'package:resubmit'
  | 'report:read'
  | 'report:export'
  | 'audit:read';

export interface Project {
  id: UUID;
  name: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Dimension {
  id: UUID;
  projectId: UUID;
  name: string;
  description: string | null;
  kind: DimensionKind;
  scaleId: UUID | null;
  required: boolean;
  order: number;
}

export interface IntensityScale {
  id: UUID;
  projectId: UUID;
  name: string;
  kind: IntensityScaleKind;
}

export interface IntensityLevel {
  id: UUID;
  scaleId: UUID;
  label: string;
  value: number | string;
  order: number;
}

export interface SegmentationConfig {
  id: UUID;
  projectId: UUID;
  unit: SegmentationUnit;
  maxChunkSize: number;
  overlap: number;
  respectBoundaries: boolean;
}
