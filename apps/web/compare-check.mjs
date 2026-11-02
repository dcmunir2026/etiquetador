import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3106';
const PASSWORD = 'etiquetador';

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN });

async function session(email, projectId) {
  const ctx = await browser.newContext();
  if (projectId) {
    await ctx.addCookies([{ name: 'etq_active_project', value: projectId,
      domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  }
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !new URL(u).pathname.startsWith('/login'), { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
  return { ctx, page };
}

// 1. El admin ve lo mismo que el anotador, comparación incluida.
console.log('== admin en el preview de Augusto ==');
{
  const { ctx, page } = await session('marta@etiquetador.local', 't_muve7a3x_ha4g');
  await page.goto(`${BASE}/etiquetar-vista?user=t_muc47mem_q5gn&pkg=t_muvgjxht_8s5w`,
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  console.log('aviso de equipo:', await page.locator('[data-testid=team-comparison]').count(),
    '· cintas:', await page.locator('[data-testid=discrepancy-detail]').count());
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '/tmp/compare-preview.png' });
  await ctx.close();
}

// 2. En la primera ronda no se ve nada: las etiquetas son ciegas.
console.log('\n== primera ronda (paquete sin devolver) ==');
{
  const { ctx, page } = await session('davij31492@duidir.com', 't_muc2pb6v_cckh');
  await page.goto(`${BASE}/etiquetar`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const pkg = (await page.locator('.et-head').innerText().catch(() => '?')).replace(/\s+/g, ' ').slice(0, 90);
  console.log('cabecera:', pkg);
  console.log('aviso de equipo:', await page.locator('[data-testid=team-comparison]').count(),
    '· cintas:', await page.locator('[data-testid=discrepancy-detail]').count(),
    '· pastillas:', await page.locator('[data-testid=discrepancy-pill]').count());
  await ctx.close();
}

await browser.close();
