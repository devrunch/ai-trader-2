import { withTimeout } from '@aitrader/resilience';

export interface Alert { subject: string; text: string }
export type SendResult = 'sent' | 'disabled' | 'failed';

/** Ops alerts go by email only. Sending never throws: an alert must not break the job that raised it. */
export interface Notifier {
  readonly configured: boolean;
  readonly recipients: readonly string[];
  send(alert: Alert): Promise<SendResult>;
}
export const NOTIFIER = Symbol('NOTIFIER');

interface MailTransport { sendMail(message: { from: string; to: string[]; subject: string; text: string }): Promise<unknown> }

export class SmtpNotifier implements Notifier {
  readonly configured = true;
  constructor(private readonly transport: MailTransport, private readonly from: string, readonly recipients: readonly string[],
    private readonly warn: (message: string) => void = () => undefined) {}

  async send(alert: Alert): Promise<SendResult> {
    try {
      await withTimeout(() => this.transport.sendMail({ from: this.from, to: [...this.recipients], subject: `[AI Trader] ${alert.subject}`, text: alert.text }), 20_000);
      return 'sent';
    } catch (error) {
      this.warn(`alert email failed (${error instanceof Error ? error.name : 'unknown'}): ${alert.subject}`);
      return 'failed';
    }
  }
}

export class DisabledNotifier implements Notifier {
  readonly configured = false;
  readonly recipients: readonly string[] = [];
  constructor(private readonly log: (message: string) => void) {}
  send(alert: Alert): Promise<SendResult> {
    this.log(`mail not configured; alert not sent: ${alert.subject}`);
    return Promise.resolve('disabled');
  }
}

export function maskAddress(address: string): string {
  const [user = '', domain = ''] = address.split('@');
  return `${user.slice(0, 2)}***@${domain}`;
}
