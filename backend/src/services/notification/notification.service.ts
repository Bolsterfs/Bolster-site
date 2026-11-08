import { env } from '../../config/env.js'

/**
 * Notification Service — email (SendGrid) + SMS (Twilio)
 *
 * Design goals:
 * - Works RIGHT NOW in development even without real API keys: when a key is a
 *   placeholder or missing, the message is logged to the console instead of sent.
 *   This means the payment flow never breaks just because notifications aren't
 *   fully configured yet.
 * - Never throws into the payment path. A failed notification must NEVER fail a
 *   payment — every method catches its own errors and returns a boolean.
 * - All sends are logged so you have a dev-time audit trail in the terminal.
 *
 * When you add real keys to .env (SENDGRID_API_KEY, TWILIO_*), the same code
 * automatically starts sending for real — no code change needed.
 */

/** Where customers are told to write for help. */
const SUPPORT_EMAIL = 'support@bolsterfs.co.uk'

const PLACEHOLDER_PATTERNS = [/^your-/i, /placeholder/i, /^$/]

function isRealKey(value: string | undefined): boolean {
  if (!value) return false
  return !PLACEHOLDER_PATTERNS.some((p) => p.test(value))
}

interface EmailInput {
  to:       string
  subject:  string
  text:     string
  html?:    string
}

interface SmsInput {
  to:   string
  body: string
}

export class NotificationService {
  private readonly emailEnabled = isRealKey(env.SENDGRID_API_KEY)
  private readonly smsEnabled =
    isRealKey(env.TWILIO_ACCOUNT_SID) && isRealKey(env.TWILIO_AUTH_TOKEN)

  // ── Email ─────────────────────────────────────────────────────────────────

  async sendEmail(input: EmailInput): Promise<boolean> {
    if (!this.emailEnabled) {
      // Dev fallback — log instead of send
      console.log('\n📧 [EMAIL — dev mode, not actually sent]')
      console.log(`   To:      ${input.to}`)
      console.log(`   Subject: ${input.subject}`)
      console.log(`   Body:    ${input.text.replace(/\n/g, '\n            ')}\n`)
      return true
    }

    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: input.to }] }],
          from: { email: env.SENDGRID_FROM_EMAIL },
          subject: input.subject,
          content: [
            { type: 'text/plain', value: input.text },
            ...(input.html ? [{ type: 'text/html', value: input.html }] : []),
          ],
        }),
      })

      if (!response.ok) {
        const body = await response.text()
        console.error(`SendGrid error ${response.status}: ${body}`)
        return false
      }
      return true
    } catch (e) {
      console.error('SendGrid send failed:', e instanceof Error ? e.message : e)
      return false
    }
  }

  // ── SMS ─────────────────────────────────────────────────────────────────

  async sendSms(input: SmsInput): Promise<boolean> {
    if (!this.smsEnabled) {
      console.log('\n📱 [SMS — dev mode, not actually sent]')
      console.log(`   To:   ${input.to}`)
      console.log(`   Body: ${input.body}\n`)
      return true
    }

    try {
      const creds = Buffer.from(
        `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`,
      ).toString('base64')

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${creds}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To:   input.to,
            From: env.TWILIO_FROM_NUMBER ?? '',
            Body: input.body,
          }).toString(),
        },
      )

      if (!response.ok) {
        const body = await response.text()
        console.error(`Twilio error ${response.status}: ${body}`)
        return false
      }
      return true
    } catch (e) {
      console.error('Twilio send failed:', e instanceof Error ? e.message : e)
      return false
    }
  }

  // ── Templated messages ────────────────────────────────────────────────────

  /** Contributor receipt — sent when a payment settles successfully. */
  async sendContributorReceipt(params: {
    contributorEmail: string
    contributorName:  string
    creditorName:     string
    netAmountPence:   number
    feeAmountPence:   number
    grossAmountPence: number
    paymentRef:       string
  }): Promise<void> {
    const net   = formatPence(params.netAmountPence)
    const fee   = formatPence(params.feeAmountPence)
    const gross = formatPence(params.grossAmountPence)

    await this.sendEmail({
      to:      params.contributorEmail,
      subject: `Your payment of ${gross} was successful 💙`,
      text:
        `Hi ${params.contributorName},\n\n` +
        `Thank you for your kindness. Your payment has been completed and sent ` +
        `directly to ${params.creditorName}.\n\n` +
        `Amount to ${params.creditorName}: ${net}\n` +
        `Bolster fee: ${fee}\n` +
        `Total paid: ${gross}\n` +
        `Reference: ${params.paymentRef}\n\n` +
        `The money went straight to the creditor — it never passed through ` +
        `anyone else's account.\n\n` +
        `With thanks,\nThe Bolster team`,
    })
  }

  /** Contributor failure notice — reassures them no money left their account. */
  async sendContributorFailureNotice(params: {
    contributorEmail: string
    contributorName:  string
    creditorName:     string
    paymentRef:       string
  }): Promise<void> {
    await this.sendEmail({
      to:      params.contributorEmail,
      subject: `Your payment could not be completed`,
      text:
        `Hi ${params.contributorName},\n\n` +
        `Unfortunately your recent payment towards ${params.creditorName} could ` +
        `not be completed. No money has left your account.\n\n` +
        `Reference: ${params.paymentRef}\n\n` +
        `You're welcome to try again whenever you're ready. If you keep having ` +
        `trouble, reply to this email or contact ${SUPPORT_EMAIL} and quote ` +
        `the reference above.\n\n` +
        `Please don't attempt a second payment without checking with us first.\n\n` +
        `The Bolster team`,
    })
  }

  /** Password reset link — sent when an account holder asks to reset. */
  async sendPasswordResetEmail(params: {
    email:            string
    firstName:        string
    resetUrl:         string
    expiresInMinutes: number
  }): Promise<void> {
    await this.sendEmail({
      to:      params.email,
      subject: 'Reset your Bolster password',
      text:
        `Hi ${params.firstName},\n\n` +
        `We received a request to reset the password for your Bolster account. ` +
        `Use the link below to choose a new one:\n\n` +
        `${params.resetUrl}\n\n` +
        `This link works once and expires in ${params.expiresInMinutes} minutes.\n\n` +
        `If you didn't ask for this, you can ignore this email — your password ` +
        `stays the same and nobody can change it without this link.\n\n` +
        `The Bolster team`,
    })
  }

  /** Confirmation that the password changed — an alert if it wasn't them. */
  async sendPasswordChangedEmail(params: {
    email:     string
    firstName: string
  }): Promise<void> {
    await this.sendEmail({
      to:      params.email,
      subject: 'Your Bolster password was changed',
      text:
        `Hi ${params.firstName},\n\n` +
        `The password for your Bolster account has just been changed, and you ` +
        `have been signed out on any other devices.\n\n` +
        `If this was you, there's nothing more to do.\n\n` +
        `If it wasn't you, email ${SUPPORT_EMAIL} straight away so we can ` +
        `secure your account.\n\n` +
        `The Bolster team`,
    })
  }

  /** Internal — a recipient asked for a creditor that is not on the list. */
  async sendCreditorRequestToTeam(params: {
    creditorName: string
    note:         string | null
    requestedBy:  string
    requestId:    string
  }): Promise<void> {
    await this.sendEmail({
      to:      SUPPORT_EMAIL,
      subject: `Creditor request: ${params.creditorName}`,
      text:
        `A recipient has asked for a creditor to be added to the vetted list.\n\n` +
        `Creditor: ${params.creditorName}\n` +
        `Requested by: ${params.requestedBy}\n` +
        `Note: ${params.note ?? '(none)'}\n` +
        `Request ID: ${params.requestId}\n\n` +
        `Verify the creditor's bank details independently, then add it with ` +
        `the creditor import (see backend/creditors.example.json).`,
    })
  }

  /** Recipient notification — sent when someone contributes to their debt. */
  async sendRecipientHelpReceived(params: {
    recipientEmail:      string
    recipientFirstName:  string
    recipientPhone?:     string | null
    contributorName:     string
    creditorName:        string
    netAmountPence:      number
    remainingPence:      number
    fullyResolved:       boolean
  }): Promise<void> {
    const amount    = formatPence(params.netAmountPence)
    const remaining = formatPence(params.remainingPence)

    const subject = params.fullyResolved
      ? `Great news — your ${params.creditorName} bill is fully paid! 🎉`
      : `Someone just helped with your ${params.creditorName} bill 💙`

    const body = params.fullyResolved
      ? `Hi ${params.recipientFirstName},\n\n` +
        `Wonderful news — ${params.contributorName} contributed ${amount} and your ` +
        `${params.creditorName} bill is now fully paid. That debt is cleared. 🎉\n\n` +
        `You can log in to Bolster any time to see your progress.\n\n` +
        `Take care,\nThe Bolster team`
      : `Hi ${params.recipientFirstName},\n\n` +
        `${params.contributorName} just contributed ${amount} towards your ` +
        `${params.creditorName} bill. It went straight to the creditor.\n\n` +
        `Remaining on this bill: ${remaining}\n\n` +
        `You're not doing this alone. 💙\n\n` +
        `The Bolster team`

    await this.sendEmail({ to: params.recipientEmail, subject, text: body })

    // Best-effort SMS if we have a number
    if (params.recipientPhone) {
      const sms = params.fullyResolved
        ? `Bolster: Great news! ${params.contributorName} helped and your ${params.creditorName} bill is now fully paid 🎉`
        : `Bolster: ${params.contributorName} contributed ${amount} to your ${params.creditorName} bill. ${remaining} remaining 💙`
      await this.sendSms({ to: params.recipientPhone, body: sms })
    }
  }
}

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

export const notificationService = new NotificationService()
