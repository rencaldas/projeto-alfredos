import nodemailer from 'nodemailer';
import { withRetry } from './retry.mjs';

const PERMANENT_ERROR_CODES = ['EAUTH', '535', '550', '551', '553'];

/**
 * Envia um e-mail HTML usando o Gmail via SMTP (App Password), com retry/backoff.
 * Nao tenta novamente em erros permanentes (ex.: credenciais invalidas, destinatario rejeitado).
 */
export async function sendReportEmail({ user, appPassword, to, subject, html, maxRetries = 3 }) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass: appPassword }
  });

  try {
    await withRetry(
      () =>
        transporter.sendMail({
          from: `"Alfredo Secretário" <${user}>`,
          to,
          subject,
          html
        }),
      {
        retries: maxRetries,
        baseDelayMs: 3000,
        maxDelayMs: 20000,
        shouldRetry: (error) => !isPermanentEmailError(error),
        onRetry: ({ error, attempt, delay }) => {
          console.warn(
            `[E-mail] Tentativa ${attempt + 1} falhou (${error.message}). Nova tentativa em ${Math.round(delay / 1000)}s.`
          );
        }
      }
    );
  } finally {
    transporter.close();
  }
}

function isPermanentEmailError(error) {
  const code = String(error.responseCode || error.code || '');
  return PERMANENT_ERROR_CODES.some((permanentCode) => code.includes(permanentCode));
}
