/**
 * /invite/[token] — landing page for invitation magic links.
 *
 * Public route (added to `PUBLIC_PATHS` in auth.config.ts) so the
 * recipient doesn't need an existing session. Looking up the token
 * is read-only here; setting the password happens in the client form
 * which calls the `redeemInvitation` server action.
 */
import { checkInvitation } from '@/app/actions/invitations';
import { RedeemForm } from './RedeemForm';

export const dynamic = 'force-dynamic';

export default async function InvitePage({
  params,
}: {
  params: { token: string };
}) {
  const status = await checkInvitation(params.token);

  return (
    <div className="login-form">
      <div className="panel">
        <h1>Etiquetador</h1>
        <p className="lead">
          {status.kind === 'valid'
            ? `Te han invitado a «${status.projectName}».`
            : 'Tu enlace de invitación.'}
        </p>

        {status.kind === 'valid' && (
          <RedeemForm
            token={params.token}
            email={status.email}
            name={status.name}
            projectName={status.projectName}
          />
        )}
        {status.kind === 'expired' && (
          <ErrorBlock
            title="Invitación caducada"
            body="El enlace ha caducado. Pide a un administrador que te envíe uno nuevo."
          />
        )}
        {status.kind === 'used' && (
          <ErrorBlock
            title="Invitación ya usada"
            body="Esta invitación ya fue utilizada. Si necesitas acceso, pide un nuevo enlace."
          />
        )}
        {status.kind === 'invalid' && (
          <ErrorBlock
            title="Invitación no encontrada"
            body="El enlace no es válido o ha sido revocado. Comprueba que has copiado el enlace completo del correo."
          />
        )}
      </div>
    </div>
  );
}

function ErrorBlock({ title, body }: { title: string; body: string }) {
  return (
    <div style={{
      background: '#fdf2f2', border: '1px solid #e8c4c5', borderRadius: 8,
      padding: '14px 16px', color: '#7a2226', fontSize: 13.5, lineHeight: 1.55,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div>{body}</div>
    </div>
  );
}
