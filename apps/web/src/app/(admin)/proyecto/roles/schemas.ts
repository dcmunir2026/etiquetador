/**
 * Pure Zod schemas for the user-invite / role-assignment flows.
 * No DB or auth imports here so the suite can run without next-auth /
 * better-sqlite3.
 */
import { z } from 'zod';

// Keep in sync with `USER_ROLES` in packages/db/src/index.ts and
// apps/web/src/db/schema.ts.
export const ROLE_VALUES = [
  'superadmin',
  'projectadmin',
  'annotator',
  'validator',
  'viewer',
] as const;

const RoleEnum = z.enum(ROLE_VALUES, {
  errorMap: () => ({ message: 'Rol no válido' }),
});

// Email + project id + role for invitations.
export const InviteUserInput = z.object({
  projectId: z.string().min(1, 'Proyecto requerido'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Email requerido')
    .max(254)
    .email('Email no válido'),
  role: RoleEnum,
  // If true, mark the membership as created but pending the user signing up.
  // For the prototype this is always true — real email invites come later.
  sendInvite: z.boolean().optional().default(true),
});

export const ChangeRoleInput = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
  role: RoleEnum,
});

export const RemoveMemberInput = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
});

