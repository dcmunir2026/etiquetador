/**
 * GET /api/discrepancias/crudo?packageId=…
 *
 * Streams the XLSX "crudo" (raw labels) of the given mirror package.
 * Auth mirrors what the on-screen discrepancies view allows
 * (canReadForRoles('discrepancias', roles)). Restricted to the Node
 * runtime because exceljs depends on Buffer + zlib + stream.
 */
import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';

import { canReadForRoles } from '@/lib/permissions';
import {
  ACTIVE_PROJECT_COOKIE,
  getCurrentUser,
  getRolesInProject,
} from '@/lib/session';
import { getPackageRawLabels } from '@/lib/queries';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

const SHEET_HEADER_BG = 'FF1F3A5F';
const SHEET_HEADER_FG = 'FFFFFFFF';
const ROW_AGREED_BG = 'FFE8F4EE';

function forbidden(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 403 });
}
function badRequest(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}
function notFound(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 404 });
}

/** Excel forbids `[]:*?/\\` in sheet names and caps them at 31 chars. */
function sheetName(code: string): string {
  const cleaned = code.replace(/[\[\]:*?/\\]/g, '-').trim() || 'paquete';
  return cleaned.slice(0, 31);
}

/** Slug for the filename: letters, digits, dot, dash, underscore only. */
function fileSlug(code: string): string {
  return code.toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'paquete';
}

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function GET(req: Request) {
  // 1. Auth — anyone who can READ the discrepancies screen may download.
  //    The matrix already covers viewer (read), validators + admins
  //    (write). Annotators aren't on this view's matrix so they fall
  //    through to 403 even if they find the URL.
  const user = await getCurrentUser();
  if (!user) return forbidden('Tu sesión ha caducado. Vuelve a entrar.');
  const projectId = cookies().get(ACTIVE_PROJECT_COOKIE)?.value ?? null;
  const roles = await getRolesInProject(user, projectId);
  if (!canReadForRoles('discrepancias', roles)) {
    return forbidden('Tus roles en este proyecto no permiten esta acción.');
  }

  // 2. Parameters.
  const url = new URL(req.url);
  const packageId = url.searchParams.get('packageId');
  if (!packageId) return badRequest('Falta el parámetro packageId.');

  // 3. Data.
  const data = await getPackageRawLabels(packageId);
  if (!data) return notFound('Paquete no encontrado o sin etiquetas.');

  // 4. Workbook.
  const wb = new ExcelJS.Workbook();
  wb.creator = 'etiquetador';
  wb.created = new Date();

  const ws = wb.addWorksheet(sheetName(`Crudo · ${data.packageCode}`));
  const headerRow = ws.getRow(1);
  const annotatorCols = data.annotators.map((a) => ({
    header: a.name || a.userId.slice(0, 8),
    key: `a_${a.userId}`,
    width: Math.max(14, Math.min(28, (a.name || 'anotador').length + 4)),
  }));
  ws.columns = [
    { header: '#', key: 'idx', width: 6 },
    { header: 'ID', key: 'id', width: 22 },
    { header: 'Pregunta', key: 'question', width: 38 },
    { header: 'Fragmento', key: 'text', width: 56 },
    { header: 'Dimensión', key: 'dimension', width: 20 },
    ...annotatorCols,
    { header: 'Consenso', key: 'consensus', width: 18 },
  ];
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: SHEET_HEADER_FG } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SHEET_HEADER_BG } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  headerRow.height = 22;
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  for (const r of data.rows) {
    const row: Record<string, string | number | null> = {
      idx: r.fragmentIndex,
      id: r.displayId ?? '',
      question: r.question ?? '',
      text: r.text,
      dimension: r.dimension,
      consensus: r.consensus ?? '',
    };
    for (const a of data.annotators) {
      // Annotator name is the join key (matches what getPackageRawLabels
      // stores). If a user isn't in this fragment's annotations, render
      // a dash so the column structure stays stable across rows.
      row[`a_${a.userId}`] = r.values[a.name] ?? '—';
    }
    const xlRow = ws.addRow(row);
    if (r.agreed) {
      // Soft green tint across the data cells (skip the index column).
      for (let c = 2; c <= ws.columnCount; c++) {
        const cell = xlRow.getCell(c);
        cell.fill = {
          type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_AGREED_BG },
        };
      }
    }
  }

  // The summary lives in its own sheet, NOT as a trailing row of the data
  // sheet: this file is meant to be pivoted in Excel, and a footer row
  // inside the table would land in the annotator columns (its numbers
  // would be read as one more rating). Keeping the data sheet pure lets
  // the user select A1:H<last> and build a pivot over it directly.
  const agreedCount = data.rows.filter((r) => r.agreed).length;
  const singleVoter = data.rows.filter(
    (r) => Object.values(r.values).filter((v) => v !== '—').length === 1,
  ).length;
  const summary = wb.addWorksheet('Resumen');
  summary.columns = [
    { header: 'Métrica', key: 'k', width: 34 },
    { header: 'Valor', key: 'v', width: 14 },
  ];
  summary.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: SHEET_HEADER_FG } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SHEET_HEADER_BG } };
  });
  summary.addRows([
    { k: 'Paquete', v: data.packageCode },
    { k: 'Celdas (fragmento × dimensión)', v: data.rows.length },
    { k: 'Acuerdo (todos coinciden)', v: agreedCount },
    { k: 'Sin acuerdo', v: data.rows.length - agreedCount },
    { k: 'Sólo un votante (sin consenso)', v: singleVoter },
  ]);

  // 5. Stream.
  const buf = await wb.xlsx.writeBuffer();
  const filename = `crudo-${fileSlug(data.packageCode)}-${ymd(new Date())}.xlsx`;
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
