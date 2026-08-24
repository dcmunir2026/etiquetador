/**
 * Unit tests for the project CRUD server actions.
 *
 * Tests that only exercise Zod validation live here. Tests that need
 * a DB or a current-user mock live in `actions.integration.test.ts`
 * and are skipped by default in vitest.config.ts.
 */
import { describe, expect, it } from 'vitest';
import { _internal } from './actions';

const { CreateInput, UpdateInput, IdInput } = _internal;

describe('CreateInput (Zod)', () => {
  it('accepts a minimal valid project', () => {
    const r = CreateInput.safeParse({ name: 'EpData 2026-Q4' });
    expect(r.success).toBe(true);
  });
  it('accepts an optional description', () => {
    const r = CreateInput.safeParse({ name: 'Foo', description: 'bar' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.description).toBe('bar');
    }
  });
  it('treats empty description as undefined', () => {
    const r = CreateInput.safeParse({ name: 'Foo', description: '' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.description).toBeUndefined();
    }
  });
  it('rejects too-short names', () => {
    const r = CreateInput.safeParse({ name: 'a' });
    expect(r.success).toBe(false);
  });
  it('rejects too-long names (>80 chars)', () => {
    const r = CreateInput.safeParse({ name: 'x'.repeat(81) });
    expect(r.success).toBe(false);
  });
  it('rejects too-long descriptions (>500 chars)', () => {
    const r = CreateInput.safeParse({ name: 'Foo', description: 'x'.repeat(501) });
    expect(r.success).toBe(false);
  });
  it('trims whitespace around the name', () => {
    const r = CreateInput.safeParse({ name: '   Foo   ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe('Foo');
  });
});

describe('UpdateInput (Zod)', () => {
  it('requires an id', () => {
    const r = UpdateInput.safeParse({ name: 'Foo' });
    expect(r.success).toBe(false);
  });
  it('accepts a valid update', () => {
    const r = UpdateInput.safeParse({ id: 't_abc', name: 'New name' });
    expect(r.success).toBe(true);
  });
});

describe('IdInput (Zod)', () => {
  it('requires a non-empty id', () => {
    expect(IdInput.safeParse({ id: '' }).success).toBe(false);
    expect(IdInput.safeParse({ id: 't_abc' }).success).toBe(true);
  });
});
