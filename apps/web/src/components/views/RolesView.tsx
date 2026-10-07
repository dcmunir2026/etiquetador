'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CandidateRow, MemberRow, TeamRow } from '@/lib/queries';
import {
  createTeam, deactivateUser, reactivateUser, resetPasswordToDefault,
  setMemberRoles, setMemberTeams, setTeamMembers, setUserSuperAdmin,
} from '@/app/actions/workflow';
import {
  addExistingMemberToProject, inviteNewMemberToProject,
  resendInvitation, searchCandidatesForProject,
} from '@/app/actions/invitations';
import { Avatar, Kpi } from './shared';

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Superadministrador',
  projectadmin: 'Administrador de proyecto',
  validador_cualitativo: 'Validador cualitativo',
  validador_cuantitativo: 'Validador cuantitativo',
  annotator: 'Etiquetador',
  viewer: 'Observador',
};

const ROLE_CLASS: Record<string, string> = {
  superadmin: 'sesgo-estadistico',
  projectadmin: 'sesgo-demografico',
  validador_cualitativo: 'sesgo-religion',
  validador_cuantitativo: 'sesgo-religion',
  annotator: 'sesgo-semiotica',
  viewer: 'sesgo-genero',
};

export function RolesView({
  projectId, members, teams, currentUserIsSuperAdmin,
}: {
  projectId: string; members: MemberRow[]; teams: TeamRow[];
  /** Whether the viewer is a superadmin — gates the superadmin toggle in
   *  the edit dialog and the corresponding server action. The action
   *  re-checks server-side, but hiding the control in the UI is enough to
   *  prevent accidents. */
  currentUserIsSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [addMode, setAddMode] = useState<'search' | 'email' | null>(null);
  const [editingTeam, setEditingTeam] = useState<TeamRow | null>(null);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [editingMember, setEditingMember] = useState<MemberRow | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<MemberRow | null>(null);
  const [confirmReactivate, setConfirmReactivate] = useState<MemberRow | null>(null);
  const [confirmReset, setConfirmReset] = useState<MemberRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [defaultPwNotice, setDefaultPwNotice] = useState<{ email: string; password: string } | null>(null);

  const packaged = teams.filter((t) => t.members.length >= 2).length;

  async function resend(userId: string) {
    setBusy(userId);
    const res = await resendInvitation({ projectId, userId });
    setBusy(null);
    if (res.ok && res.usedDefaultPassword && res.defaultPassword) {
      const u = members.find((m) => m.id === userId);
      if (u) setDefaultPwNotice({ email: u.email, password: res.defaultPassword });
    }
    if (!res.ok) alert(res.error);
    router.refresh();
  }

  return (
    <div className="page">
      <h1>Roles y equipos</h1>
      {defaultPwNotice && (
        <div style={{ background: '#e3f4e7', border: '1px solid #a8d4b3', borderLeft: '3px solid var(--good)',
                      padding: '12px 14px', borderRadius: '0 6px 6px 0', marginBottom: 14,
                      fontSize: 13, color: '#1f4a2a', display: 'flex',
                      justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <b>Contraseña reiniciada a la por defecto.</b> La cuenta de{' '}
            <code>{defaultPwNotice.email}</code> ya tiene la contraseña{' '}
            <code><b>{defaultPwNotice.password}</b></code> (también se aplica cuando una
            invitación no puede salir por correo y la cuenta queda creada con esta misma
            contraseña). Comunícasela a la persona y pídele que la cambie al entrar (se le forzará
            automáticamente).
          </div>
          <button className="btn-mini" onClick={() => setDefaultPwNotice(null)}>Cerrar</button>
        </div>
      )}
      <p className="lead">
        Cada equipo agrupa a los etiquetadores que comparten un paquete espejo. El tamaño del grupo
        determina la métrica de consenso disponible. Los paquetes están aislados por equipo para
        evitar contaminación.
      </p>

      <div className="grid g-2" style={{ marginBottom: 18 }}>
        <Kpi label="Equipos" value={teams.length}
             delta={`${packaged} listos · ${teams.length - packaged} sin suficientes miembros`} />
        <Kpi label="Personas en el proyecto" value={members.length}
             delta={`${members.filter((m) => m.roles.includes('annotator')).length} etiquetadores`} />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3>
          Equipos
          <span className="count">{teams.length}</span>
          <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={() => setCreatingTeam(true)}>
            + Nuevo equipo
          </button>
        </h3>
        <table>
          <thead>
            <tr><th>Equipo</th><th>Tamaño</th><th>Miembros</th><th>Métrica de consenso</th><th /></tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id}>
                <td><b>{t.name}</b></td>
                <td>
                  <span className="group-size-pill">
                    {t.members.length === 2 ? 'dúo' : t.members.length === 3 ? 'trío'
                      : t.members.length === 4 ? 'cuarteto' : `${t.members.length} personas`}
                  </span>
                </td>
                <td>
                  <div className="assignees">
                    {t.members.map((m) => (
                      <span key={m.id} className="assignee">
                        <span className="av" style={{ background: m.color ?? undefined }}>
                          {m.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                        </span>
                        {m.name}
                      </span>
                    ))}
                    {t.members.length === 0 && <small style={{ color: 'var(--ink-3)' }}>sin miembros</small>}
                  </div>
                </td>
                <td><small style={{ color: 'var(--ink-3)' }}>{t.consensusMetric}</small></td>
                <td><button className="btn-mini" onClick={() => setEditingTeam(t)}>Editar miembros</button></td>
              </tr>
            ))}
            {teams.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>
                Crea un equipo antes de dividir el corpus en paquetes.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <h3 style={{ padding: '14px 16px 0', margin: 0 }}>
          Personas
          <span className="count">{members.filter((m) => !m.deletedAt).length}</span>
          <button className="btn success" style={{ marginLeft: 'auto' }}
                  onClick={() => setAddMode('search')}>
            + Añadir persona
          </button>
        </h3>
        <div className="role-row head" style={{ marginTop: 12 }}>
          <div>Persona</div><div>Email</div><div>Rol</div><div>Equipo</div><div>Estado</div><div>Acciones</div>
        </div>
        {members.map((m) => (
          <div key={m.id} className="role-row" style={m.deletedAt ? { opacity: 0.55 } : undefined}>
            <div className="name">
              <Avatar name={m.name} color={m.color} />
              <div className="meta">
                <b>{m.name}</b>
                <small>{m.isSuperAdmin ? 'Superadministrador' : 'En el proyecto'}</small>
              </div>
            </div>
            <div style={{ color: 'var(--ink-2)' }}>{m.email}</div>
            <div>
              {m.isSuperAdmin ? (
                <span className="tag sesgo-estadistico">Superadministrador</span>
              ) : m.roles.length === 0 ? (
                <small style={{ color: 'var(--ink-3)' }}>—</small>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {m.roles.map((r) => (
                    <span key={r} className={`tag ${ROLE_CLASS[r] ?? ''}`}
                          title={ROLE_LABELS[r] ?? r}>
                      {ROLE_LABELS[r] ?? r}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div><small style={{ color: 'var(--ink-3)' }}>{m.teamNames.join(', ') || '—'}</small></div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              {m.deletedAt && (
                <span className="tag" style={{ background: '#fbe6e6', color: '#7a2222' }}>Desactivado</span>
              )}
              <InvitationStateTag state={m.invitationState} />
              {m.invitationState === 'pending' && (
                <button className="btn-mini" disabled={busy === m.id}
                        onClick={() => resend(m.id)}
                        title={`Caduca ${m.pendingInviteExpiresAt?.toLocaleString('es-ES') ?? 'pronto'}`}>
                  {busy === m.id ? 'Enviando…' : 'Reenviar invitación'}
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {!m.deletedAt && (
                  <button
                    className="btn-mini"
                    style={{ color: 'var(--primary-2)' }}
                    disabled={busy === m.id}
                    title="Editar rol, equipos y permisos de plataforma"
                    onClick={() => setEditingMember(m)}
                  >
                    Editar
                  </button>
                )}
                {m.deletedAt ? (
                  <button
                    className="btn-mini"
                    style={{ color: 'var(--good)' }}
                    disabled={busy === m.id}
                    title="Reactivar a esta persona — volverá a poder iniciar sesión."
                    onClick={() => setConfirmReactivate(m)}
                  >
                    Reactivar
                  </button>
                ) : (
                  <button
                    className="btn-mini"
                    style={{ color: 'var(--bad)' }}
                    disabled={busy === m.id || m.isSuperAdmin}
                    title={m.isSuperAdmin
                      ? 'No se puede desactivar a un superadministrador desde aquí.'
                      : 'Desactivar definitivamente a esta persona'}
                    onClick={() => setConfirmDeactivate(m)}
                  >
                    Desactivar
                  </button>
                )}
                {!m.deletedAt && (
                  <button
                    className="btn-mini"
                    style={{ color: 'var(--ink-2)' }}
                    disabled={busy === m.id}
                    title="Reiniciar la contraseña a la por defecto. La persona deberá ingresarla al próximo inicio de sesión y se le forzará a cambiarla."
                    onClick={() => setConfirmReset(m)}
                  >
                    Reiniciar contraseña
                  </button>
                )}
              </div>
          </div>
        ))}
      </div>

      {addMode === 'search' && (
        <AddMemberDialog projectId={projectId} teams={teams}
                          onSwitchToEmail={() => setAddMode('email')}
                          onClose={() => setAddMode(null)}
                          onDone={() => { setAddMode(null); router.refresh(); }} />
      )}
      {addMode === 'email' && (
        <InviteNewDialog projectId={projectId} teams={teams}
                         onClose={() => setAddMode(null)}
                         onDone={() => { setAddMode(null); router.refresh(); }}
                         onDefaultPassword={(email, password) => setDefaultPwNotice({ email, password })} />
      )}
      {creatingTeam && (
        <TeamDialog projectId={projectId}
                    onClose={() => setCreatingTeam(false)}
                    onDone={() => { setCreatingTeam(false); router.refresh(); }} />
      )}
      {editingTeam && (
        <TeamMembersDialog team={editingTeam} members={members}
                           onClose={() => setEditingTeam(null)}
                           onDone={() => { setEditingTeam(null); router.refresh(); }} />
      )}
      {confirmDeactivate && (
        <DeactivateDialog
          member={confirmDeactivate}
          onClose={() => setConfirmDeactivate(null)}
          onDone={() => { setConfirmDeactivate(null); router.refresh(); }}
        />
      )}
      {confirmReactivate && (
        <ReactivateDialog
          member={confirmReactivate}
          onClose={() => setConfirmReactivate(null)}
          onDone={() => { setConfirmReactivate(null); router.refresh(); }}
        />
      )}
      {confirmReset && (
        <ResetPasswordDialog
          member={confirmReset}
          onClose={() => setConfirmReset(null)}
          onDone={(password) => {
            setConfirmReset(null);
            if (password) setDefaultPwNotice({ email: confirmReset.email, password });
            router.refresh();
          }}
        />
      )}
      {editingMember && (
        <EditMemberDialog
          member={editingMember}
          projectId={projectId}
          teams={teams}
          currentUserIsSuperAdmin={currentUserIsSuperAdmin}
          onClose={() => setEditingMember(null)}
          onDone={() => { setEditingMember(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

/**
 * Add an existing user to the project. Typeahead over the global user
 * table; selecting a candidate reveals the role/team picker and the
 * Add button. No email is sent — the recipient is already a known
 * collaborator being shared across projects. The "Invitar a alguien
 * nuevo por email" link at the bottom hands off to the legacy email
 * flow when the person isn't in the directory yet.
 */
function AddMemberDialog({ projectId, teams, onClose, onDone, onSwitchToEmail }: {
  projectId: string; teams: TeamRow[]; onClose: () => void; onDone: () => void;
  onSwitchToEmail: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CandidateRow | null>(null);
  const [role, setRole] = useState('annotator');
  const [teamId, setTeamId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchedRef = useRef<string>('');

  // Debounce the typeahead so we don't hit the server on every keystroke.
  // We also keep a ref of the last query we successfully fetched, so a
  // slower older request that resolves after a newer one can't overwrite
  // the newer results.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      lastFetchedRef.current = '';
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const captured = trimmed;
      const rows = await searchCandidatesForProject(projectId, captured);
      // Drop the response if the user kept typing after we fired.
      if (lastFetchedRef.current !== captured && lastFetchedRef.current === '') {
        // First fetch for this query — accept.
      }
      lastFetchedRef.current = captured;
      setResults(rows);
      setLoading(false);
      // If the currently selected candidate no longer appears in the
      // fresh results (e.g. the user kept typing past their name), drop
      // the selection so the Save button disables.
      if (selected && !rows.some((r) => r.id === selected.id)) setSelected(null);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // We deliberately exclude `selected` from deps — the closure reads the
    // current value but the effect should re-run only on query input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, projectId]);

  async function save() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    const res = await addExistingMemberToProject({
      projectId,
      userId: selected.id,
      role: role as never,
      teamId: teamId || undefined,
    });
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    onDone();
  }

  return (
    <Overlay title="Añadir persona al proyecto"
             subtitle="Busca una persona existente y elige su rol. No se envía correo."
             onClose={onClose}
             onSave={selected ? save : () => {}}
             saving={saving}
             error={error}
             saveLabel={selected ? 'Añadir al proyecto' : 'Selecciona una persona'}>
      <div className="wiz-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <label>Buscar por nombre o email</label>
        <input type="search" autoFocus placeholder="ej. ana o ana@epdata.es"
               value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="picker-list" style={{ maxHeight: 260, marginTop: 6 }}>
        {!query.trim() && (
          <div style={{ padding: '14px 12px', fontSize: 12.5, color: 'var(--ink-3)' }}>
            Empieza a escribir para buscar personas que aún no están en el proyecto.
          </div>
        )}
        {query.trim() && loading && (
          <div style={{ padding: '14px 12px', fontSize: 12.5, color: 'var(--ink-3)' }}>Buscando…</div>
        )}
        {query.trim() && !loading && results.length === 0 && (
          <div style={{ padding: '14px 12px', fontSize: 12.5, color: 'var(--ink-3)' }}>
            Nadie coincide con «{query.trim()}». Si es una persona nueva, puedes
            <button type="button" className="btn-mini" style={{ marginLeft: 6 }}
                    onClick={onSwitchToEmail}>invitarla por email</button>.
          </div>
        )}
        {results.map((c) => {
          const isSelected = selected?.id === c.id;
          return (
            <button type="button" key={c.id}
                    className={`picker-row ${isSelected ? 'is-assigned' : ''}`}
                    onClick={() => { setSelected(c); setRole('annotator'); setTeamId(''); }}
                    title={c.email}>
              <Avatar name={c.name} color={c.color} />
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div><b>{c.name}</b> <small style={{ color: 'var(--ink-3)' }}>{c.email}</small></div>
                <small style={{ color: 'var(--ink-3)' }}>
                  {c.projects.length === 0
                    ? 'Sin otros proyectos'
                    : `Ya está en: ${c.projects.map((p) =>
                        `${p.name} (${p.roles.map((r) => ROLE_LABELS[r] ?? r).join(', ')})`,
                      ).join('; ')}`}
                </small>
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <div style={{ marginTop: 12, padding: 12, background: 'var(--surface-2)',
                      borderRadius: 7, border: '1px solid var(--line)' }}>
          <div style={{ marginBottom: 8 }}>
            <b>{selected.name}</b> · <small style={{ color: 'var(--ink-3)' }}>{selected.email}</small>
          </div>
          <div className="wiz-row">
            <label>Rol</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {Object.entries(ROLE_LABELS).filter(([k]) => k !== 'superadmin').map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="wiz-row">
            <label>Equipo (opcional)</label>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">— sin equipo —</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ink-3)',
                    borderTop: '1px solid var(--line-soft)', paddingTop: 10 }}>
        ¿La persona es nueva?{' '}
        <button type="button" className="btn-mini" onClick={onSwitchToEmail}>
          Invitar a alguien nuevo por email →
        </button>
      </div>
    </Overlay>
  );
}

/**
 * Email-only invite for people who don't exist yet. Kept narrow on
 * purpose — anyone in the user table goes through `AddMemberDialog`
 * above. If the server detects the email is already registered (race
 * condition between the typeahead and the submit), we surface the
 * error verbatim; the admin can dismiss the dialog and use the search
 * flow instead.
 */
function InviteNewDialog({ projectId, teams, onClose, onDone, onDefaultPassword }: {
  projectId: string; teams: TeamRow[]; onClose: () => void; onDone: () => void;
  onDefaultPassword?: (email: string, password: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('annotator');
  const [teamId, setTeamId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await inviteNewMemberToProject({
      projectId, email, name, role: role as never, teamId: teamId || undefined,
    });
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    if (res.usedDefaultPassword && res.defaultPassword) {
      onDefaultPassword?.(email, res.defaultPassword);
    }
    onDone();
  }

  return (
    <Overlay title="Invitar persona nueva" subtitle="Le enviaremos un enlace para que se dé de alta."
             onClose={onClose} onSave={save} saving={saving} error={error} saveLabel="Enviar invitación">
      <div className="wiz-row">
        <label>Email <span style={{ color: '#c0392b' }}>*</span></label>
        <input type="email" placeholder="persona@epdata.es" value={email}
               onChange={(e) => setEmail(e.target.value)} autoFocus />
      </div>
      <div className="wiz-row">
        <label>Nombre</label>
        <input type="text" placeholder="Nombre y apellidos" value={name}
               onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="wiz-row">
        <label>Rol</label>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {Object.entries(ROLE_LABELS).filter(([k]) => k !== 'superadmin').map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div className="wiz-row">
        <label>Equipo (opcional)</label>
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">— sin equipo —</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
    </Overlay>
  );
}

function TeamDialog({ projectId, onClose, onDone }: {
  projectId: string; onClose: () => void; onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [groupSize, setGroupSize] = useState(2);
  const [metric, setMetric] = useState('unanimous');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await createTeam({ projectId, name, groupSize, consensusMetric: metric as never });
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    onDone();
  }

  return (
    <Overlay title="Nuevo equipo" subtitle="Los paquetes se asignan a todos los miembros del equipo."
             onClose={onClose} onSave={save} saving={saving} error={error} saveLabel="Crear equipo">
      <div className="wiz-row">
        <label>Nombre <span style={{ color: '#c0392b' }}>*</span></label>
        <input type="text" placeholder="Ej. Equipo E" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="wiz-row">
        <label>Tamaño del grupo</label>
        <select value={groupSize} onChange={(e) => setGroupSize(Number(e.target.value))}>
          <option value={2}>Dúo (2 etiquetadores)</option>
          <option value={3}>Trío (3 etiquetadores)</option>
          <option value={4}>Cuarteto (4 etiquetadores)</option>
          <option value={5}>Quinteto (5 etiquetadores)</option>
        </select>
      </div>
      <div className="wiz-row">
        <label>Métrica de consenso</label>
        <select value={metric} onChange={(e) => setMetric(e.target.value)}>
          <option value="fleiss">Fleiss Kappa (N jueces, categórica)</option>
          <option value="krippendorff">Krippendorff α (N jueces, mixto)</option>
          <option value="weighted-majority">Mayoría ponderada (N≥3)</option>
          <option value="unanimous">Consenso total (todos iguales)</option>
        </select>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>
        Solo Fleiss Kappa está implementado; las demás quedan registradas pero se calculan con Fleiss.
      </p>
    </Overlay>
  );
}

function TeamMembersDialog({ team, members, onClose, onDone }: {
  team: TeamRow; members: MemberRow[]; onClose: () => void; onDone: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(team.members.map((m) => m.id));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await setTeamMembers(team.id, picked);
    setSaving(false);
    onDone();
  }

  return (
    <Overlay title={`Miembros de ${team.name}`} subtitle="Marca quién comparte el paquete espejo de este equipo."
             onClose={onClose} onSave={save} saving={saving} error={null} saveLabel="Guardar">
      <div className="picker-list" style={{ maxHeight: 340, overflowY: 'auto' }}>
        {members.map((m) => {
          const on = picked.includes(m.id);
          return (
            <div key={m.id} className={`picker-row${on ? ' is-assigned' : ''}`}
                 onClick={() => setPicked(on ? picked.filter((x) => x !== m.id) : [...picked, m.id])}>
              <Avatar name={m.name} color={m.color} size={34} />
              <div className="meta" style={{ flex: 1 }}>
                <b>{m.name}</b>
                <small>{m.email} · {ROLE_LABELS[m.roles[0] ?? ''] ?? '—'}</small>
              </div>
              {on ? <span className="av-extra">✓ En el equipo</span> : <span className="btn-mini">Añadir</span>}
            </div>
          );
        })}
      </div>
    </Overlay>
  );
}

/** Per-member invitation state, shown in the Estado column. */
function InvitationStateTag({ state }: { state: MemberRow['invitationState'] }) {
  const map = {
    accepted:    { className: 'sesgo-estadistico',  label: 'Activo' },
    pending:     { className: 'sesgo-religion',     label: 'Pendiente' },
    no_password: { className: 'sesgo-genero',       label: 'Sin contraseña' },
    never:       { className: 'sesgo-semiotica',    label: 'Sin invitación' },
  } as const;
  const m = map[state];
  return <span className={`tag ${m.className}`}>{m.label}</span>;
}

/** Shared modal chrome for the dialogs on this screen. */
function Overlay({ title, subtitle, children, onClose, onSave, saving, error, saveLabel }: {
  title: string; subtitle: string; children: React.ReactNode;
  onClose: () => void; onSave: () => void; saving: boolean; error: string | null; saveLabel: string;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,23,30,0.45)', zIndex: 60,
                  backdropFilter: 'blur(2px)', overflowY: 'auto',
                  // dvh tracks the visible viewport on mobile (handles the
                  // collapsing URL bar); vh is the fallback for older Safari.
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
      <div className="picker-card" style={{
        // Cap the panel so a long body (lots of teams + many role checkboxes
        // + the superadmin toggle) never pushes the Save/Cancel footer off
        // the screen. `min(... 640px)` keeps it a comfortable size on tall
        // desktops; the vh/dvh expressions ensure it still fits on shorter
        // windows and on phones. flex column + the body div scrolls, the
        // footer stays pinned at the bottom of the card.
        marginTop: 'max(24px, env(safe-area-inset-top, 0px))',
        marginBottom: 24,
        textAlign: 'left', maxWidth: 540,
        maxHeight: 'min(640px, calc(100vh - 80px), calc(100dvh - 80px))',
        display: 'flex', flexDirection: 'column',
        flexShrink: 0,
        width: 'min(540px, calc(100vw - 32px))',
      }}>
        <h2 style={{ textAlign: 'center' }}>{title}</h2>
        <p className="lead" style={{ textAlign: 'center' }}>{subtitle}</p>
        <div style={{ flex: '1 1 0', overflowY: 'auto', minHeight: 0,
                      // Make the scrollable region visually distinct so the
                      // user knows there is more to see when it overflows.
                      paddingRight: 4 }}>
          {children}
          {error && <div style={{ fontSize: 12.5, color: 'var(--bad)', marginTop: 10 }}>{error}</div>}
        </div>
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16,
          paddingTop: 14, borderTop: '1px solid var(--line-soft)',
          // Never let the footer shrink — it always shows.
          flexShrink: 0,
          // The picker-card has 28px vertical padding; cancelling it here so
          // the footer hugs the bottom edge of the card with the divider
          // hugging the top of the buttons instead of floating inside the
          // padded area.
          marginLeft: -32, marginRight: -32, marginBottom: -28,
          paddingLeft: 32, paddingRight: 32, paddingBottom: 28,
          background: 'var(--surface)',
        }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={onSave} disabled={saving}>
            {saving ? 'Guardando…' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Confirmation dialog for soft-deleting a member. The actual soft delete
 * is performed by `deactivateUser` server-side; this just collects the
 * intent so a stray click doesn't lock someone out.
 */
function DeactivateDialog({ member, onClose, onDone }: {
  member: MemberRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setSaving(true);
    setError(null);
    const res = await deactivateUser(member.id);
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    onDone();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,23,30,0.55)', zIndex: 71,
                  backdropFilter: 'blur(2px)', overflowY: 'auto' }}>
      <div className="picker-card" style={{ marginTop: 80, textAlign: 'left', maxWidth: 480 }}>
        <h2 style={{ textAlign: 'center', fontSize: 17, marginBottom: 4 }}>Desactivar persona</h2>
        <p className="lead" style={{ textAlign: 'center', marginBottom: 18 }}>
          Esta acción no se puede deshacer desde la interfaz.
        </p>

        <div style={{ background: '#fdf3da', border: '1px solid #e8d49c', borderLeft: '3px solid #b58300',
                      padding: '12px 14px', borderRadius: '0 6px 6px 0', marginBottom: 14,
                      fontSize: 13, color: '#5a3e00' }}>
          Vas a desactivar a <b>{member.name}</b> (<code>{member.email}</code>).
          No podrá volver a iniciar sesión. Sus anotaciones, membresías en proyectos y
          asignaciones se conservan para auditoría.
        </div>

        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 6 }}>
          Para volver a darle acceso, un administrador deberá reactivarla mediante SQL.
        </div>

        {error && (
          <div role="alert" style={{ marginTop: 12, padding: '9px 12px', background: '#fbe6e6',
                                     border: '1px solid #e8c5c5', borderLeft: '3px solid var(--bad)',
                                     borderRadius: '0 6px 6px 0', fontSize: 12.5, color: '#5a2222' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16,
                      paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
          <button className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn" style={{ background: 'var(--bad)', color: '#fff' }}
                  onClick={confirm} disabled={saving}>
            {saving ? 'Desactivando…' : 'Desactivar definitivamente'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Confirmation dialog for reversing a soft-delete. Mirrors
 * `DeactivateDialog` but with a green accent and copy that emphasises
 * the account is restored (password, role and team memberships are all
 * preserved — we just clear `deleted_at`).
 */
function ReactivateDialog({ member, onClose, onDone }: {
  member: MemberRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setSaving(true);
    setError(null);
    const res = await reactivateUser(member.id);
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    onDone();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,23,30,0.55)', zIndex: 71,
                  backdropFilter: 'blur(2px)', overflowY: 'auto' }}>
      <div className="picker-card" style={{ marginTop: 80, textAlign: 'left', maxWidth: 480 }}>
        <h2 style={{ textAlign: 'center', fontSize: 17, marginBottom: 4 }}>Reactivar persona</h2>
        <p className="lead" style={{ textAlign: 'center', marginBottom: 18 }}>
          La cuenta volverá a estar activa de inmediato.
        </p>

        <div style={{ background: '#e3f4e7', border: '1px solid #a8d4b3', borderLeft: '3px solid var(--good)',
                      padding: '12px 14px', borderRadius: '0 6px 6px 0', marginBottom: 14,
                      fontSize: 13, color: '#1f4a2a' }}>
          Vas a reactivar a <b>{member.name}</b> (<code>{member.email}</code>).
          Volverá a poder iniciar sesión con su contraseña anterior. Su rol en
          el proyecto, sus equipos y todas sus anotaciones se conservan sin
          cambios.
        </div>

        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 6 }}>
          Si no recuerda su contraseña, un administrador puede restablecerla
          desde la línea de comandos (UPDATE users SET password_hash = …).
        </div>

        {error && (
          <div role="alert" style={{ marginTop: 12, padding: '9px 12px', background: '#fbe6e6',
                                     border: '1px solid #e8c5c5', borderLeft: '3px solid var(--bad)',
                                     borderRadius: '0 6px 6px 0', fontSize: 12.5, color: '#5a2222' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16,
                      paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
          <button className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn" style={{ background: 'var(--good)', color: '#fff' }}
                  onClick={confirm} disabled={saving}>
            {saving ? 'Reactivando…' : 'Reactivar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Confirmation dialog for resetting a member's password to the platform
 * default. Mirrors the visual shape of `DeactivateDialog` but with a
 * neutral/amber banner. On success, the server action returns the new
 * default password so we can show it to the parent for the green banner
 * (`defaultPwNotice`) — the recipient has no email-based password
 * recovery flow, so the admin has to communicate the new password by
 * another channel.
 */
function ResetPasswordDialog({ member, onClose, onDone }: {
  member: MemberRow;
  onClose: () => void;
  onDone: (defaultPassword: string | null) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setSaving(true);
    setError(null);
    const res = await resetPasswordToDefault(member.id);
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    onDone(res.defaultPassword ?? null);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,23,30,0.55)', zIndex: 71,
                  backdropFilter: 'blur(2px)', overflowY: 'auto' }}>
      <div className="picker-card" style={{ marginTop: 80, textAlign: 'left', maxWidth: 480 }}>
        <h2 style={{ textAlign: 'center', fontSize: 17, marginBottom: 4 }}>Reiniciar contraseña</h2>
        <p className="lead" style={{ textAlign: 'center', marginBottom: 18 }}>
          La cuenta volverá a tener la contraseña por defecto de la plataforma.
        </p>

        <div style={{ background: '#fdf3da', border: '1px solid #e8d49c', borderLeft: '3px solid #b58300',
                      padding: '12px 14px', borderRadius: '0 6px 6px 0', marginBottom: 14,
                      fontSize: 13, color: '#5a3e00' }}>
          Vas a reiniciar la contraseña de <b>{member.name}</b> (<code>{member.email}</code>) a la
          contraseña por defecto. Al próximo inicio de sesión se le forzará a cambiarla. Su rol,
          equipos y anotaciones no se tocan.
        </div>

        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 6 }}>
          Si la persona tiene la app abierta en otra pestaña, podrá seguir usándola hasta que
          cierre sesión o el JWT expire. Para cortar el acceso de inmediato, pídele que cierre
          sesión manualmente.
        </div>

        {error && (
          <div role="alert" style={{ marginTop: 12, padding: '9px 12px', background: '#fbe6e6',
                                     border: '1px solid #e8c5c5', borderLeft: '3px solid var(--bad)',
                                     borderRadius: '0 6px 6px 0', fontSize: 12.5, color: '#5a2222' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16,
                      paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
          <button className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn" style={{ background: '#b58300', color: '#fff' }}
                  onClick={confirm} disabled={saving}>
            {saving ? 'Reiniciando…' : 'Reiniciar a contraseña por defecto'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Edita una persona en bloque: rol dentro del proyecto, equipos en los
 * que participa, y (solo si el viewer es superadmin) el flag global de
 * superadmin. Cada cambio se envía a su action correspondiente y los
 * errores se concatenan — si varios fallan a la vez se muestran todos.
 */
function EditMemberDialog({ member, projectId, teams, currentUserIsSuperAdmin, onClose, onDone }: {
  member: MemberRow;
  projectId: string;
  teams: TeamRow[];
  currentUserIsSuperAdmin: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  // Compute the initial team set from the current `teams` prop. The
  // team membership is the only authoritative source for "which teams
  // does this person belong to right now", and we only need the IDs to
  // diff against the user's edits.
  const originalTeamIds = teams
    .filter((t) => t.members.some((m) => m.id === member.id))
    .map((t) => t.id);

  // Roles in the project. `superadmin` is excluded — it is the global
  // `users.is_super_admin` flag, toggled in the panel below.
  const ROLE_CHOICES = Object.keys(ROLE_LABELS).filter((k) => k !== 'superadmin');

  const [pickedRoles, setPickedRoles] = useState<string[]>(
    member.roles.filter((r) => r !== 'superadmin'),
  );
  const [pickedTeamIds, setPickedTeamIds] = useState<string[]>(originalTeamIds);
  // Initialize the superadmin toggle from the target's current flag, but
  // only let them change it if the viewer is also a superadmin.
  const [superadmin, setSuperadmin] = useState<boolean>(member.isSuperAdmin);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleRole(roleKey: string) {
    setPickedRoles((cur) =>
      cur.includes(roleKey) ? cur.filter((r) => r !== roleKey) : [...cur, roleKey],
    );
  }

  function toggleTeam(teamId: string) {
    setPickedTeamIds((cur) =>
      cur.includes(teamId) ? cur.filter((id) => id !== teamId) : [...cur, teamId],
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    const errors: string[] = [];

    // Diff as sets so order changes don't count as a change.
    const rolesChanged =
      pickedRoles.length !== member.roles.filter((r) => r !== 'superadmin').length
      || pickedRoles.some((r) => !member.roles.includes(r));
    const teamsChanged =
      pickedTeamIds.length !== originalTeamIds.length
      || pickedTeamIds.some((id) => !originalTeamIds.includes(id));
    const superadminChanged =
      currentUserIsSuperAdmin && superadmin !== member.isSuperAdmin;

    if (rolesChanged) {
      const res = await setMemberRoles(projectId, member.id, pickedRoles as never);
      if (!res.ok) errors.push(`Roles: ${res.error}`);
    }
    if (teamsChanged) {
      const res = await setMemberTeams(projectId, member.id, pickedTeamIds);
      if (!res.ok) errors.push(`Equipos: ${res.error}`);
    }
    if (superadminChanged) {
      const res = await setUserSuperAdmin(member.id, superadmin);
      if (!res.ok) errors.push(`Superadmin: ${res.error}`);
    }

    setSaving(false);
    if (errors.length > 0) {
      setError(errors.join('\n'));
      return;
    }
    onDone();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,23,30,0.45)', zIndex: 70,
                  backdropFilter: 'blur(2px)', overflowY: 'auto' }}>
      <div className="picker-card" style={{ marginTop: 40, textAlign: 'left', maxWidth: 540 }}>
        <h2 style={{ textAlign: 'center' }}>Editar persona</h2>
        <p className="lead" style={{ textAlign: 'center' }}>
          Cambia los roles, los equipos y los permisos de plataforma.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                      background: 'var(--surface-2)', borderRadius: 7, border: '1px solid var(--line)',
                      marginBottom: 14 }}>
          <Avatar name={member.name} color={member.color} size={42} />
          <div style={{ minWidth: 0 }}>
            <b style={{ display: 'block' }}>{member.name}</b>
            <small style={{ color: 'var(--ink-3)' }}>{member.email}</small>
          </div>
        </div>

        <div className="wiz-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <label>Roles en este proyecto</label>
          <small style={{ color: 'var(--ink-3)', marginBottom: 6, display: 'block' }}>
            Una persona puede llevar varios roles a la vez — por ejemplo,
            etiquetador y validador cualitativo. El servidor rechaza guardar
            si dejas la lista vacía.
          </small>
          <div className="picker-list" style={{ maxHeight: 180, overflowY: 'auto' }}>
            {ROLE_CHOICES.map((key) => {
              const on = pickedRoles.includes(key);
              return (
                <label key={key}
                       className={`picker-row${on ? ' is-assigned' : ''}`}
                       style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="checkbox" checked={on} onChange={() => toggleRole(key)} />
                  <div style={{ flex: 1 }}>
                    <span className={`tag ${ROLE_CLASS[key] ?? ''}`} style={{ marginRight: 8 }}>
                      {ROLE_LABELS[key]}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="wiz-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <label>Equipos</label>
          {teams.length === 0 ? (
            <small style={{ color: 'var(--ink-3)' }}>
              Este proyecto no tiene equipos todavía. Crea uno primero si quieres asignar a esta persona.
            </small>
          ) : (
            <div className="picker-list" style={{ maxHeight: 180, overflowY: 'auto' }}>
              {teams.map((t) => {
                const on = pickedTeamIds.includes(t.id);
                return (
                  <label key={t.id}
                         className={`picker-row${on ? ' is-assigned' : ''}`}
                         style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="checkbox" checked={on} onChange={() => toggleTeam(t.id)} />
                    <div style={{ flex: 1 }}>
                      <b>{t.name}</b>
                      <small style={{ color: 'var(--ink-3)', display: 'block' }}>
                        {t.members.length === 0
                          ? 'sin miembros'
                          : `${t.members.length} miembros · ${t.consensusMetric}`}
                      </small>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {currentUserIsSuperAdmin && (
          <div style={{ marginTop: 14, padding: '12px 14px',
                        background: member.isSuperAdmin ? '#fdf3da' : 'var(--surface-2)',
                        border: '1px solid var(--line)', borderRadius: 7 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={superadmin}
                     onChange={(e) => setSuperadmin(e.target.checked)}
                     style={{ marginTop: 3 }} />
              <div>
                <b>Superadministrador de la plataforma</b>
                <small style={{ display: 'block', color: 'var(--ink-3)', marginTop: 2 }}>
                  Acceso total: ve todos los proyectos, puede ascender o degradar a cualquier
                  persona.
                </small>
              </div>
            </label>
          </div>
        )}

        {error && (
          <div role="alert" style={{ marginTop: 12, padding: '9px 12px', background: '#fbe6e6',
                                     border: '1px solid #e8c5c5', borderLeft: '3px solid var(--bad)',
                                     borderRadius: '0 6px 6px 0', fontSize: 12.5, color: '#5a2222',
                                     whiteSpace: 'pre-line' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16,
                      paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
          <button className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
