/**
 * Unit tests for the project CRUD Zod schemas (pure, no DB / next-auth).
 */
import { describe, expect, it } from 'vitest';
import { CreateProjectInput, IdInput, UpdateProjectInput } from './schemas';

describe('CreateProjectInput', () => {
  it('accepts a minimal valid project', () => {
    const r = CreateProjectInput.safeParse({ name: 'EpData 2026-Q4' });
    expect(r.success).toBe(true);
  });
  it('accepts an optional description', () => {
    const r = CreateProjectInput.safeParse({ name: 'Foo', description: 'bar' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.description).toBe('bar');
  });
  it('treats empty description as undefined', () => {
    const r = CreateProjectInput.safeParse({ name: 'Foo', description: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.description).toBeUndefined();
  });
  it('rejects too-short names', () => {
    const r = CreateProjectInput.safeParse({ name: 'a' });
    expect(r.success).toBe(false);
  });
  it('rejects too-long names (>80 chars)', () => {
    const r = CreateProjectInput.safeParse({ name: 'x'.repeat(81) });
    expect(r.success).toBe(false);
  });
  it('rejects too-long descriptions (>500 chars)', () => {
    const r = CreateProjectInput.safeParse({ name: 'Foo', description: 'x'.repeat(501) });
    expect(r.success).toBe(false);
  });
  it('trims whitespace around the name', () => {
    const r = CreateProjectInput.safeParse({ name: '   Foo   ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe('Foo');
  });
});

describe('UpdateProjectInput', () => {
  it('requires an id', () => {
    const r = UpdateProjectInput.safeParse({ name: 'Foo' });
    expect(r.success).toBe(false);
  });
  it('accepts a valid update', () => {
    const r = UpdateProjectInput.safeParse({ id: 't_abc', name: 'New name' });
    expect(r.success).toBe(true);
  });
});

describe('IdInput', () => {
  it('requires a non-empty id', () => {
    expect(IdInput.safeParse({ id: '' }).success).toBe(false);
    expect(IdInput.safeParse({ id: 't_abc' }).success).toBe(true);
  });
});
