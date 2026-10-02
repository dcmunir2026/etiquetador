'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ingestCorpus, ingestPrefragmented } from '@/app/actions/workflow';
import { columnLetter, guessMapping, parseDelimited, type ParsedTable } from '@/lib/csv';
import {
  groupPrefragmented, parsePrefragmented, prefragmentedStats,
  type PrefragmentedDoc, type PrefragmentedGroup, type PrefragmentedStats,
} from '@/lib/prefragmented';
import { Kpi, ago, num } from './shared';

type Upload = {
  id: string; filename: string; sheetName: string | null; rowCount: number;
  uniqueCount: number; duplicateCount: number; avgTokens: number;
  fragmentablePct: number; status: string; createdAt: Date;
};
type Config = { id: string; name: string; unit: string; maxChunkSize: number; overlap: number };

/** A pre-fragmented JSON file, parsed and summarised for the preview. */
type JsonCorpus = {
  file: File;
  doc: PrefragmentedDoc;
  groups: PrefragmentedGroup[];
  stats: PrefragmentedStats;
};

/** Corpus entry point (H1): parse, map columns, dedupe and segment. */
export function UploadView({
  projectId, uploads, configs,
}: {
  projectId: string; uploads: Upload[]; configs: Config[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [json, setJson] = useState<JsonCorpus | null>(null);
  const [mapping, setMapping] = useState({ answer: -1, conversationId: -1, question: -1 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function reset() {
    setFile(null); setTable(null); setJson(null);
  }

  async function onFile(f: File) {
    setError(null); setNotice(null); setTable(null); setJson(null); setFile(f);

    if (/\.json$/i.test(f.name)) { await onJsonFile(f); return; }

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

  /** Pre-fragmented corpus: no column mapping and no segmentation to apply. */
  async function onJsonFile(f: File) {
    const parsed = parsePrefragmented(await f.text());
    if (!parsed.ok) { setError(parsed.error); setFile(null); return; }
    const groups = groupPrefragmented(parsed.doc.pieces);
    setJson({ file: f, doc: parsed.doc, groups, stats: prefragmentedStats(parsed.doc.pieces, groups) });
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
    reset();
    router.refresh();
  }

  /** Store the JSON's fragments as they come, without re-cutting them. */
  async function ingestJson() {
    if (!json) return;
    setBusy(true); setError(null); setNotice(null);

    const res = await ingestPrefragmented({
      projectId,
      filename: json.file.name,
      sizeBytes: json.file.size,
      pieces: json.doc.pieces,
      meta: { algoritmo: json.doc.algoritmo, rubrica: json.doc.rubrica },
    });

    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    const n = json.stats.fragments;
    setNotice(n === 1
      ? 'Se ha cargado 1 fragmento sin volver a segmentar.'
      : `Se han cargado ${num(n)} fragmentos sin volver a segmentar.`);
    reset();
    router.refresh();
  }

  const cfg = configs[0];

  return (
    <div className="page">
      <h1>Cargar corpus</h1>
      <p className="lead">
        Punto de entrada del corpus. Se trabaja siempre sobre una copia interna: el archivo original
        no se modifica. Al cargar un CSV, el texto se parte en fragmentos usando la configuración de
        segmentación del proyecto; si el corpus ya viene fragmentado en JSON, los fragmentos se
        guardan tal cual.
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
            <p>o haz clic para seleccionar — CSV, TSV o JSON ya fragmentado</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn" type="button">Seleccionar CSV</button>
              <button className="btn" type="button"
                      onClick={(e) => { e.stopPropagation(); jsonRef.current?.click(); }}>
                <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                Cargar JSON fragmentado
              </button>
            </div>
          </div>
          <input ref={inputRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.json" style={{ display: 'none' }}
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
          <input ref={jsonRef} type="file" accept=".json,application/json" style={{ display: 'none' }}
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />

          {file && (table || json) && (
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <svg style={{ color: 'var(--ok)' }} className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <div>
                  <b>{file.name}</b><br />
                  <small style={{ color: 'var(--ink-3)' }}>
                    {(file.size / 1024 / 1024).toFixed(1)} MB · {table
                      ? <>{num(table.rows.length)} filas · {table.headers.length} columnas</>
                      : <>{num(json!.stats.fragments)} fragmentos · {num(json!.stats.answers)} respuestas</>}
                  </small>
                </div>
              </div>
              <button className="btn ghost" style={{ color: 'var(--bad)' }} onClick={reset}>Quitar</button>
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

        {json ? (
          <div className="card">
            <h3>
              Corpus ya fragmentado
              <span className="count">{num(json.stats.fragments)} fragmentos</span>
            </h3>
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--ink-3)' }}>
              El archivo trae los cortes hechos, así que no hay columnas que mapear ni se aplica la
              configuración de segmentación del proyecto. Los fragmentos se guardan tal cual y se
              agrupan por respuesta para reconstruir el contexto que se muestra al anotar.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {json.groups[0]?.pieces.slice(0, 3).map((piece, i) => (
                <div key={i} style={{ padding: '9px 12px', background: 'var(--surface-2)',
                                      border: '1px solid var(--line)', borderRadius: 7, fontSize: 12.5 }}>
                  <small style={{ color: 'var(--ink-3)' }}>
                    Fragmento {i + 1} · {piece.words} palabras
                    {piece.score !== null && <> · score {piece.score}/5</>}
                    {piece.merged && <> · fusionado</>}
                  </small>
                  <div style={{ marginTop: 3 }}>
                    {piece.text.length > 180 ? `${piece.text.slice(0, 180)}…` : piece.text}
                  </div>
                </div>
              ))}
            </div>
            {json.doc.algoritmo != null && (
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ink-3)' }}>
                Se guardará también el bloque <b>algoritmo</b>
                {json.doc.rubrica != null && <> y <b>rúbrica</b></>} del archivo como procedencia de la carga.
              </div>
            )}
          </div>
        ) : (
          <div className="card">
            <h3>
              Selección de columnas
              {table && <span className="count">{table.headers.length} detectadas</span>}
            </h3>
            {!table ? (
              <div className="empty-state" style={{ margin: 0 }}>
                <h4>Sin archivo</h4>
                Carga un CSV para mapear sus columnas, o un JSON ya fragmentado.
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
        )}
      </div>

      {json && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Resultado del pre-procesado <span className="count">{num(json.stats.answers)} respuestas</span></h3>
          <div className="grid g-4">
            <Kpi label="Fragmentos" value={num(json.stats.fragments)} />
            <Kpi label="Respuestas únicas" value={num(json.stats.answers)} />
            <Kpi label="Respuestas duplicadas" value={num(json.stats.duplicates)} />
            <Kpi label="Palabras medias" value={json.stats.avgWords} />
          </div>
          <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--ink-3)' }}>
            {json.stats.merged === 1
              ? '1 fragmento viene fusionado por el pipeline'
              : `${num(json.stats.merged)} fragmentos vienen fusionados por el pipeline`}
            {json.stats.avgScore !== null && <> · score medio {json.stats.avgScore}/5</>}
            {json.doc.skipped > 0 && <> · {num(json.doc.skipped)} entradas sin texto descartadas</>}.{' '}
            No se aplica la segmentación del proyecto: los cortes ya vienen hechos.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button className="btn" onClick={reset}>Cancelar</button>
            <button className="btn primary" onClick={ingestJson} disabled={busy}>
              {busy ? 'Cargando…' : 'Cargar fragmentos →'}
            </button>
          </div>
        </div>
      )}

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
            <button className="btn" onClick={reset}>Cancelar</button>
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
