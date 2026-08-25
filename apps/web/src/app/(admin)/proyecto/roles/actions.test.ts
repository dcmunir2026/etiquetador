/**
 * Unit tests for the user-invite / role-assignment Zod schemas.
 */
import { describe, expect, it } from 'vitest';
import { ChangeRoleInput, InviteUserInput, RemoveMemberInput } from './schemas';

describe('InviteUserInput', () => {
  it('accepts a minimal valid invite', () => {
    const r = InviteUserInput.safeParse({
      projectId: 't_abc',
      email: 'persona@equipo.es',
      role: 'annotator',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe('persona@equipo.es');
      expect(r.data.role).toBe('annotator');
    }
  });
  it('lowercases and trims the email', () => {
    const r = InviteUserInput.safeParse({
      projectId: 't_abc',
      email: '  Persona@EQUIPO.es  ',
      role: 'validator',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('persona@equipo.es');
  });
  it('rejects an invalid email', () => {
    const r = InviteUserInput.safeParse({
      projectId: 't_abc',
      email: 'not-an-email',
      role: 'annotator',
    });
    expect(r.success).toBe(false);
  });
  it('rejects an invalid role', () => {
    const r = InviteUserInput.safeParse({
      projectId: 't_abc',
      email: 'p@e.es',
      role: 'god-mode',
    });
    expect(r.success).toBe(false);
  });
  it('rejects empty projectId', () => {
    const r = InviteUserInput.safeParse({
      projectId: '',
      email: 'p@e.es',
      role: 'annotator',
    });
    expect(r.success).toBe(false);
  });
});

describe('ChangeRoleInput', () => {
  it('requires projectId, userId, role', () => {
    expect(
      ChangeRoleInput.safeParse({ projectId: 'a', userId: 'b', role: 'annotator' }).success,
    ).toBe(true);
    expect(ChangeRoleInput.safeParse({ projectId: 'a', userId: 'b' }).success).toBe(false);
    expect(
      ChangeRoleInput.safeParse({ projectId: 'a', userId: 'b', role: 'nope' }).success,
    ).toBe(false);
  });
});

describe('RemoveMemberInput', () => {
  it('requires both ids', () => {
    expect(RemoveMemberInput.safeParse({ projectId: 'a', userId: 'b' }).success).toBe(true);
    expect(RemoveMemberInput.safeParse({ projectId: '' }).success).toBe(false);
    expect(RemoveMemberInput.safeParse({}).success).toBe(false);
  });
});
