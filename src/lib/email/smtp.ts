import nodemailer from 'nodemailer';

export type SendSmtpEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

export type SendSmtpEmailResult = {
  messageId: string;
  response: string;
};

let smtpTransporter: nodemailer.Transporter | null = null;
let smtpFromAddress: string | null = null;

function getRequiredEnv(name: 'SMTP_PASS' | 'SMTP_FROM'): string {
  const value = String(process.env[name] ?? '').trim();
  if (!value) {
    throw new Error(`[email:smtp] Missing required environment variable: ${name}`);
  }
  return value;
}

function getTransporter(): nodemailer.Transporter {
  if (smtpTransporter) return smtpTransporter;

  const host = String(process.env.SMTP_HOST ?? 'smtp.resend.com').trim() || 'smtp.resend.com';
  const portRaw = Number(process.env.SMTP_PORT ?? 587);
  const port = Number.isFinite(portRaw) ? portRaw : 587;
  const user = String(process.env.SMTP_USER ?? 'resend').trim() || 'resend';
  const pass = getRequiredEnv('SMTP_PASS');
  const from = getRequiredEnv('SMTP_FROM');

  smtpFromAddress = from;
  smtpTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: {
      user,
      pass,
    },
  });

  return smtpTransporter;
}

export async function sendSmtpEmail(input: SendSmtpEmailInput): Promise<SendSmtpEmailResult> {
  const transporter = getTransporter();
  const from = smtpFromAddress ?? getRequiredEnv('SMTP_FROM');

  const info = await transporter.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  return {
    messageId: String(info.messageId ?? ''),
    response: String(info.response ?? ''),
  };
}

