// Drizzle ORM schema for the Etiquetador platform.
//
// Model (refactored from mockup):
//   - Dimensions are GLOBAL (atomic annotable attributes).
//   - Taxonomies are GLOBAL groups of dimensions (N:M).
//   - Projects get assigned TAXONOMIES (not dimensions).
//   - Intensity scales are GLOBAL (binary, 3-level, 5-level, etc).
//
// Driver: PostgreSQL via postgres.js + drizzle-orm/pg-core.

import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';

// ─── Helpers ─────────────────────────────────────────────────────────

/** Prefixed, sortable, URL-safe id. Format: t_<base36 ts>_<4 random chars>. */
function newId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `t_${ts}_${rand}`;
}

// ─── Enums (kept as text + app-layer checks, matching the SQLite era) ─

export const PROJECT_STATUSES = ['active', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const SCALE_KINDS = [
  'boolean',
  'binary',
  '3-level',
  '4-level',
  '5-level',
  'likert',
  'categorical',
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

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    email: text('email').notNull(),
    name: text('name'),
    avatarColor: text('avatar_color'),
    isSuperAdmin: boolean('is_super_admin').notNull().default(false),
    /** bcrypt hash. NULL means the account cannot sign in yet. */
    passwordHash: text('password_hash'),
    emailVerifiedAt: timestamp('email_verified_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    emailUnique: uniqueIndex('users_email_unique').on(t.email),
  }),
);

// ─── PROJECTS ─────────────────────────────────────────────────────────

export const projects = pgTable(
  'projects',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    status: text('status', { enum: PROJECT_STATUSES }).notNull().default('active'),
    createdBy: text('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex('projects_slug_unique').on(t.slug),
  }),
);

// ─── PROJECT MEMBERS ──────────────────────────────────────────────────

export const projectMembers = pgTable(
  'project_members',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: USER_ROLES }).notNull().default('annotator'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueMember: uniqueIndex('project_members_unique').on(t.projectId, t.userId),
  }),
);

// ─── INTENSITY SCALES (GLOBAL) ──────────────────────────────────────

export const intensityScales = pgTable(
  'intensity_scales',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    name: text('name').notNull(),
    kind: text('kind', { enum: SCALE_KINDS }).notNull(),
    isCustom: boolean('is_custom').notNull().default(false),
    createdBy: text('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    nameUnique: uniqueIndex('intensity_scales_name_unique').on(t.name),
  }),
);

export const intensityLevels = pgTable(
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

export const dimensions = pgTable(
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
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex('dimensions_slug_unique').on(t.slug),
  }),
);

export const dimensionValues = pgTable(
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

export const taxonomies = pgTable(
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
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex('taxonomies_slug_unique').on(t.slug),
  }),
);

// N:M: which dimensions are in which taxonomy
export const taxonomyDimensions = pgTable(
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
export const projectTaxonomies = pgTable(
  'project_taxonomies',
  {
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    taxonomyId: text('taxonomy_id').notNull().references(() => taxonomies.id, { onDelete: 'cascade' }),
    assignedBy: text('assigned_by').references(() => users.id),
    assignedAt: timestamp('assigned_at', { mode: 'date' }).notNull().defaultNow(),
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
    id: text('id').primaryKey().$defaultFn(() => newId()),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    unit: text('unit', { enum: SEGMENTATION_UNITS }).notNull(),
    maxChunkSize: integer('max_chunk_size').notNull(),
    overlap: integer('overlap').notNull().default(0),
    respectBoundaries: boolean('respect_boundaries').notNull().default(true),
    tolerance: integer('tolerance').notNull().default(15),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    nameProjectUnique: uniqueIndex('segmentation_configs_name_project_unique').on(t.projectId, t.name),
  }),
);

// ─── DIMENSION DEPENDENCIES (skip logic) ────────────────────────────
//
// A dimension can be shown only when its parent dimension was answered
// with one of `values`. Mirrors the mockup's `dependencies[0]` model:
// a single parent per dimension, matched with `=` against a value list.

export const DEPENDENCY_OPERATORS = ['=', '!=', 'in'] as const;
export type DependencyOperator = (typeof DEPENDENCY_OPERATORS)[number];

export const DEPENDENCY_BEHAVIORS = ['skip'] as const;
export type DependencyBehavior = (typeof DEPENDENCY_BEHAVIORS)[number];

export const dimensionDependencies = pgTable(
  'dimension_dependencies',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    /** The dimension that is conditionally shown. */
    dimensionId: text('dimension_id').notNull().references(() => dimensions.id, { onDelete: 'cascade' }),
    /** The dimension whose answer gates it. */
    dependsOnId: text('depends_on_id').notNull().references(() => dimensions.id, { onDelete: 'cascade' }),
    operator: text('operator', { enum: DEPENDENCY_OPERATORS }).notNull().default('='),
    /** JSON array of parent values that reveal this dimension. */
    values: text('values').notNull(),
    behavior: text('behavior', { enum: DEPENDENCY_BEHAVIORS }).notNull().default('skip'),
    /** Human-readable rule, e.g. "¿Hay odio? = Sí". */
    label: text('label'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    // One rule per dimension keeps resolution deterministic (mockup parity).
    dimUnique: uniqueIndex('dimension_dependencies_dim_unique').on(t.dimensionId),
    parentIdx: index('dimension_dependencies_parent_idx').on(t.dependsOnId),
  }),
);

// ─── CORPUS UPLOADS (H1 — Cargar Excel) ─────────────────────────────

export const UPLOAD_STATUSES = ['uploaded', 'mapped', 'segmented', 'failed'] as const;
export type UploadStatus = (typeof UPLOAD_STATUSES)[number];

export const corpusUploads = pgTable(
  'corpus_uploads',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    sheetName: text('sheet_name'),
    sizeBytes: integer('size_bytes').notNull().default(0),
    rowCount: integer('row_count').notNull().default(0),
    uniqueCount: integer('unique_count').notNull().default(0),
    duplicateCount: integer('duplicate_count').notNull().default(0),
    avgTokens: integer('avg_tokens').notNull().default(0),
    fragmentablePct: integer('fragmentable_pct').notNull().default(0),
    /** JSON: { pivot, conversationId, question, metadata[] } → column letters. */
    columnMapping: text('column_mapping'),
    status: text('status', { enum: UPLOAD_STATUSES }).notNull().default('uploaded'),
    uploadedBy: text('uploaded_by').references(() => users.id),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    projectIdx: index('corpus_uploads_project_idx').on(t.projectId),
  }),
);

// ─── FRAGMENTS (H3/H4 — unidad etiquetable) ─────────────────────────

export const fragments = pgTable(
  'fragments',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    uploadId: text('upload_id').references(() => corpusUploads.id, { onDelete: 'set null' }),
    /** Source row identity, from the Excel `conversacionId` column. */
    conversationId: text('conversation_id'),
    question: text('question'),
    /** The full answer the fragment was cut from (shown as context). */
    sourceText: text('source_text'),
    /** The actual text to annotate. */
    text: text('text').notNull(),
    /** 1-based position within its source answer. */
    fragmentIndex: integer('fragment_index').notNull().default(1),
    fragmentTotal: integer('fragment_total').notNull().default(1),
    variant: integer('variant').notNull().default(1),
    charLength: integer('char_length').notNull().default(0),
    tokenCount: integer('token_count').notNull().default(0),
    apiSuccess: boolean('api_success').notNull().default(true),
    isDuplicate: boolean('is_duplicate').notNull().default(false),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    projectIdx: index('fragments_project_idx').on(t.projectId),
    conversationIdx: index('fragments_conversation_idx').on(t.conversationId),
  }),
);

// ─── TEAMS (per project) ────────────────────────────────────────────

export const CONSENSUS_METRICS = ['fleiss', 'krippendorff', 'weighted-majority', 'unanimous'] as const;
export type ConsensusMetric = (typeof CONSENSUS_METRICS)[number];

export const teams = pgTable(
  'teams',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** How many annotators share each package (dúo=2, trío=3, …). */
    groupSize: integer('group_size').notNull().default(2),
    consensusMetric: text('consensus_metric', { enum: CONSENSUS_METRICS }).notNull().default('fleiss'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    projectNameUnique: uniqueIndex('teams_project_name_unique').on(t.projectId, t.name),
  }),
);

export const teamMembers = pgTable(
  'team_members',
  {
    teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: USER_ROLES }).notNull().default('annotator'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.teamId, t.userId] }),
    userIdx: index('team_members_user_idx').on(t.userId),
  }),
);

// ─── PACKAGES (H8 — división del corpus) ────────────────────────────

export const PACKAGE_STATUSES = ['draft', 'assigned', 'in_progress', 'submitted', 'approved', 'returned', 'blocked'] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

export const packages = pgTable(
  'packages',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    teamId: text('team_id').references(() => teams.id, { onDelete: 'set null' }),
    /** Display code, e.g. PK-A-001. */
    code: text('code').notNull(),
    /** True when the same fragments go to every annotator (paquete espejo). */
    isMirror: boolean('is_mirror').notNull().default(true),
    status: text('status', { enum: PACKAGE_STATUSES }).notNull().default('assigned'),
    /** Bumped every time the package is returned for re-annotation. */
    version: integer('version').notNull().default(1),
    returnCount: integer('return_count').notNull().default(0),
    notes: text('notes'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    projectCodeUnique: uniqueIndex('packages_project_code_unique').on(t.projectId, t.code),
    teamIdx: index('packages_team_idx').on(t.teamId),
  }),
);

export const packageFragments = pgTable(
  'package_fragments',
  {
    packageId: text('package_id').notNull().references(() => packages.id, { onDelete: 'cascade' }),
    fragmentId: text('fragment_id').notNull().references(() => fragments.id, { onDelete: 'cascade' }),
    order: integer('order').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.packageId, t.fragmentId] }),
    fragIdx: index('package_fragments_fragment_idx').on(t.fragmentId),
  }),
);

export const ASSIGNMENT_STATUSES = ['assigned', 'in_progress', 'submitted'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const packageAssignments = pgTable(
  'package_assignments',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    packageId: text('package_id').notNull().references(() => packages.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ASSIGNMENT_STATUSES }).notNull().default('assigned'),
    /** Submission round for this annotator (v0 = never submitted). */
    version: integer('version').notNull().default(0),
    isLead: boolean('is_lead').notNull().default(false),
    submittedAt: timestamp('submitted_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    packageUserUnique: uniqueIndex('package_assignments_package_user_unique').on(t.packageId, t.userId),
    userIdx: index('package_assignments_user_idx').on(t.userId),
  }),
);

// ─── ANNOTATIONS (H10-H12 — el dato central) ────────────────────────

export const annotations = pgTable(
  'annotations',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    fragmentId: text('fragment_id').notNull().references(() => fragments.id, { onDelete: 'cascade' }),
    packageId: text('package_id').references(() => packages.id, { onDelete: 'set null' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    dimensionId: text('dimension_id').notNull().references(() => dimensions.id, { onDelete: 'cascade' }),
    /** The chosen label, or free text. NULL means the dimension was skipped. */
    value: text('value'),
    /** True when skip-logic hid this dimension for this annotator. */
    skipped: boolean('skipped').notNull().default(false),
    notes: text('notes'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    // One answer per (fragment, annotator, dimension).
    uniqueAnnotation: uniqueIndex('annotations_unique').on(t.fragmentId, t.userId, t.dimensionId),
    fragmentIdx: index('annotations_fragment_idx').on(t.fragmentId),
    packageIdx: index('annotations_package_idx').on(t.packageId),
    dimensionIdx: index('annotations_dimension_idx').on(t.dimensionId),
  }),
);

// ─── QUALITATIVE VALIDATION (H18-H19) ───────────────────────────────

export const QUAL_DECISIONS = ['pending', 'approved', 'corrected'] as const;
export type QualDecision = (typeof QUAL_DECISIONS)[number];

/** One row per fragment drawn into a team's qualitative review sample. */
export const qualValidations = pgTable(
  'qual_validations',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    packageId: text('package_id').references(() => packages.id, { onDelete: 'set null' }),
    fragmentId: text('fragment_id').notNull().references(() => fragments.id, { onDelete: 'cascade' }),
    validatorId: text('validator_id').references(() => users.id, { onDelete: 'set null' }),
    status: text('status', { enum: QUAL_DECISIONS }).notNull().default('pending'),
    rejectReason: text('reject_reason'),
    reviewedAt: timestamp('reviewed_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    teamFragmentUnique: uniqueIndex('qual_validations_team_fragment_unique').on(t.teamId, t.fragmentId),
    teamIdx: index('qual_validations_team_idx').on(t.teamId),
  }),
);

/** A validator overriding one dimension's consensus value. */
export const qualCorrections = pgTable(
  'qual_corrections',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    validationId: text('validation_id').notNull().references(() => qualValidations.id, { onDelete: 'cascade' }),
    dimensionId: text('dimension_id').notNull().references(() => dimensions.id, { onDelete: 'cascade' }),
    originalValue: text('original_value'),
    correctedValue: text('corrected_value'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    validationDimUnique: uniqueIndex('qual_corrections_validation_dim_unique').on(t.validationId, t.dimensionId),
  }),
);

// ─── AUDIT LOG ───────────────────────────────────────────────────────

export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey().$defaultFn(() => newId()),
    actorId: text('actor_id').references(() => users.id),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: text('metadata'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
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

// ─── Relations / types for the workflow tables ──────────────────────

export const dimensionDependenciesRelations = relations(dimensionDependencies, ({ one }) => ({
  dimension: one(dimensions, { fields: [dimensionDependencies.dimensionId], references: [dimensions.id], relationName: 'dependencyChild' }),
  dependsOn: one(dimensions, { fields: [dimensionDependencies.dependsOnId], references: [dimensions.id], relationName: 'dependencyParent' }),
}));

export const corpusUploadsRelations = relations(corpusUploads, ({ one, many }) => ({
  project: one(projects, { fields: [corpusUploads.projectId], references: [projects.id] }),
  fragments: many(fragments),
}));

export const fragmentsRelations = relations(fragments, ({ one, many }) => ({
  project: one(projects, { fields: [fragments.projectId], references: [projects.id] }),
  upload: one(corpusUploads, { fields: [fragments.uploadId], references: [corpusUploads.id] }),
  annotations: many(annotations),
  packages: many(packageFragments),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  project: one(projects, { fields: [teams.projectId], references: [projects.id] }),
  members: many(teamMembers),
  packages: many(packages),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  user: one(users, { fields: [teamMembers.userId], references: [users.id] }),
}));

export const packagesRelations = relations(packages, ({ one, many }) => ({
  project: one(projects, { fields: [packages.projectId], references: [projects.id] }),
  team: one(teams, { fields: [packages.teamId], references: [teams.id] }),
  fragments: many(packageFragments),
  assignments: many(packageAssignments),
}));

export const packageFragmentsRelations = relations(packageFragments, ({ one }) => ({
  package: one(packages, { fields: [packageFragments.packageId], references: [packages.id] }),
  fragment: one(fragments, { fields: [packageFragments.fragmentId], references: [fragments.id] }),
}));

export const packageAssignmentsRelations = relations(packageAssignments, ({ one }) => ({
  package: one(packages, { fields: [packageAssignments.packageId], references: [packages.id] }),
  user: one(users, { fields: [packageAssignments.userId], references: [users.id] }),
}));

export const annotationsRelations = relations(annotations, ({ one }) => ({
  fragment: one(fragments, { fields: [annotations.fragmentId], references: [fragments.id] }),
  package: one(packages, { fields: [annotations.packageId], references: [packages.id] }),
  user: one(users, { fields: [annotations.userId], references: [users.id] }),
  dimension: one(dimensions, { fields: [annotations.dimensionId], references: [dimensions.id] }),
}));

export const qualValidationsRelations = relations(qualValidations, ({ one, many }) => ({
  project: one(projects, { fields: [qualValidations.projectId], references: [projects.id] }),
  team: one(teams, { fields: [qualValidations.teamId], references: [teams.id] }),
  fragment: one(fragments, { fields: [qualValidations.fragmentId], references: [fragments.id] }),
  validator: one(users, { fields: [qualValidations.validatorId], references: [users.id] }),
  corrections: many(qualCorrections),
}));

export const qualCorrectionsRelations = relations(qualCorrections, ({ one }) => ({
  validation: one(qualValidations, { fields: [qualCorrections.validationId], references: [qualValidations.id] }),
  dimension: one(dimensions, { fields: [qualCorrections.dimensionId], references: [dimensions.id] }),
}));

export type DimensionDependency = typeof dimensionDependencies.$inferSelect;
export type NewDimensionDependency = typeof dimensionDependencies.$inferInsert;
export type CorpusUpload = typeof corpusUploads.$inferSelect;
export type NewCorpusUpload = typeof corpusUploads.$inferInsert;
export type Fragment = typeof fragments.$inferSelect;
export type NewFragment = typeof fragments.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type Package = typeof packages.$inferSelect;
export type NewPackage = typeof packages.$inferInsert;
export type PackageFragment = typeof packageFragments.$inferSelect;
export type NewPackageFragment = typeof packageFragments.$inferInsert;
export type PackageAssignment = typeof packageAssignments.$inferSelect;
export type NewPackageAssignment = typeof packageAssignments.$inferInsert;
export type Annotation = typeof annotations.$inferSelect;
export type NewAnnotation = typeof annotations.$inferInsert;
export type QualValidation = typeof qualValidations.$inferSelect;
export type NewQualValidation = typeof qualValidations.$inferInsert;
export type QualCorrection = typeof qualCorrections.$inferSelect;
export type NewQualCorrection = typeof qualCorrections.$inferInsert;
