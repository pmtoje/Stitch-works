// Delivery channels. Each is optional and activates when its credentials are configured.
import nodemailer from "nodemailer";

export interface Channel {
  name: "EMAIL" | "SMS" | "WHATSAPP";
  configured(): boolean;
  send(to: string, subject: string, body: string, link?: string | null): Promise<void>;
}

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

export const emailChannel: Channel = {
  name: "EMAIL",
  configured: () => !!process.env.SMTP_HOST,
  async send(to, subject, body, link) {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    const url = link ? new URL(link, appUrl()).toString() : null;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    await transport.sendMail({
      from: process.env.EMAIL_FROM ?? "StitchWorks Collective <no-reply@stitchworks.ng>",
      to,
      subject,
      text: `${body}${url ? `\n\n${url}` : ""}\n\n— StitchWorks Collective`,
      html: `<div style="font-family:Georgia,serif;max-width:560px;margin:auto;color:#232220">
        <p style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#1f4f37">StitchWorks Collective</p>
        <h2 style="font-weight:500">${esc(subject)}</h2>
        <p style="font-family:Arial,sans-serif;line-height:1.6;white-space:pre-line">${esc(body)}</p>
        ${url ? `<p><a href="${esc(url)}" style="background:#1f4f37;color:#fff;padding:12px 20px;text-decoration:none;font-family:Arial,sans-serif">Open in StitchWorks</a></p>` : ""}
      </div>`,
    });
  },
};

// Termii is widely used for Nigerian SMS; any provider with an HTTP API can be dropped in.
export const smsChannel: Channel = {
  name: "SMS",
  configured: () => !!process.env.TERMII_API_KEY,
  async send(to, subject, body) {
    const res = await fetch("https://api.ng.termii.com/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TERMII_API_KEY,
        to: to.replace(/^\+/, ""),
        from: process.env.TERMII_SENDER_ID ?? "StitchWorks",
        sms: `${subject}: ${body}`.slice(0, 480),
        type: "plain",
        channel: "generic",
      }),
    });
    if (!res.ok) throw new Error(`SMS provider returned ${res.status}`);
  },
};

// WhatsApp Business Cloud API (Meta). Business-initiated messages require approved templates;
// WHATSAPP_TEMPLATE should be an approved template with a single body parameter.
export const whatsappChannel: Channel = {
  name: "WHATSAPP",
  configured: () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
  async send(to, subject, body) {
    const res = await fetch(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/^\+/, ""),
        type: "template",
        template: {
          name: process.env.WHATSAPP_TEMPLATE ?? "stitchworks_update",
          language: { code: "en" },
          components: [{ type: "body", parameters: [{ type: "text", text: `${subject} — ${body}`.slice(0, 900) }] }],
        },
      }),
    });
    if (!res.ok) throw new Error(`WhatsApp API returned ${res.status}`);
  },
};

export const channels: Channel[] = [emailChannel, smsChannel, whatsappChannel];
