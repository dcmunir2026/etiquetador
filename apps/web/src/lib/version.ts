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
 * Where the values come from, in order of preference:
 *
 *  1. `APP_VERSION` / `APP_SHA` from the environment. This is what the
 *     production image uses: the container has no repo checkout (the
 *     build context excludes `.git`) and runs with cwd=/app, so it
 *     cannot discover either value on its own. `Dockerfile.web` bakes
 *     them in as build args, and `scripts/registry-push.sh` fills them
 *     with the real version and the short SHA of the commit being
 *     published. The image is the source of truth: to change what
 *     production shows, rebuild and republish — the server's .env
 *     does not carry these variables.
 *
 *  2. The workspace package.json plus `git rev-parse`. This is the
 *     development path, where the app runs straight from the checkout.
 *
 * Falls back gracefully (no throw) when neither is available.
 */
export function getBuildInfo(): { app: string; sha: string } {
  if (cached) return cached;
  let app = process.env.APP_VERSION?.trim() || '';
  let sha = process.env.APP_SHA?.trim() || '';
  if (!app) app = readAppVersion();
  if (!sha) sha = readGitSha();
  cached = { app: app || '0.0.0', sha: sha || 'unknown' };
  return cached;
}

function readAppVersion(): string {
  try {
    const raw = readFileSync(path.join(ROOT, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    if (typeof parsed.version === 'string') return parsed.version;
  } catch { /* keep the caller's default */ }
  return '';
}

function readGitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch { /* not a git checkout, or no HEAD */ }
  return '';
}
