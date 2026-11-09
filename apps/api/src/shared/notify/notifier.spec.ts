import { describe, expect, it, vi } from 'vitest';
import { createTransport } from 'nodemailer';
import { DisabledNotifier, SmtpNotifier, maskAddress } from './notifier';
import { AlertGate } from './alert-gate';
import { createNotifier } from './notify.module';

describe('email notifier (ops alerts are email only)', () => {
  it('sends subject and text from the configured sender to every recipient', async () => {
    const sent: unknown[] = [];
    const inner = createTransport({ jsonTransport: true });
    const transport = { sendMail: async (message: Parameters<typeof inner.sendMail>[0]) => {
      const info = await inner.sendMail(message);
      const raw: unknown = info.message;
      sent.push(JSON.parse(typeof raw === 'string' ? raw : '{}'));
      return info;
    } };
    const notifier = new SmtpNotifier(transport, 'AI Trader <alerts@example.com>', ['a@example.com', 'b@example.com']);
    expect(await notifier.send({ subject: 'Zerodha not connected', text: 'Connect before 09:15 IST.' })).toBe('sent');
    expect(sent[0]).toMatchObject({ subject: '[AI Trader] Zerodha not connected', text: 'Connect before 09:15 IST.',
      from: { address: 'alerts@example.com' }, to: [{ address: 'a@example.com' }, { address: 'b@example.com' }] });
  });

  it('a mail server failure is reported, never thrown', async () => {
    const transport = { sendMail: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    const notifier = new SmtpNotifier(transport, 'x@example.com', ['a@example.com']);
    expect(await notifier.send({ subject: 's', text: 't' })).toBe('failed');
  });

  it('without SMTP configuration nothing is sent and the caller is told so', async () => {
    const log = vi.fn();
    expect(await new DisabledNotifier(log).send({ subject: 'Zerodha not connected', text: 't' })).toBe('disabled');
    expect(log).toHaveBeenCalledWith('mail not configured; alert not sent: Zerodha not connected');
  });

  it('masks recipients for display', () => {
    expect(maskAddress('owner@example.com')).toBe('ow***@example.com');
  });
});

describe('AlertGate', () => {
  it('lets one alert per key through per window', async () => {
    const keys = new Map<string, number>();
    const redis = { set: vi.fn((key: string, _v: string, _px: 'PX', ms: number) => {
      if (keys.has(key)) return Promise.resolve(null); keys.set(key, ms); return Promise.resolve('OK');
    }) };
    const gate = new AlertGate(redis);
    expect(await gate.open('feed-down:kite', 3_600_000)).toBe(true);
    expect(await gate.open('feed-down:kite', 3_600_000)).toBe(false);
    expect(await gate.open('feed-down:deriv', 3_600_000)).toBe(true);
    expect(keys.get('alert:feed-down:kite')).toBe(3_600_000);
  });
});

describe('createNotifier', () => {
  it('is disabled until SMTP_URL, sender and recipients are all set', () => {
    expect(createNotifier({ SMTP_URL: undefined, ALERT_EMAIL_FROM: 'a@example.com', ALERT_EMAIL_TO: ['b@example.com'] }).configured).toBe(false);
    expect(createNotifier({ SMTP_URL: 'smtps://u:p@mail.example.com:465', ALERT_EMAIL_FROM: 'a@example.com', ALERT_EMAIL_TO: [] }).configured).toBe(false);
    expect(createNotifier({ SMTP_URL: 'smtps://u:p@mail.example.com:465', ALERT_EMAIL_FROM: 'a@example.com', ALERT_EMAIL_TO: ['b@example.com'] }).configured).toBe(true);
  });
});
