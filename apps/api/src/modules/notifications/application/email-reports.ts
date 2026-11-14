import { ValidationError } from '../../../shared/errors';

export interface EmailPrefStore {
  reports(userId: string): Promise<boolean>;
  setReports(userId: string, on: boolean, address?: string): Promise<void>;
  /** The address the user gave for reports (login names are not emails). */
  address(userId: string): Promise<string | null>;
}
/** Sends one mail to one address; never throws. */
export interface ReportMailer { readonly configured: boolean; send(to: string, subject: string, text: string): Promise<'sent' | 'disabled' | 'failed'> }
export interface SendGate { open(key: string, windowMs: number): Promise<boolean> }
export type DeliveryResult = 'sent' | 'off' | 'no-address' | 'not-configured' | 'rate-limited' | 'failed';

/** At most one report email per user in this window; further reports still reach the in-app inbox. */
const EMAIL_WINDOW_MS = 10 * 60_000;

/** Email delivery of REPORT notifications: opt-in per user, to the address they give, rate-limited. */
export class EmailReports {
  constructor(private readonly prefs: EmailPrefStore, private readonly mailer: ReportMailer, private readonly gate: SendGate, private readonly appUrl: string) {}

  async get(userId: string): Promise<{ reports: boolean; address: string | null; available: boolean }> {
    const [reports, address] = await Promise.all([this.prefs.reports(userId), this.prefs.address(userId)]);
    return { reports, address, available: this.mailer.configured && address !== null };
  }

  async set(userId: string, reports: boolean, address?: string): Promise<{ reports: boolean; address: string | null; available: boolean }> {
    if (reports && address === undefined && (await this.prefs.address(userId)) === null) throw new ValidationError('Add the email address to send reports to.');
    await this.prefs.setReports(userId, reports, address);
    return this.get(userId);
  }

  async deliver(userId: string, title: string, body: string | null): Promise<DeliveryResult> {
    if (!(await this.prefs.reports(userId))) return 'off';
    if (!this.mailer.configured) return 'not-configured';
    const to = await this.prefs.address(userId);
    if (!to) return 'no-address';
    if (!(await this.gate.open(`report-mail:${userId}`, EMAIL_WINDOW_MS))) return 'rate-limited';
    return this.mailer.send(to, title, `${body ?? ''}\n\nOpen the app: ${this.appUrl}`.trim()).then(r => (r === 'sent' ? 'sent' : r === 'disabled' ? 'not-configured' : 'failed'));
  }
}
