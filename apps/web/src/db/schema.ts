// Drizzle ORM schema for the Etiquetador platform — PostgreSQL.
//
// Model (refactored from mockup):
//   - Dimensions are GLOBAL (atomic annotable attributes).
//   - Taxonomies are GLOBAL groups of dimensions (N:M).
//   - Projects get assigned TAXONOMIES (not dimensions).
//   - Intensity scales are GLOBAL (binary, 3-level, 5-level, etc).
//
// Driver: PostgreSQL via `postgres` (postgres-js) + `drizzle-orm/postgres-js`.
// Dev: docker compose up -d (Postgres on :5432). Prod: same driver, real DB URL.

import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';

// ─── Notes ───────────────────────────────────────────────────────────
//
// All primary keys are `uuid` with `defaultRandom()`, which maps to
// PostgreSQL's `gen_random_uuid()` (built-in since PG 13; no extension
// required). The previous `t_<base36-ts>_<4rand>` format was abandoned
// in favour of UUIDs for cross-system interop and library support.

// ─── Enums (native pgEnum) ──────────────────────────────────────────

export const projectStatusEnum = pgEnum('project_status', ['active', 'archived']);
export const projectMemberRoleEnum = pgEnum('project_member_role', [
  'superadmin',
  'projectadmin',
  'annotator',
  'validator',
  'viewer',
]);
export const scaleKindEnum = pgEnum('scale_kind', [
  'boolean',
  'binary',
  '3-level',
  '5-level',
  'likert',
  'numerical',
  'free-text',
]);
export const dimensionKindEnum = pgEnum('dimension_kind', [
  'category',
  'intensity',
  'flag',
  'free-text',
]);
export const statusEnum = pgEnum('status', ['active', 'archived']);
export const segmentationUnitEnum = pgEnum('segmentation_unit', [
  'token',
  'word',
  'sentence',
  'paragraph',
  'character',
]);

// Plain string-array exports kept for callers that only need the literal
// values (no Drizzle column). Mirrors the pgEnum arrays above.
export const PROJECT_STATUSES = ['active', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const SCALE_KINDS = scaleKindEnum.enumValues;
export type ScaleKind = (typeof SCALE_KINDS)[number];
export const SEGMENTATION_UNITS = segmentationUnitEnum.enumValues;
export type SegmentationUnit = (typeof SEGMENTATION_UNITS)[number];
export const DIMENSION_KINDS = dimensionKindEnum.enumValues;
export type DimensionKind = (typeof DIMENSION_KINDS)[number];
export const USER_ROLES = projectMemberRoleEnum.enumValues;
export type UserRole = (typeof USER_ROLES)[number];

// ─── USERS ───────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name'),
    avatarColor: text('avatar_color'),
    isSuperAdmin: boolean('is_super_admin').notNull().default(false),
    passwordHash: text('password_hash'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    emailUnique: uniqueIndex('users_email_unique').on(t.email),
  }),
);

// ─── PROJECTS ────────────────────────────────────────────────────────

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    status: projectStatusEnum('status').notNull().default('active'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    slugUnique: uniqueIndex('projects_slug_unique').on(t.slug),
  }),
);

// ─── PROJECT MEMBERS ────────────────────────────────────────────────

export const projectMembers = pgTable(
  'project_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: projectMemberRoleEnum('role').notNull().default('annotator'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    uniqueMember: uniqueIndex('project_members_unique').on(t.projectId, t.userId),
  }),
);

// ─── INTENSITY SCALES (GLOBAL) ──────────────────────────────────────

export const intensityScales = pgTable(
  'intensity_scales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    kind: scaleKindEnum('kind').notNull(),
    isCustom: boolean('is_custom').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    nameUnique: uniqueIndex('intensity_scales_name_unique').on(t.name),
  }),
);

export const intensityLevels = pgTable(
  'intensity_levels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scaleId: uuid('scale_id').notNull().references(() => intensityScales.id, { onDelete: 'cascade' }),
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

export const dimensions = pgTable(
  'dimensions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    shortDescription: text('short_description'),
    longDescription: text('long_description'),
    kind: dimensionKindEnum('kind').notNull(),
    scaleId: uuid('scale_id').references(() => intensityScales.id, { onDelete: 'set null' }),
    status: statusEnum('status').notNull().default('active'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    slugUnique: uniqueIndex('dimensions_slug_unique').on(t.slug),
  }),
);

export const dimensionValues = pgTable(
  'dimension_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dimensionId: uuid('dimension_id').notNull().references(() => dimensions.id, { onDelete: 'cascade' }),
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

export const taxonomies = pgTable(
  'taxonomies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    shortDescription: text('short_description'),
    longDescription: text('long_description'),
    color: text('color'),
    status: statusEnum('status').notNull().default('active'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    slugUnique: uniqueIndex('taxonomies_slug_unique').on(t.slug),
  }),
);

// N:M: which dimensions are in which taxonomy
export const taxonomyDimensions = pgTable(
  'taxonomy_dimensions',
  {
    taxonomyId: uuid('taxonomy_id').notNull().references(() => taxonomies.id, { onDelete: 'cascade' }),
    dimensionId: uuid('dimension_id').notNull().references(() => dimensions.id, { onDelete: 'cascade' }),
    order: integer('order').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.taxonomyId, t.dimensionId] }),
    dimIdx: index('taxonomy_dimensions_dim_idx').on(t.dimensionId),
  }),
);

// N:M: which taxonomies are assigned to which project
export const projectTaxonomies = pgTable(
  'project_taxonomies',
  {
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    taxonomyId: uuid('taxonomy_id').notNull().references(() => taxonomies.id, { onDelete: 'cascade' }),
    assignedBy: uuid('assigned_by').references(() => users.id),
    assignedAt: timestamp('assigned_at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.taxonomyId] }),
    taxIdx: index('project_taxonomies_tax_idx').on(t.taxonomyId),
  }),
);

// ─── SEGMENTATION CONFIGS (per project) ─────────────────────────────

export const segmentationConfigs = pgTable(
  'segmentation_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    unit: segmentationUnitEnum('unit').notNull(),
    maxChunkSize: integer('max_chunk_size').notNull(),
    overlap: integer('overlap').notNull().default(0),
    respectBoundaries: boolean('respect_boundaries').notNull().default(true),
    tolerance: integer('tolerance').notNull().default(15),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    nameProjectUnique: uniqueIndex('segmentation_configs_name_project_unique').on(t.projectId, t.name),
  }),
);

// ─── AUDIT LOG ───────────────────────────────────────────────────────

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => users.id),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: uuid('target_id'),
    metadata: text('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    actorIdx: index('audit_log_actor_idx').on(t.actorId),
    projectIdx: index('audit_log_project_idx').on(t.projectId),
    createdIdx: index('audit_log_created_idx').on(t.createdAt),
  }),
);

// ─── RELATIONS ──────────────────────────────────────────────────────

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
