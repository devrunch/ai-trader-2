import type { Notifier } from '../../../shared/notify/notifier';
import type { ReportMailer } from '../application/email-reports';

/** Sends a user's report mail through the app's one mail transport (Resend or SMTP). */
export class NotifierReportMailer implements ReportMailer {
  constructor(private readonly notifier: Notifier) {}
  get configured(): boolean { return this.notifier.configured; }
  send(to: string, subject: string, text: string): Promise<'sent' | 'disabled' | 'failed'> { return this.notifier.send({ subject, text, to: [to] }); }
}
