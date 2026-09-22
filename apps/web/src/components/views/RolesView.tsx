'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MemberRow, TeamRow } from '@/lib/queries';
import { createTeam, setMemberRole, setTeamMembers } from '@/app/actions/workflow';
import { inviteMember, resendInvitation } from '@/app/actions/invitations';
import { Avatar, Kpi } from './shared';

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Superadministrador',
  projectadmin: 'Administrador de proyecto',
  annotator: 'Etiquetador',
  validator: 'Validador',
  viewer: 'Observador',
};

const ROLE_CLASS: Record<string, string> = {
  superadmin: 'sesgo-estadistico',
  projectadmin: 'sesgo-demografico',
  annotator: 'sesgo-semiotica',
  validator: 'sesgo-religion',
  viewer: 'sesgo-genero',
};

export function RolesView({
  projectId, members, teams,
}: {
  projectId: string; members: MemberRow[]; teams: TeamRow[];
}) {
  const router = useRouter();
  const [inviting, setInviting] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamRow | null>(null);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const packaged = teams.filter((t) => t.members.length >= 2).length;

  async function changeRole(userId: string, role: string) {
    setBusy(userId);
    await setMemberRole(projectId, userId, role as never);
    setBusy(null);
    router.refresh();
  }

  async function resend(userId: string) {
    setBusy(userId);
    const res = await resendInvitation({ projectId, userId });
    setBusy(null);
    if (!res.ok) alert(res.error);
    router.refresh();
  }

  return (
    <div className="page">
      <h1>Roles y equipos</h1>
      <p className="lead">
        Cada equipo agrupa a los etiquetadores que comparten un paquete espejo. El tamaño del grupo
        determina la métrica de consenso disponible. Los paquetes están aislados por equipo para
        evitar contaminación.
      </p>

      <div className="grid g-2" style={{ marginBottom: 18 }}>
        <Kpi label="Equipos" value={teams.length}
             delta={`${packaged} listos · ${teams.length - packaged} sin suficientes miembros`} />
        <Kpi label="Personas en el proyecto" value={members.length}
             delta={`${members.filter((m) => m.role === 'annotator').length} etiquetadores`} />
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
        <div className="role-row head">
          <div>Persona</div><div>Email</div><div>Rol</div><div>Equipo</div><div>Estado</div>
        </div>
        {members.map((m) => (
          <div key={m.id} className="role-row">
            <div className="name">
              <Avatar name={m.name} color={m.color} />
              <div className="meta">
                <b>{m.name}</b>
                <small>{ROLE_LABELS[m.role] ?? m.role}</small>
              </div>
            </div>
            <div style={{ color: 'var(--ink-2)' }}>{m.email}</div>
            <div>
              {m.isSuperAdmin ? (
                <span className="tag sesgo-estadistico">Superadministrador</span>
              ) : (
                <select value={m.role} disabled={busy === m.id} onChange={(e) => changeRole(m.id, e.target.value)}
                        style={{ padding: '3px 8px', border: '1px solid var(--line)', borderRadius: 6,
                                 fontSize: 12, background: 'var(--surface-2)' }}>
                  {Object.entries(ROLE_LABELS).filter(([k]) => k !== 'superadmin').map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              )}
            </div>
            <div><small style={{ color: 'var(--ink-3)' }}>{m.teamNames.join(', ') || '—'}</small></div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              <InvitationStateTag state={m.invitationState} />
              {m.invitationState === 'pending' && (
                <button className="btn-mini" disabled={busy === m.id}
                        onClick={() => resend(m.id)}
                        title={`Caduca ${m.pendingInviteExpiresAt?.toLocaleString('es-ES') ?? 'pronto'}`}>
                  {busy === m.id ? 'Enviando…' : 'Reenviar invitación'}
                </button>
              )}
            </div>
          </div>
        ))}
        <div className="role-row" style={{ opacity: 0.75 }}>
          <div className="name">
            <div className="avatar" style={{ background: 'var(--ink-3)' }}>+</div>
            <div className="meta"><b>Añadir persona</b><small>Invitar por email</small></div>
          </div>
          <div style={{ color: 'var(--ink-3)' }}>—</div>
          <div>—</div>
          <div>—</div>
          <div>
            <button className="btn ghost" style={{ color: 'var(--primary-2)' }} onClick={() => setInviting(true)}>
              Invitar →
            </button>
          </div>
        </div>
      </div>

      {inviting && (
        <InviteDialog projectId={projectId} teams={teams}
                      onClose={() => setInviting(false)}
                      onDone={() => { setInviting(false); router.refresh(); }} />
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
    </div>
  );
}

function InviteDialog({ projectId, teams, onClose, onDone }: {
  projectId: string; teams: TeamRow[]; onClose: () => void; onDone: () => void;
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
    const res = await inviteMember({ projectId, email, name, role: role as never, teamId: teamId || undefined });
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    onDone();
  }

  return (
    <Overlay title="Invitar persona" subtitle="Se añade al proyecto y, opcionalmente, a un equipo."
             onClose={onClose} onSave={save} saving={saving} error={error} saveLabel="Invitar">
      <div className="wiz-row">
        <label>Email <span style={{ color: '#c0392b' }}>*</span></label>
        <input type="email" placeholder="persona@epdata.es" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="wiz-row">
        <label>Nombre</label>
        <input type="text" placeholder="Nombre y apellidos" value={name} onChange={(e) => setName(e.target.value)} />
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
      <p style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>
        Se envía un correo con un enlace único de un solo uso: al hacer clic, la persona
        crea su contraseña y queda dentro del proyecto. Si <code>RESEND_API_KEY</code> no
        está configurada, el enlace sale por consola del servidor (modo dev).
      </p>
    </Overlay>
  );
}

function TeamDialog({ projectId, onClose, onDone }: {
  projectId: string; onClose: () => void; onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [groupSize, setGroupSize] = useState(3);
  const [metric, setMetric] = useState('fleiss');
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
                <small>{m.email} · {ROLE_LABELS[m.role] ?? m.role}</small>
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
                  backdropFilter: 'blur(2px)', overflowY: 'auto' }}>
      <div className="picker-card" style={{ marginTop: 40, textAlign: 'left', maxWidth: 540 }}>
        <h2 style={{ textAlign: 'center' }}>{title}</h2>
        <p className="lead" style={{ textAlign: 'center' }}>{subtitle}</p>
        {children}
        {error && <div style={{ fontSize: 12.5, color: 'var(--bad)', marginTop: 10 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16,
                      paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={onSave} disabled={saving}>
            {saving ? 'Guardando…' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
