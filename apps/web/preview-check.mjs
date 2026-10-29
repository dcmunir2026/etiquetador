import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3105';
const HOST = new URL(BASE).hostname;
const PROJECT_ID = 't_muve7a3x_ha4g';        // S2_CSV
const PASSWORD = 'etiquetador';
const ANNOTATOR = 't_muc4afak_byd2';        // Daniel Romero (etiquetador del proyecto)
const PKG = 't_muvgjxht_8s5w';              // PK-A-001 de S2_CSV (devuelto, 2 rondas)
const FOREIGN_PKG = 't_muq64deb_vbuk';      // PK-A-001 pero de OTRO proyecto

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN });

function ok(cond, label, extra = '') {
  console.log(`  ${cond ? '✓' : '✗ FALLO'}  ${label}${extra ? '  → ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
}

async function session(email, { projectId } = {}) {
  const ctx = await browser.newContext();
  if (projectId) {
    await ctx.addCookies([{ name: 'etq_active_project', value: projectId,
      domain: HOST, path: '/', httpOnly: true, sameSite: 'Lax' }]);
  }
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)));
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !new URL(u).pathname.startsWith('/login'), { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
  return { ctx, page };
}

// ------------------------------------------------------- admin (super admin)
console.log('\n== admin (Marta R., admin de proyecto y super admin) en S2_CSV ==');
{
  const { ctx, page } = await session('marta@etiquetador.local', { projectId: PROJECT_ID });

  const nav = await page.locator('aside.side nav button span:first-of-type').allInnerTexts();
  ok(nav.includes('Ver como etiquetador'), 'el menú ofrece "Ver como etiquetador"');

  await page.goto(`${BASE}/etiquetar-vista`, { waitUntil: 'networkidle' });
  ok(await page.getByText('Elige un etiquetador').count() > 0,
    'sin persona seleccionada pide elegir a quién mirar');
  const who = await page.locator('select').nth(0).locator('option').allInnerTexts();
  ok(who.length === 3, 'el selector lista al anotador del proyecto', who.join(' · '));

  await page.locator('select').nth(0).selectOption(ANNOTATOR);
  await page.waitForURL((u) => u.searchParams.get('user') === ANNOTATOR, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  ok(true, 'elegir anotador mueve la URL', decodeURIComponent(page.url()));

  const pkgOpts = await page.locator('select').nth(1).locator('option').allInnerTexts();
  ok(pkgOpts.length >= 1 && pkgOpts.join(' ').includes('PK-A-001'),
    'el paquete ofrece los paquetes de esa persona', pkgOpts.join(' · '));

  await page.locator('select').nth(1).selectOption(PKG);
  await page.waitForURL((u) => u.searchParams.get('pkg') === PKG, { timeout: 15000 });
  await page.waitForLoadState('networkidle');

  const banner = page.locator('[data-testid=preview-banner]');
  ok(await banner.count() === 1, 'aparece el banner de sólo lectura');
  const btext = (await banner.innerText()).replace(/\s+/g, ' ');
  ok(/Sólo lectura/.test(btext) && /Daniel Romero/.test(btext),
    'el banner nombra a la persona y el paquete', btext.slice(0, 140));

  const selected = await page.locator('.opt.selected').count();
  const optsTotal = await page.locator('.opt').count();
  ok(selected > 0, 'se ven las respuestas ya guardadas por el anotador',
    `${selected} de ${optsTotal} opciones marcadas`);
  const notes = await page.locator('textarea.notes').count();
  if (notes > 0) {
    ok(await page.locator('textarea.notes[disabled]').count() === notes,
      'los campos de texto libre están deshabilitados');
  }

  ok(await page.getByRole('button', { name: /^Guardar/ }).count() === 0, 'no hay botón Guardar');
  ok(await page.getByRole('button', { name: /Enviar paquete/ }).count() === 0, 'no hay botón Enviar paquete');
  ok(await page.getByRole('button', { name: /Reenviar paquete/ }).count() === 0, 'no hay botón Reenviar paquete');

  ok(await page.locator('[data-testid=returned-banner]').count() === 1,
    'se ve el aviso de paquete devuelto');
  ok(await page.locator('[data-testid=forced-filter]').count() === 1,
    'se ve la navegación restringida a discrepantes (la que impone el anotador)');
  console.log('     filtro forzado:',
    (await page.locator('[data-testid=forced-filter]').innerText()).replace(/\s+/g, ' ').slice(0, 100));

  const head = (await page.locator('.et-head').innerText()).replace(/\s+/g, ' ');
  ok(/Daniel Romero/.test(head), 'la cabecera nombra al anotador visto', head.slice(0, 120));

  const before = page.url();
  const next = page.getByRole('button', { name: /Siguiente/ });
  ok(await next.isEnabled(), 'el botón Siguiente está disponible');
  await next.click();
  await page.waitForURL((u) => u.searchParams.has('fragment'), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  const u = new URL(page.url());
  ok(u.searchParams.get('user') === ANNOTATOR && u.searchParams.get('pkg') === PKG,
    'al avanzar conserva persona y paquete', decodeURIComponent(page.url()));
  ok(before !== page.url(), 'el fragmento cambió al avanzar');

  await page.goto(`${BASE}/etiquetar-vista?user=${ANNOTATOR}&pkg=${FOREIGN_PKG}`, { waitUntil: 'networkidle' });
  const shownPkg = await page.locator('select').nth(1).inputValue();
  ok(shownPkg === PKG, 'un paquete de otro proyecto no se muestra', `paquete en pantalla: ${shownPkg}`);

  await page.goto(`${BASE}/etiquetar-vista?user=${ANNOTATOR}&pkg=${PKG}&discrep=1`, { waitUntil: 'networkidle' });
  ok(new URL(page.url()).searchParams.get('discrep') === '1', 'el filtro discrep=1 se acepta en la URL');

  await page.goto(`${BASE}/etiquetar-vista?user=${ANNOTATOR}&pkg=${PKG}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/tmp/preview-admin.png' });
  console.log('     captura: /tmp/preview-admin.png');

  await ctx.close();
}

// ------------------------------------------------------------- anotador
console.log('\n== etiquetador (Daniel Romero) ==');
{
  const { ctx, page } = await session('davij31492@duidir.com', { projectId: PROJECT_ID });
  const role = (await page.locator('aside.side .footer .who small').innerText().catch(() => '?')).trim();
  console.log(`     rol: ${role}`);

  await page.goto(`${BASE}/etiquetar-vista`, { waitUntil: 'networkidle' });
  const denied = await page.getByText('No tienes acceso a').count();
  ok(denied > 0, 'el etiquetador NO puede abrir el preview', denied ? 'bloqueado ✓' : '¡PASÓ!');
  const nav = await page.locator('aside.side nav button span:first-of-type').allInnerTexts();
  ok(!nav.includes('Ver como etiquetador'), 'el menú del etiquetador no lo ofrece');
  await ctx.close();
}

await browser.close();
