/**
 * Gmail SMTP sender for weekly franchisor reports.
 * Requires a Google Account App Password (2FA enabled).
 * From: REPORT_FROM or GMAIL_USER (default atulbakeryhillside@gmail.com)
 */
import nodemailer from 'nodemailer'

const DEFAULT_FROM = 'atulbakeryhillside@gmail.com'

export function gmailUser() {
  return process.env.GMAIL_USER?.trim() || process.env.REPORT_FROM?.trim() || DEFAULT_FROM
}

export function mailConfigured() {
  return Boolean(gmailUser() && process.env.GMAIL_APP_PASSWORD?.trim())
}

function createTransport() {
  const user = gmailUser()
  const pass = process.env.GMAIL_APP_PASSWORD?.trim()
  if (!user || !pass) {
    throw new Error('GMAIL_USER (or REPORT_FROM) and GMAIL_APP_PASSWORD are required to send email.')
  }
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  })
}

/**
 * @param {{
 *   to: string[]
 *   subject: string
 *   html: string
 *   attachments?: { filename: string; content: string; contentType?: string }[]
 * }} opts
 */
export async function sendReportEmail({ to, subject, html, attachments = [] }) {
  if (!to?.length) {
    throw new Error('REPORT_TO has no recipients.')
  }
  if (!mailConfigured()) {
    throw new Error('GMAIL_USER (or REPORT_FROM) and GMAIL_APP_PASSWORD are required to send email.')
  }

  const from = gmailUser()
  const transporter = createTransport()

  const info = await transporter.sendMail({
    from: `Atul Bakery Hillside <${from}>`,
    to: to.join(', '),
    subject,
    html,
    attachments: attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType || 'text/csv',
    })),
  })

  return {
    id: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
    response: info.response,
  }
}
