import { run, stamp } from "./db";

export const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

function smtpConfig() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return {
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: Number(SMTP_PORT ?? 587) === 465,
    // Gmail shows app passwords in spaced groups of four; they are not part of it.
    auth: { user: SMTP_USER, pass: SMTP_PASS.replace(/\s+/g, "") },
  };
}

export function mailIsLive(): boolean {
  return smtpConfig() !== null;
}

type Mail = {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
  kind?: "mention" | "digest" | "notification";
};

/**
 * Every outgoing email is written to the `outbox` table first, then sent if SMTP
 * credentials exist. With no credentials the row stays at status `outbox`, which is
 * what /inbox renders — so the whole notification flow is demoable with no setup.
 */
export async function sendMail(mail: Mail): Promise<{ id: number; status: string }> {
  const text = mail.text ?? stripTags(mail.html);
  const res = await run(
    `INSERT INTO outbox (to_email, to_name, subject, html, text, kind, status, created_at)
     VALUES (?,?,?,?,?,?,?,?) RETURNING id`,
    mail.to,
    mail.toName ?? "",
    mail.subject,
    mail.html,
    text,
    mail.kind ?? "notification",
    "queued",
    stamp()
  );
  const id = res.id;

  const cfg = smtpConfig();
  if (!cfg) {
    await run("UPDATE outbox SET status = 'outbox' WHERE id = ?", id);
    return { id, status: "outbox" };
  }

  try {
    const nodemailer = (await import("nodemailer")).default;
    const transport = nodemailer.createTransport(cfg);
    await transport.sendMail({
      from: process.env.MAIL_FROM ?? `STEM Hub <${cfg.auth.user}>`,
      to: mail.toName ? `${mail.toName} <${mail.to}>` : mail.to,
      subject: mail.subject,
      html: mail.html,
      text,
    });
    await run("UPDATE outbox SET status = 'sent', sent_at = ? WHERE id = ?", stamp(), id);
    return { id, status: "sent" };
  } catch (err) {
    await run(
      "UPDATE outbox SET status = 'failed', error = ? WHERE id = ?",
      err instanceof Error ? err.message : String(err),
      id
    );
    return { id, status: "failed" };
  }
}

function stripTags(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h1|h2|h3|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Shared email chrome, on paper, so mentions and digests look like one desk. */
export function emailShell(title: string, bodyHtml: string, footer = "") {
  return `<!doctype html>
<html><body style="margin:0;padding:28px 16px;background:#f4f4f1;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e3e3dd;">
    <tr><td style="padding:24px 30px 18px;border-bottom:2px solid #17181c;">
      <div style="font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#93979f;">STEM Desk</div>
      <div style="font-family:Georgia,serif;font-size:24px;color:#17181c;margin-top:6px;">${escapeHtml(title)}</div>
    </td></tr>
    <tr><td style="padding:26px 30px;color:#5c6068;font-size:14px;line-height:1.6;">${bodyHtml}</td></tr>
    <tr><td style="padding:16px 30px;border-top:1px solid #e3e3dd;color:#93979f;font-family:ui-monospace,Menlo,monospace;font-size:11px;">
      ${footer || `<a href="${APP_URL}" style="color:#2b4c9b;text-decoration:none;">Open the hub</a>`}
    </td></tr>
  </table>
</body></html>`;
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}
