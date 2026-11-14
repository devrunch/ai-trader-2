import { describe, expect, it, vi } from 'vitest';
import { EmailReports } from './email-reports';

function setup(opts: { opted?: boolean; address?: string | null; configured?: boolean; gate?: boolean; sent?: 'sent' | 'failed' } = {}) {
  const prefs = { reports: vi.fn(() => Promise.resolve(opts.opted ?? true)), setReports: vi.fn(() => Promise.resolve()), address: vi.fn(() => Promise.resolve(opts.address === undefined ? 'a@b.com' : opts.address)) };
  const mailer = { configured: opts.configured ?? true, send: vi.fn(() => Promise.resolve(opts.sent ?? 'sent')) };
  const gate = { open: vi.fn(() => Promise.resolve(opts.gate ?? true)) };
  return { prefs, mailer, gate, email: new EmailReports(prefs, mailer, gate, 'https://app.test') };
}

describe('EmailReports (FR-HM-3 delivery)', () => {
  it('sends to the login email only when the user opted in', async () => {
    const { email, mailer } = setup();
    expect(await email.deliver('u1', 'Watch: INR', 'Rupee fell')).toBe('sent');
    expect(mailer.send).toHaveBeenCalledWith('a@b.com', 'Watch: INR', 'Rupee fell\n\nOpen the app: https://app.test');
    const off = setup({ opted: false });
    expect(await off.email.deliver('u1', 't', null)).toBe('off');
    expect(off.mailer.send).not.toHaveBeenCalled();
  });
  it('does not send without an address, without mail configured, or inside the rate window', async () => {
    expect(await setup({ address: null }).email.deliver('u1', 't', null)).toBe('no-address');
    expect(await setup({ configured: false }).email.deliver('u1', 't', null)).toBe('not-configured');
    const limited = setup({ gate: false });
    expect(await limited.email.deliver('u1', 't', null)).toBe('rate-limited');
    expect(limited.gate.open).toHaveBeenCalledWith('report-mail:u1', 600_000);
    expect(limited.mailer.send).not.toHaveBeenCalled();
  });
  it('reports a failed send', async () => {
    expect(await setup({ sent: 'failed' }).email.deliver('u1', 't', null)).toBe('failed');
  });
  it('needs an address to opt in, takes one given with the switch, and saves', async () => {
    await expect(setup({ address: null }).email.set('u1', true)).rejects.toThrow('Add the email address');
    const given = setup({ address: null });
    await given.email.set('u1', true, 'trader@example.com');
    expect(given.prefs.setReports).toHaveBeenCalledWith('u1', true, 'trader@example.com');
    const { email, prefs } = setup({ opted: false });
    await email.set('u1', true);
    expect(prefs.setReports).toHaveBeenCalledWith('u1', true, undefined);
    await setup({ address: null }).email.set('u1', false);
  });
  it('reports availability: needs mail configured and an address', async () => {
    expect(await setup({ configured: false }).email.get('u1')).toEqual({ reports: true, address: 'a@b.com', available: false });
  });
});
