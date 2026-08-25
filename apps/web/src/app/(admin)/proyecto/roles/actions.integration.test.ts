/**
 * Integration tests for the user-invite / role-assignment server actions.
 * Skipped by default — needs a test DB helper to set up an isolated
 * better-sqlite3 instance per test run.
 */
import { describe, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/lib/session', () => ({ getCurrentUser }));

vi.mock('@/db/client', () => ({
  getDb: () => {
    throw new Error('Integration test DB not wired up yet.');
  },
}));

import { changeUserRole, inviteUserToProject, removeUserFromProject } from './actions';

describe.skip('inviteUserToProject — new vs existing user', () => {
  it('creates a new user with placeholder password hash and adds to project');
  it('finds an existing user by email and only adds the membership');
  it('is idempotent: re-inviting an existing member returns an error');
  it('rejects an invalid email (Zod)');
  it('rejects an invalid role (Zod)');
});

describe.skip('inviteUserToProject — RBAC', () => {
  it('allows a superadmin to invite to any project');
  it('allows a projectadmin of the same project to invite');
  it('rejects an annotator of the same project');
  it('rejects an unrelated user');
});

describe.skip('changeUserRole', () => {
  it('updates the role and writes audit_log with from/to');
  it('rejects if the new role equals the current one');
  it('respects RBAC (only managers)');
});

describe.skip('removeUserFromProject', () => {
  it('removes the membership and writes audit_log');
  it('refuses to remove the last projectadmin');
  it('respects RBAC');
});

describe.skip('audit log', () => {
  it('every mutating action writes a row with actorId, projectId, action, metadata');
});
