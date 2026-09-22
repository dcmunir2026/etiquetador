import { chromium } from '@playwright/test';

const PASSWORD = 'etiquetador';
const PEOPLE = [
  ['Marta R.',        'marta@etiquetador.local',    'superadmin'],
  ['Carlos Antúnez',  'carlos.antunez@epdata.es',   'projectadmin'],
  ['Sara Velasco',    'sara.velasco@unir.es',       'validator'],
  ['Pedro Gómez',     'pedro.gomez@unir.es',        'annotator'],
  ['Rosa Iglesias',   'observador@epdata.es',       'viewer'],
];
// A route each role should NOT reach, to prove the guard fires.
const BLOCKED = {
  superadmin: null,
  projectadmin: '/etiquetar',
  validator: '/proyecto/roles',
  annotator: '/validacion-cuantitativa',
  viewer: '/proyecto/paquetes',
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN });

for (const [name, email, role] of PEOPLE) {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'etq_active_project', value: process.env.PROJECT_ID,
    domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !new URL(u).pathname.startsWith('/login'), { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState('networkidle');

  const landed = new URL(page.url()).pathname;
  const nav = await page.locator('aside.side nav button span:first-of-type').allInnerTexts().catch(() => []);
  const shownRole = (await page.locator('aside.side .footer .who small').innerText().catch(() => '?')).trim();

  let blocked = 'n/a';
  const target = BLOCKED[role];
  if (target) {
    await page.goto(`http://localhost:3000${target}`, { waitUntil: 'networkidle' });
    const denied = await page.getByText('No tienes acceso a').count();
    blocked = denied ? `bloqueado ✓ (${target})` : `¡PASÓ! (${target})`;
  }

  console.log(`\n${name}  ·  ${role}`);
  console.log(`  entra en        : ${landed}`);
  console.log(`  rol mostrado    : ${shownRole}`);
  console.log(`  menú (${String(nav.length).padStart(2)} items): ${nav.join(', ') || '(vacío)'}`);
  console.log(`  ruta prohibida  : ${blocked}`);
  await ctx.close();
}

await browser.close();
