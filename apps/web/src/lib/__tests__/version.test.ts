import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  execSync: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  readFileSync: mocks.readFileSync,
}));

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execSync: mocks.execSync,
}));

/** Fresh module instance each time: getBuildInfo caches per module. */
async function buildInfo() {
  vi.resetModules();
  const { getBuildInfo } = await import('../version');
  return getBuildInfo();
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.APP_VERSION;
  delete process.env.APP_SHA;
});

describe('identidad del build', () => {
  it('usa el entorno cuando la imagen trae la versión y el commit', async () => {
    // Éste es el camino de producción: la imagen lleva APP_VERSION y
    // APP_SHA porque dentro del contenedor no hay checkout de git.
    process.env.APP_VERSION = '1.3.0';
    process.env.APP_SHA = 'a1b2c3d';
    expect(await buildInfo()).toEqual({ app: '1.3.0', sha: 'a1b2c3d' });
    // Y no debe ni intentar leer el disco.
    expect(mocks.readFileSync).not.toHaveBeenCalled();
    expect(mocks.execSync).not.toHaveBeenCalled();
  });

  it('en desarrollo lee el package.json y el commit del repo', async () => {
    mocks.readFileSync.mockReturnValue(JSON.stringify({ version: '1.3.0' }));
    mocks.execSync.mockReturnValue('a1b2c3d\n');
    expect(await buildInfo()).toEqual({ app: '1.3.0', sha: 'a1b2c3d' });
  });

  it('sin nada disponible cae en los marcadores de posición', async () => {
    mocks.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    mocks.execSync.mockImplementation(() => {
      throw new Error('not a git repository');
    });
    expect(await buildInfo()).toEqual({ app: '0.0.0', sha: 'unknown' });
  });

  it('una variable de entorno vacía no tapa el valor del repositorio', async () => {
    process.env.APP_VERSION = '';
    process.env.APP_SHA = '   ';
    mocks.readFileSync.mockReturnValue(JSON.stringify({ version: '1.3.0' }));
    mocks.execSync.mockReturnValue('a1b2c3d\n');
    expect(await buildInfo()).toEqual({ app: '1.3.0', sha: 'a1b2c3d' });
  });
});
