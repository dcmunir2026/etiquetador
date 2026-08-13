// Drizzle ORM schema for the Etiquetador platform.
// Multi-tenant: every domain table has a `projectId` foreign key.

import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  integer,
  pgEnum,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const projectStatusEnum = pgEnum('project_status', ['active', 'archived']);

export const roleScopeEnum = pgEnum('role_scope', ['system', 'project']);

export const intensityScaleKindEnum = pgEnum('intensity_scale_kind', [
  'binary',
  'three-level',
  'five-level',
  'likert',
  'free-text',
]);

export const segmentationUnitEnum = pgEnum('segmentation_unit', [
  'token',
  'word',
  'sentence',
  'paragraph',
  'character',
]);

export const dimensionKindEnum = pgEnum('dimension_kind', [
  'category',
  'intensity',
  'flag',
  'free-text',
]);

// ─── USERS ────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    name: text('name'),
    passwordHash: text('password_hash'),
    isSuperAdmin: boolean('is_super_admin').notNull().default(false),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailUnique: uniqueIndex('users_email_unique').on(t.email),
  }),
);

// ─── PROJECTS ─────────────────────────────────────────────────────────

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    status: projectStatusEnum('status').notNull().default('active'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex('projects_slug_unique').on(t.slug),
  }),
);

// ─── ROLES & PERMISSIONS ──────────────────────────────────────────────

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    scope: roleScopeEnum('scope').notNull().default('project'),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameProjectUnique: uniqueIndex('roles_name_project_unique').on(t.projectId, t.name),
  }),
);

export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    resource: text('resource'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    roleActionResourceUnique: uniqueIndex('permissions_role_action_resource_unique').on(
      t.roleId,
      t.action,
      t.resource,
    ),
  }),
);

// ─── PROJECT USERS (membership) ───────────────────────────────────────

export const projectUsers = pgTable(
  'project_users',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.userId] }),
    userIdx: index('project_users_user_idx').on(t.userId),
  }),
);

// ─── AUDIT LOG ────────────────────────────────────────────────────────

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    metadata: text('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectIdx: index('audit_log_project_idx').on(t.projectId),
    actorIdx: index('audit_log_actor_idx').on(t.actorId),
    createdIdx: index('audit_log_created_idx').on(t.createdAt),
  }),
);

// ─── INTENSITY SCALES ────────────────────────────────────────────────

export const intensityScales = pgTable(
  'intensity_scales',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: intensityScaleKindEnum('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameProjectUnique: uniqueIndex('intensity_scales_name_project_unique').on(t.projectId, t.name),
  }),
);

export const intensityLevels = pgTable(
  'intensity_levels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scaleId: uuid('scale_id')
      .notNull()
      .references(() => intensityScales.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    value: text('value').notNull(),
    order: integer('order').notNull(),
  },
  (t) => ({
    scaleOrderUnique: uniqueIndex('intensity_levels_scale_order_unique').on(t.scaleId, t.order),
  }),
);

// ─── DIMENSIONS (configurable per project) ───────────────────────────

export const dimensions = pgTable(
  'dimensions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    kind: dimensionKindEnum('kind').notNull(),
    scaleId: uuid('scale_id').references(() => intensityScales.id, { onDelete: 'set null' }),
    required: boolean('required').notNull().default(true),
    order: integer('order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameProjectUnique: uniqueIndex('dimensions_name_project_unique').on(t.projectId, t.name),
    projectIdx: index('dimensions_project_idx').on(t.projectId),
  }),
);

export const dimensionValues = pgTable(
  'dimension_values',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dimensionId: uuid('dimension_id')
      .notNull()
      .references(() => dimensions.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    value: text('value').notNull(),
    order: integer('order').notNull(),
  },
  (t) => ({
    dimOrderUnique: uniqueIndex('dimension_values_dim_order_unique').on(t.dimensionId, t.order),
  }),
);

// ─── SEGMENTATION CONFIG ─────────────────────────────────────────────

export const segmentationConfigs = pgTable(
  'segmentation_configs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    unit: segmentationUnitEnum('unit').notNull(),
    maxChunkSize: integer('max_chunk_size').notNull(),
    overlap: integer('overlap').notNull().default(0),
    respectBoundaries: boolean('respect_boundaries').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameProjectUnique: uniqueIndex('segmentation_configs_name_project_unique').on(
      t.projectId,
      t.name,
    ),
  }),
);

// ─── RELATIONS ───────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  projectUsers: many(projectUsers),
  createdProjects: many(projects),
}));

export const projectsRelations = relations(projects, ({ many, one }) => ({
  createdByUser: one(users, { fields: [projects.createdBy], references: [users.id] }),
  projectUsers: many(projectUsers),
  roles: many(roles),
  intensityScales: many(intensityScales),
  dimensions: many(dimensions),
  segmentationConfigs: many(segmentationConfigs),
}));

export const projectUsersRelations = relations(projectUsers, ({ one }) => ({
  project: one(projects, { fields: [projectUsers.projectId], references: [projects.id] }),
  user: one(users, { fields: [projectUsers.userId], references: [users.id] }),
  role: one(roles, { fields: [projectUsers.roleId], references: [roles.id] }),
}));

export const rolesRelations = relations(roles, ({ many, one }) => ({
  project: one(projects, { fields: [roles.projectId], references: [projects.id] }),
  permissions: many(permissions),
  projectUsers: many(projectUsers),
}));

export const dimensionsRelations = relations(dimensions, ({ one, many }) => ({
  project: one(projects, { fields: [dimensions.projectId], references: [projects.id] }),
  scale: one(intensityScales, { fields: [dimensions.scaleId], references: [intensityScales.id] }),
  values: many(dimensionValues),
}));

// ─── MIGRATION TRACKING ──────────────────────────────────────────────

export const __migrations = pgTable('__migrations', {
  // Drizzle Kit manages this internally; the table is created on first migrate.
  // We expose it here so types compile.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _placeholder: text('placeholder').default(sql`null`),
});
