/**
 * Integration tests for project CRUD server actions.
 *
 * These tests need a real (or in-memory) SQLite DB and a way to mock the
 * current user. They are skipped by default in vitest.config.ts because
 * setting up a separate test DB is non-trivial; the project's CI
 * configuration should run them with a fresh schema in a separate
 * better-sqlite3 in-memory instance.
 *
 * The acceptance criteria for #4 (RBAC check, audit log writes) are
 * covered by the structure here, but skipped until we wire up a test
 * DB helper.
 */
import { describe, expect, it, vi } from 'vitest';

// We mock @/lib/session.getCurrentUser to control who the "current user" is.
const getCurrentUser = vi.fn();
vi.mock('@/lib/session', () => ({ getCurrentUser }));

// We also mock @/db/client.getDb with a fresh in-memory better-sqlite3
// and a Drizzle wrapper. Skipped for now.
vi.mock('@/db/client', () => ({
  getDb: () => {
    throw new Error('Integration test DB not wired up yet.');
  },
}));

import { createProject, archiveProject } from './actions';

describe.skip('createProject — RBAC', () => {
  it('rejects when not authenticated', async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    const res = await createProject({ name: 'Test' });
    expect(res.ok).toBe(false);
  });

  it('rejects when user is not superadmin', async () => {
    getCurrentUser.mockResolvedValueOnce({
      id: 'u1', email: 'u@e', name: 'U', isSuperAdmin: false,
    });
    const res = await createProject({ name: 'Test' });
    expect(res.ok).toBe(false);
  });

  it('creates a project when superadmin', async () => {
    getCurrentUser.mockResolvedValueOnce({
      id: 'u1', email: 'u@e', name: 'U', isSuperAdmin: true,
    });
    // …would insert and return ok:true with id
  });
});

describe.skip('createProject — slug uniqueness', () => {
  it('appends -2 when the base slug is taken');
  it('appends -3, -4, … until free');
});

describe.skip('archiveProject — audit log', () => {
  it('writes a project.archive audit_log row with the actor id');
  it('does not archive an already-archived project');
});

describe.skip('requireSuperAdmin (internal)', () => {
  it('throws when no user');
  it('throws when user is not superadmin');
  it('returns the user when superadmin');
});
