/**
 * Gmail Tools
 *
 * buscar_emails — search inbox with Gmail API
 * leer_email — read full email content
 * crear_borrador_email — create a draft email
 *
 * All tools gracefully degrade when Google is not configured.
 */

import {
  isGoogleEnabled,
  getGmailReadClient,
  getGmailClient,
  getGmailComposeClient,
} from "../google-auth.js";
import { getPersonaEmail } from "./helpers.js";
import type { ToolContext } from "./index.js";

/** Wrap plain text in HTML email template with proper paragraph spacing. */
function wrapEmailHtml(body: string): string {
  const hasHtml = /<(p|div|table|h[1-6]|ul|ol|br)\b/i.test(body);
  let htmlBody: string;
  if (hasHtml) {
    htmlBody = body;
  } else {
    htmlBody = body
      .split(/\n\n+/)
      .map(
        (para) =>
          `<p style="margin: 0 0 16px 0; line-height: 1.6;">${para.replace(/\n/g, "<br>")}</p>`,
      )
      .join("\n");
  }
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:20px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
<tr><td style="padding:32px 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;color:#333333;">
${htmlBody}
</td></tr></table>
</td></tr></table>
</body></html>`;
}

// ---------------------------------------------------------------------------
// buscar_emails
// ---------------------------------------------------------------------------

export async function buscar_emails(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  if (!isGoogleEnabled()) {
    return JSON.stringify({ error: "Gmail no configurado" });
  }

  const email = getPersonaEmail(ctx.persona_id);
  if (!email) {
    return JSON.stringify({ error: "Persona no tiene email configurado" });
  }

  const query = args.query as string | undefined;
  const limite = (args.limite as number) || 10;

  try {
    const gmail = getGmailReadClient(email);
    const res = await gmail.users.messages.list({
      userId: "me",
      q: query ?? "",
      maxResults: limite,
    });

    const messages = res.data.messages ?? [];
    const emails: Array<{
      id: string;
      from: string;
      subject: string;
      date: string;
      snippet: string;
    }> = [];

    for (const msg of messages) {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });

      const headers = detail.data.payload?.headers ?? [];
      const from = headers.find((h) => h.name === "From")?.value ?? "";
      const subject = headers.find((h) => h.name === "Subject")?.value ?? "";
      const date = headers.find((h) => h.name === "Date")?.value ?? "";

      emails.push({
        id: msg.id!,
        from,
        subject,
        date,
        snippet: detail.data.snippet ?? "",
      });
    }

    return JSON.stringify({ emails });
  } catch (err: any) {
    return JSON.stringify({
      error: `Error buscando emails: ${err.message?.slice(0, 200) ?? "unknown"}`,
    });
  }
}

// ---------------------------------------------------------------------------
// leer_email
// ---------------------------------------------------------------------------

export async function leer_email(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  if (!isGoogleEnabled()) {
    return JSON.stringify({ error: "Gmail no configurado" });
  }

  const email = getPersonaEmail(ctx.persona_id);
  if (!email) {
    return JSON.stringify({ error: "Persona no tiene email configurado" });
  }

  const emailId = args.email_id as string;
  if (!emailId) {
    return JSON.stringify({ error: "email_id es requerido" });
  }

  try {
    const gmail = getGmailReadClient(email);
    const detail = await gmail.users.messages.get({
      userId: "me",
      id: emailId,
      format: "full",
    });

    const headers = detail.data.payload?.headers ?? [];
    const from = headers.find((h) => h.name === "From")?.value ?? "";
    const to = headers.find((h) => h.name === "To")?.value ?? "";
    const subject = headers.find((h) => h.name === "Subject")?.value ?? "";
    const date = headers.find((h) => h.name === "Date")?.value ?? "";

    // Extract body from payload
    let body = "";
    const payload = detail.data.payload;
    if (payload?.body?.data) {
      body = Buffer.from(payload.body.data, "base64url").toString("utf-8");
    } else if (payload?.parts) {
      const textPart = payload.parts.find((p) => p.mimeType === "text/plain");
      const htmlPart = payload.parts.find((p) => p.mimeType === "text/html");
      const part = textPart ?? htmlPart;
      if (part?.body?.data) {
        body = Buffer.from(part.body.data, "base64url").toString("utf-8");
      }
    }

    // Truncate body to 50KB
    if (body.length > 50000) {
      body = body.slice(0, 50000) + "\n... (truncado)";
    }

    return JSON.stringify({ from, to, subject, date, body });
  } catch (err: any) {
    return JSON.stringify({
      error: `Error leyendo email: ${err.message?.slice(0, 200) ?? "unknown"}`,
    });
  }
}

// ---------------------------------------------------------------------------
// crear_borrador_email
// ---------------------------------------------------------------------------

export async function crear_borrador_email(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  if (!isGoogleEnabled()) {
    return JSON.stringify({ error: "Gmail no configurado" });
  }

  const email = getPersonaEmail(ctx.persona_id);
  if (!email) {
    return JSON.stringify({ error: "Persona no tiene email configurado" });
  }

  const destinatario = args.destinatario as string;
  const asunto = args.asunto as string;
  const cuerpo = args.cuerpo as string;

  if (!destinatario || !asunto || !cuerpo) {
    return JSON.stringify({
      error: "destinatario, asunto y cuerpo son requeridos",
    });
  }

  const htmlBody = wrapEmailHtml(cuerpo);
  const raw = Buffer.from(
    `From: ${email}\r\nTo: ${destinatario}\r\nSubject: ${asunto}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${htmlBody}`,
  ).toString("base64url");

  // Try creating a draft first (requires gmail.compose scope)
  try {
    const gmail = getGmailComposeClient(email);
    const res = await gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw } },
    });
    return JSON.stringify({
      draft_id: res.data.id ?? "unknown",
      mensaje: `Borrador creado para ${destinatario}: "${asunto}"`,
    });
  } catch {
    // gmail.compose scope not authorized — fall back to direct send
  }

  // Fallback: send directly (gmail.send scope)
  try {
    const gmail = getGmailClient(email);
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    return JSON.stringify({
      message_id: res.data.id ?? "unknown",
      mensaje: `Email enviado directamente a ${destinatario}: "${asunto}" (no se pudo crear borrador, se envio directo)`,
    });
  } catch (err: any) {
    return JSON.stringify({
      error: `Error enviando email: ${err.message?.slice(0, 200) ?? "unknown"}`,
    });
  }
}
