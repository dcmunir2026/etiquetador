'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ingestCorpus } from '@/app/actions/workflow';
import { columnLetter, guessMapping, parseDelimited, type ParsedTable } from '@/lib/csv';
import { Kpi, ago, num } from './shared';

type Upload = {
  id: string; filename: string; sheetName: string | null; rowCount: number;
  uniqueCount: number; duplicateCount: number; avgTokens: number;
  fragmentablePct: number; status: string; createdAt: Date;
};
type Config = { id: string; name: string; unit: string; maxChunkSize: number; overlap: number };

/** Corpus entry point (H1): parse, map columns, dedupe and segment. */
export function UploadView({
  projectId, uploads, configs,
}: {
  projectId: string; uploads: Upload[]; configs: Config[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState({ answer: -1, conversationId: -1, question: -1 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function onFile(f: File) {
    setError(null); setNotice(null); setTable(null); setFile(f);

    if (/\.(xlsx|xls)$/i.test(f.name)) {
      setError(
        'Los archivos .xlsx todavía no se pueden leer: falta decidir el parser de Excel ' +
        '(SheetJS vs exceljs, pendiente en docs/DECISIONS.md). Exporta la hoja a CSV y vuelve a intentarlo.',
      );
      setFile(null);
      return;
    }

    const text = await f.text();
    const parsed = parseDelimited(text);
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      setError('No se han encontrado filas utilizables en el archivo.');
      setFile(null);
      return;
    }
    setTable(parsed);
    setMapping(guessMapping(parsed.headers));
  }

  // Preview stats, computed the same way the server will.
  const stats = (() => {
    if (!table || mapping.answer < 0) return null;
    const seen = new Set<string>();
    let duplicates = 0;
    let chars = 0;
    let usable = 0;
    for (const r of table.rows) {
      const answer = (r[mapping.answer] ?? '').trim();
      if (!answer) continue;
      const key = mapping.conversationId >= 0 ? (r[mapping.conversationId] ?? '').trim() : '';
      if (key) {
        if (seen.has(key)) { duplicates++; continue; }
        seen.add(key);
      }
      usable++;
      chars += answer.length;
    }
    return { total: table.rows.length, usable, duplicates, avgTokens: usable ? Math.round(chars / usable / 4) : 0 };
  })();

  async function ingest() {
    if (!table || !file || mapping.answer < 0) return;
    setBusy(true); setError(null); setNotice(null);

    const rows = table.rows.map((r) => ({
      answer: (r[mapping.answer] ?? '').trim(),
      conversationId: mapping.conversationId >= 0 ? (r[mapping.conversationId] ?? '').trim() : undefined,
      question: mapping.question >= 0 ? (r[mapping.question] ?? '').trim() : undefined,
    })).filter((r) => r.answer);

    const res = await ingestCorpus({
      projectId, filename: file.name, sizeBytes: file.size,
      columnMapping: {
        answer: mapping.answer >= 0 ? columnLetter(mapping.answer) : null,
        conversationId: mapping.conversationId >= 0 ? columnLetter(mapping.conversationId) : null,
        question: mapping.question >= 0 ? columnLetter(mapping.question) : null,
      },
      rows,
    });

    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setNotice('Corpus cargado y segmentado.');
    setFile(null); setTable(null);
    router.refresh();
  }

  const cfg = configs[0];

  return (
    <div className="page">
      <h1>Cargar corpus</h1>
      <p className="lead">
        Punto de entrada del corpus. Se trabaja siempre sobre una copia interna: el archivo original
        no se modifica. Al cargar, el texto se parte en fragmentos usando la configuración de
        segmentación del proyecto.
      </p>

      <div className="grid g-2">
        <div className="card">
          <h3>Archivo</h3>
          <div className="drop" onClick={() => inputRef.current?.click()}
               onDragOver={(e) => e.preventDefault()}
               onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}>
            <svg className="ic-big" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <h4>Suelta el archivo aquí</h4>
            <p>o haz clic para seleccionar — CSV o TSV</p>
            <button className="btn" type="button">Seleccionar archivo</button>
          </div>
          <input ref={inputRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" style={{ display: 'none' }}
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />

          {file && table && (
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <svg style={{ color: 'var(--ok)' }} className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <div>
                  <b>{file.name}</b><br />
                  <small style={{ color: 'var(--ink-3)' }}>
                    {(file.size / 1024 / 1024).toFixed(1)} MB · {num(table.rows.length)} filas · {table.headers.length} columnas
                  </small>
                </div>
              </div>
              <button className="btn ghost" style={{ color: 'var(--bad)' }}
                      onClick={() => { setFile(null); setTable(null); }}>Quitar</button>
            </div>
          )}

          {error && (
            <div style={{ marginTop: 14, padding: '11px 13px', background: '#fbe6e6',
                          borderLeft: '3px solid var(--bad)', borderRadius: '0 7px 7px 0',
                          fontSize: 12.5, color: '#5a2222' }}>{error}</div>
          )}
          {notice && (
            <div style={{ marginTop: 14, padding: '11px 13px', background: '#e6f4ec',
                          borderLeft: '3px solid var(--ok)', borderRadius: '0 7px 7px 0',
                          fontSize: 12.5, color: '#1c6e3a' }}>{notice}</div>
          )}
        </div>

        <div className="card">
          <h3>
            Selección de columnas
            {table && <span className="count">{table.headers.length} detectadas</span>}
          </h3>
          {!table ? (
            <div className="empty-state" style={{ margin: 0 }}>
              <h4>Sin archivo</h4>
              Carga un CSV para mapear sus columnas.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ColumnPicker label="Columna principal (pivote)" hint="El texto que se va a etiquetar."
                            headers={table.headers} value={mapping.answer}
                            onChange={(v) => setMapping({ ...mapping, answer: v })} required />
              <ColumnPicker label="Identificador de pregunta" hint="Se usa para detectar duplicados."
                            headers={table.headers} value={mapping.conversationId}
                            onChange={(v) => setMapping({ ...mapping, conversationId: v })} />
              <ColumnPicker label="Pregunta original" hint="Se muestra como contexto al anotar."
                            headers={table.headers} value={mapping.question}
                            onChange={(v) => setMapping({ ...mapping, question: v })} />
            </div>
          )}

          {stats && stats.duplicates > 0 && (
            <div style={{ marginTop: 16, padding: '11px 13px', background: '#fdf6e3',
                          borderLeft: '3px solid var(--warn)', borderRadius: '0 7px 7px 0',
                          fontSize: 12.5, color: '#5a4400' }}>
              <b>Detección de duplicados:</b> {stats.duplicates} filas repiten el identificador y se
              descartarán al cargar.
            </div>
          )}
        </div>
      </div>

      {stats && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Resultado del pre-procesado <span className="count">{num(stats.usable)} filas únicas</span></h3>
          <div className="grid g-4">
            <Kpi label="Filas totales" value={num(stats.total)} />
            <Kpi label="Únicas tras dedupe" value={num(stats.usable)} />
            <Kpi label="Duplicados" value={num(stats.duplicates)} />
            <Kpi label="Tokens medios" value={stats.avgTokens} />
          </div>
          <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--ink-3)' }}>
            Se segmentará con <b>{cfg?.name ?? 'la configuración por defecto'}</b>
            {cfg && <> — {cfg.unit}, máx. {cfg.maxChunkSize}, overlap {cfg.overlap}</>}.{' '}
            <a href="/proyecto/segmentacion" style={{ color: 'var(--primary-2)' }}>Cambiar segmentación</a>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button className="btn" onClick={() => { setFile(null); setTable(null); }}>Cancelar</button>
            <button className="btn primary" onClick={ingest} disabled={busy || mapping.answer < 0}>
              {busy ? 'Cargando…' : 'Cargar y segmentar →'}
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Cargas anteriores <span className="count">{uploads.length}</span></h3>
        <table>
          <thead>
            <tr><th>Archivo</th><th>Filas</th><th>Únicas</th><th>Duplicados</th>
                <th>Tokens medios</th><th>% fragmentado</th><th>Fecha</th></tr>
          </thead>
          <tbody>
            {uploads.map((u) => (
              <tr key={u.id}>
                <td><b>{u.filename}</b>{u.sheetName && <><br /><small style={{ color: 'var(--ink-3)' }}>hoja «{u.sheetName}»</small></>}</td>
                <td>{num(u.rowCount)}</td>
                <td>{num(u.uniqueCount)}</td>
                <td>{num(u.duplicateCount)}</td>
                <td>{u.avgTokens}</td>
                <td>{u.fragmentablePct}%</td>
                <td><small style={{ color: 'var(--ink-3)' }}>{ago(u.createdAt)}</small></td>
              </tr>
            ))}
            {uploads.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>
                Todavía no se ha cargado ningún corpus.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ColumnPicker({ label, hint, headers, value, onChange, required }: {
  label: string; hint: string; headers: string[]; value: number;
  onChange: (v: number) => void; required?: boolean;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                    background: 'var(--surface-2)', borderRadius: 7, border: '1px solid var(--line)' }}>
      <span style={{ flex: 1 }}>
        <b>{label}{required && <span style={{ color: '#c0392b' }}> *</span>}</b><br />
        <small style={{ color: 'var(--ink-3)' }}>{hint}</small>
      </span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}
              style={{ padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 6,
                       fontSize: 12.5, background: 'var(--surface)', maxWidth: 200 }}>
        <option value={-1}>— ninguna —</option>
        {headers.map((h, i) => (
          <option key={`${h}-${i}`} value={i}>{columnLetter(i)} · {h || '(sin título)'}</option>
        ))}
      </select>
    </label>
  );
}
