'use client';

export function RolesView() {
  return (
    <div className="page">
      <h1>Roles y equipos</h1>
      <p className="lead">Configura los roles del proyecto y asigna etiquetadores. Los roles determinan qué acciones puede tomar cada usuario dentro del proyecto.</p>

      <div className="grid g-2" style={{ marginBottom: 20 }}>
        <div className="kpi"><div className="label">Roles configurados</div><div className="value">6</div><div className="delta">3 del sistema + 3 del proyecto</div></div>
        <div className="kpi"><div className="label">Equipos activos</div><div className="value">4</div><div className="delta">12 personas en total</div></div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tax-toolbar">
          <input type="search" placeholder="Buscar rol..." />
          <button className="btn primary" style={{ marginLeft: 'auto' }}>+ Nuevo rol</button>
        </div>
        <table>
          <thead><tr><th>Rol</th><th>Scope</th><th>Permisos</th><th>Asignados</th><th></th></tr></thead>
          <tbody>
            <tr>
              <td><b>Superadmin</b><br /><small style={{ color: 'var(--ink-3)' }}>Acceso total al sistema</small></td>
              <td><span className="tag status-progress">Sistema</span></td>
              <td>Todos</td>
              <td>1 persona</td>
              <td><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>No editable</span></td>
            </tr>
            <tr>
              <td><b>Project Admin</b><br /><small style={{ color: 'var(--ink-3)' }}>Administra el proyecto</small></td>
              <td><span className="tag status-progress">Proyecto</span></td>
              <td>Configurar, asignar, validar</td>
              <td>2 personas</td>
              <td><button className="btn ghost">Editar</button></td>
            </tr>
            <tr>
              <td><b>Anotador</b><br /><small style={{ color: 'var(--ink-3)' }}>Etiqueta fragmentos</small></td>
              <td><span className="tag status-progress">Proyecto</span></td>
              <td>Etiquetar, comentar</td>
              <td>6 personas</td>
              <td><button className="btn ghost">Editar</button></td>
            </tr>
            <tr>
              <td><b>Validador</b><br /><small style={{ color: 'var(--ink-3)' }}>Revisa anotaciones</small></td>
              <td><span className="tag status-progress">Proyecto</span></td>
              <td>Validar, aprobar, rechazar</td>
              <td>2 personas</td>
              <td><button className="btn ghost">Editar</button></td>
            </tr>
            <tr>
              <td><b>Revisor de calidad</b><br /><small style={{ color: 'var(--ink-3)' }}>Detección de discrepancias</small></td>
              <td><span className="tag status-progress">Proyecto</span></td>
              <td>Ver discrepancias, comentar</td>
              <td>1 persona</td>
              <td><button className="btn ghost">Editar</button></td>
            </tr>
            <tr>
              <td><b>Viewer</b><br /><small style={{ color: 'var(--ink-3)' }}>Solo lectura</small></td>
              <td><span className="tag status-progress">Proyecto</span></td>
              <td>Ver reportes</td>
              <td>0 personas</td>
              <td><button className="btn ghost">Editar</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
