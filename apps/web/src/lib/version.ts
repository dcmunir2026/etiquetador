import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), '..', '..');

let cached: { app: string; sha: string } | null = null;

/**
 * Identity of the running build: package version + short git SHA.
 *
 * Both values are computed lazily and cached for the lifetime of the
 * Node process — git rev-parse and a JSON read per request would be
 * wasteful on a screen that loads on every login.
 *
 * Falls back gracefully (no throw) when the repo isn't initialised,
 * which matters for production builds where `.git/` may be excluded.
 */
export function getBuildInfo(): { app: string; sha: string } {
  if (cached) return cached;
  let app = '0.0.0';
  try {
    const raw = readFileSync(path.join(ROOT, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    if (typeof parsed.version === 'string') app = parsed.version;
  } catch { /* keep default */ }
  let sha = 'unknown';
  try {
    sha = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch { /* not a git checkout, or no HEAD */ }
  cached = { app, sha };
  return cached;
}