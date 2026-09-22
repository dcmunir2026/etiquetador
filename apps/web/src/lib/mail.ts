/**
 * Outgoing mail — Resend by default, console fallback for dev.
 *
 * In production `RESEND_API_KEY` is required; in dev (no key) we just log
 * the message so the rest of the invite flow is still testable. The
 * fallback never throws, so callers can treat a missing key as "the link
 * is in the server log" rather than as a hard failure.
 */

import 'server-only';
import { Resend } from 'resend';

let _client: Resend | null = null;
function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_client) _client = new Resend(key);
  return _client;
}

export type SendResult = { ok: true } | { ok: false; error: string };

export async function sendInvitationEmail(input: {
  to: string;
  inviterName: string;
  projectName: string;
  inviteUrl: string;
  expiresInHours: number;
}): Promise<SendResult> {
  const from = process.env.MAIL_FROM ?? 'Etiquetador <onboarding@resend.dev>';
  const subject = `Te han invitado a ${input.projectName} en Etiquetador`;
  const body = renderInvitationEmail({
    inviterName: input.inviterName,
    projectName: input.projectName,
    inviteUrl: input.inviteUrl,
    expiresInHours: input.expiresInHours,
  });

  const r = client();
  if (!r) {
    // Dev fallback: log so devs can copy the link during testing.
    console.log(`[mail:dev] To: ${input.to}`);
    console.log(`[mail:dev] From: ${from}`);
    console.log(`[mail:dev] Subject: ${subject}`);
    console.log(`[mail:dev] ${input.inviteUrl}`);
    return { ok: true };
  }

  try {
    const { error } = await r.emails.send({
      from,
      to: input.to,
      subject,
      html: body,
      text: plainInvitation(input.inviterName, input.projectName, input.inviteUrl, input.expiresInHours),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown mail error' };
  }
}

/** Plain-text version for clients that strip HTML. */
function plainInvitation(
  inviterName: string, projectName: string, inviteUrl: string, hours: number,
): string {
  return [
    `Hola,`,
    ``,
    `${inviterName} te ha invitado a participar en el proyecto "${projectName}" de Etiquetador.`,
    ``,
    `Para crear tu cuenta y entrar, abre este enlace (caduca en ${hours} h, solo se puede usar una vez):`,
    inviteUrl,
    ``,
    `Si no has pedido esta invitación, puedes ignorar este correo.`,
  ].join('\n');
}

function renderInvitationEmail(input: {
  inviterName: string;
  projectName: string;
  inviteUrl: string;
  expiresInHours: number;
}): string {
  // Minimal but legible HTML — no external assets.
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#fafaf2;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1f24">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf2;padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0"
               style="max-width:480px;background:#ffffff;border:1px solid #e3ddc9;border-radius:12px;overflow:hidden">
          <tr><td style="padding:24px 28px 8px">
            <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#7c8893;font-weight:600">Etiquetador</div>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:600;font-family:Georgia,serif">
              Te han invitado a «${escapeHtml(input.projectName)}»
            </h1>
          </td></tr>
          <tr><td style="padding:8px 28px 20px;font-size:14.5px;line-height:1.55;color:#3a4256">
            <p style="margin:0 0 12px">
              <b>${escapeHtml(input.inviterName)}</b> te ha añadido al proyecto
              <b>${escapeHtml(input.projectName)}</b>.
            </p>
            <p style="margin:0 0 20px">
              Pulsa el botón de abajo para crear tu contraseña y entrar. El enlace es personal
              y caduca en <b>${input.expiresInHours} horas</b>; solo se puede usar una vez.
            </p>
            <p style="margin:24px 0">
              <a href="${escapeAttr(input.inviteUrl)}"
                 style="display:inline-block;padding:11px 22px;border-radius:8px;background:#1d6e75;color:#ffffff;
                        text-decoration:none;font-weight:600;font-size:14.5px">
                Crear cuenta y entrar
              </a>
            </p>
            <p style="margin:24px 0 0;font-size:12.5px;color:#7c8893;line-height:1.5">
              Si el botón no funciona, copia y pega este enlace:<br />
              <a href="${escapeAttr(input.inviteUrl)}" style="color:#1d6e75;word-break:break-all">
                ${escapeHtml(input.inviteUrl)}
              </a>
            </p>
          </td></tr>
          <tr><td style="padding:14px 28px;border-top:1px solid #f0ede4;font-size:11.5px;color:#7c8893">
            Si no has pedido esta invitación, puedes ignorar este correo.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
