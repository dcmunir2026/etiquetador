// Drizzle ORM schema for the Etiquetador platform.
//
// Model (refactored from mockup):
//   - Dimensions are GLOBAL (atomic annotable attributes).
//   - Taxonomies are GLOBAL groups of dimensions (N:M).
//   - Projects get assigned TAXONOMIES (not dimensions).
//   - Intensity scales are GLOBAL (binary, 3-level, 5-level, etc).
//
// Driver: SQLite (via better-sqlite3). Production target: PostgreSQL.
// Drizzle abstracts most differences; we keep SQL portable.

import { relations, sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/sqlite-core';

// ─── Helpers ─────────────────────────────────────────────────────────

/** Prefixed, sortable, URL-safe id. Format: t_<base36 ts>_<4 random chars>. */
function newId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `t_${ts}_${rand}`;
}

// ─── Enums (SQLite has no native enums; we use text + check at app layer) ─

export const PROJECT_STATUSES = ['active', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const SCALE_KINDS = [
  'boolean',
  'binary',
  '3-level',
  '5-level',
  'likert',
  'numerical',
  'free-text',
] as const;
export type ScaleKind = (typeof SCALE_KINDS)[number];

export const SEGMENTATION_UNITS = [
  'token',
  'word',
  'sentence',
  'paragraph',
  'character',
] as const;
export type SegmentationUnit = (typeof SEGMENTATION_UNITS)[number];

export const DIMENSION_KINDS = ['category', 'intensity', 'flag', 'free-text'] as const;
export type DimensionKind = (typeof DIMENSION_KINDS)[number];

export const USER_ROLES = ['superadmin', 'projectadmin', 'annotator', 'validator', 'viewer'] as const;
export type UserRole = (typeof USER_ROLES)[number];

// ─── USERS ───────────────────────────────────────────────────────────

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    email: text('email').notNull(),
    name: text('name'),
    avatarColor: text('avatar_color'),
    isSuperAdmin: integer('is_super_admin', { mode: 'boolean' }).notNull().default(false),
    passwordHash: text('password_hash'),
    emailVerifiedAt: integer('email_verified_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    emailUnique: uniqueIndex('users_email_unique').on(t.email),
  }),
);

// ─── PROJECTS ─────────────────────────────────────────────────────────

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    status: text('status', { enum: PROJECT_STATUSES }).notNull().default('active'),
    createdBy: text('created_by').notNull().references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    slugUnique: uniqueIndex('projects_slug_unique').on(t.slug),
  }),
);

// ─── PROJECT MEMBERS ──────────────────────────────────────────────────

export const projectMembers = sqliteTable(
  'project_members',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: USER_ROLES }).notNull().default('annotator'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    uniqueMember: uniqueIndex('project_members_unique').on(t.projectId, t.userId),
  }),
);

// ─── INTENSITY SCALES (GLOBAL) ──────────────────────────────────────

export const intensityScales = sqliteTable(
  'intensity_scales',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    name: text('name').notNull(),
    kind: text('kind', { enum: SCALE_KINDS }).notNull(),
    isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
    createdBy: text('created_by').references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    nameUnique: uniqueIndex('intensity_scales_name_unique').on(t.name),
  }),
);

export const intensityLevels = sqliteTable(
  'intensity_levels',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    scaleId: text('scale_id').notNull().references(() => intensityScales.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    value: text('value').notNull(),
    order: integer('order').notNull(),
    color: text('color'),
  },
  (t) => ({
    scaleOrderUnique: uniqueIndex('intensity_levels_scale_order_unique').on(t.scaleId, t.order),
  }),
);

// ─── DIMENSIONS (GLOBAL — atoms) ────────────────────────────────────

export const dimensions = sqliteTable(
  'dimensions',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    shortDescription: text('short_description'),
    longDescription: text('long_description'),
    kind: text('kind', { enum: DIMENSION_KINDS }).notNull(),
    scaleId: text('scale_id').references(() => intensityScales.id, { onDelete: 'set null' }),
    status: text('status', { enum: ['active', 'archived'] }).notNull().default('active'),
    createdBy: text('created_by').references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    slugUnique: uniqueIndex('dimensions_slug_unique').on(t.slug),
  }),
);

export const dimensionValues = sqliteTable(
  'dimension_values',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    dimensionId: text('dimension_id').notNull().references(() => dimensions.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    value: text('value').notNull(),
    order: integer('order').notNull(),
    color: text('color'),
  },
  (t) => ({
    dimOrderUnique: uniqueIndex('dimension_values_dim_order_unique').on(t.dimensionId, t.order),
  }),
);

// ─── TAXONOMIES (GLOBAL — groups of dimensions) ─────────────────────

export const taxonomies = sqliteTable(
  'taxonomies',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    shortDescription: text('short_description'),
    longDescription: text('long_description'),
    color: text('color'),
    status: text('status', { enum: ['active', 'archived'] }).notNull().default('active'),
    createdBy: text('created_by').references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    slugUnique: uniqueIndex('taxonomies_slug_unique').on(t.slug),
  }),
);

// N:M: which dimensions are in which taxonomy
export const taxonomyDimensions = sqliteTable(
  'taxonomy_dimensions',
  {
    taxonomyId: text('taxonomy_id').notNull().references(() => taxonomies.id, { onDelete: 'cascade' }),
    dimensionId: text('dimension_id').notNull().references(() => dimensions.id, { onDelete: 'cascade' }),
    order: integer('order').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.taxonomyId, t.dimensionId] }),
    dimIdx: index('taxonomy_dimensions_dim_idx').on(t.dimensionId),
  }),
);

// N:M: which taxonomies are assigned to which project
export const projectTaxonomies = sqliteTable(
  'project_taxonomies',
  {
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    taxonomyId: text('taxonomy_id').notNull().references(() => taxonomies.id, { onDelete: 'cascade' }),
    assignedBy: text('assigned_by').references(() => users.id),
    assignedAt: integer('assigned_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.taxonomyId] }),
    taxIdx: index('project_taxonomies_tax_idx').on(t.taxonomyId),
  }),
);

// ─── SEGMENTATION CONFIGS (per project) ─────────────────────────────

export const segmentationConfigs = sqliteTable(
  'segmentation_configs',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    unit: text('unit', { enum: SEGMENTATION_UNITS }).notNull(),
    maxChunkSize: integer('max_chunk_size').notNull(),
    overlap: integer('overlap').notNull().default(0),
    respectBoundaries: integer('respect_boundaries', { mode: 'boolean' }).notNull().default(true),
    tolerance: integer('tolerance').notNull().default(15),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    nameProjectUnique: uniqueIndex('segmentation_configs_name_project_unique').on(t.projectId, t.name),
  }),
);

// ─── AUDIT LOG ───────────────────────────────────────────────────────

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    actorId: text('actor_id').references(() => users.id),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: text('metadata'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    actorIdx: index('audit_log_actor_idx').on(t.actorId),
    projectIdx: index('audit_log_project_idx').on(t.projectId),
    createdIdx: index('audit_log_created_idx').on(t.createdAt),
  }),
);

// ─── RELATIONS ───────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  projectMemberships: many(projectMembers),
  createdProjects: many(projects),
  createdDimensions: many(dimensions),
  createdTaxonomies: many(taxonomies),
}));

export const projectsRelations = relations(projects, ({ many, one }) => ({
  createdByUser: one(users, { fields: [projects.createdBy], references: [users.id] }),
  members: many(projectMembers),
  taxonomies: many(projectTaxonomies),
  segmentationConfigs: many(segmentationConfigs),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
  user: one(users, { fields: [projectMembers.userId], references: [users.id] }),
}));

export const projectTaxonomiesRelations = relations(projectTaxonomies, ({ one }) => ({
  project: one(projects, { fields: [projectTaxonomies.projectId], references: [projects.id] }),
  taxonomy: one(taxonomies, { fields: [projectTaxonomies.taxonomyId], references: [taxonomies.id] }),
}));

export const taxonomiesRelations = relations(taxonomies, ({ many, one }) => ({
  dimensions: many(taxonomyDimensions),
  projects: many(projectTaxonomies),
  createdByUser: one(users, { fields: [taxonomies.createdBy], references: [users.id] }),
}));

export const dimensionsRelations = relations(dimensions, ({ one, many }) => ({
  scale: one(intensityScales, { fields: [dimensions.scaleId], references: [intensityScales.id] }),
  values: many(dimensionValues),
  taxonomies: many(taxonomyDimensions),
  createdByUser: one(users, { fields: [dimensions.createdBy], references: [users.id] }),
}));

export const taxonomyDimensionsRelations = relations(taxonomyDimensions, ({ one }) => ({
  taxonomy: one(taxonomies, { fields: [taxonomyDimensions.taxonomyId], references: [taxonomies.id] }),
  dimension: one(dimensions, { fields: [taxonomyDimensions.dimensionId], references: [dimensions.id] }),
}));

export const intensityScalesRelations = relations(intensityScales, ({ many }) => ({
  levels: many(intensityLevels),
  dimensions: many(dimensions),
}));

export const segmentationConfigsRelations = relations(segmentationConfigs, ({ one }) => ({
  project: one(projects, { fields: [segmentationConfigs.projectId], references: [projects.id] }),
}));

// ─── Inferred types (for use in application/domain layer) ────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;
export type IntensityScale = typeof intensityScales.$inferSelect;
export type NewIntensityScale = typeof intensityScales.$inferInsert;
export type IntensityLevel = typeof intensityLevels.$inferSelect;
export type NewIntensityLevel = typeof intensityLevels.$inferInsert;
export type Dimension = typeof dimensions.$inferSelect;
export type NewDimension = typeof dimensions.$inferInsert;
export type DimensionValue = typeof dimensionValues.$inferSelect;
export type NewDimensionValue = typeof dimensionValues.$inferInsert;
export type Taxonomy = typeof taxonomies.$inferSelect;
export type NewTaxonomy = typeof taxonomies.$inferInsert;
export type TaxonomyDimension = typeof taxonomyDimensions.$inferSelect;
export type NewTaxonomyDimension = typeof taxonomyDimensions.$inferInsert;
export type ProjectTaxonomy = typeof projectTaxonomies.$inferSelect;
export type NewProjectTaxonomy = typeof projectTaxonomies.$inferInsert;
export type SegmentationConfig = typeof segmentationConfigs.$inferSelect;
export type NewSegmentationConfig = typeof segmentationConfigs.$inferInsert;
export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
