const when = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

export const tone = (value: number | null): string => (value === null || value === 0 ? 'text-muted-foreground' : value > 0 ? 'text-up' : 'text-down');
export const price = (value: number | null): string => (value === null ? '—' : value.toFixed(2));
export const percent = (value: number | null): string => (value === null ? '—' : `${(value * 100).toFixed(0)}%`);
export const time = (iso: string): string => { const t = Date.parse(iso); return Number.isNaN(t) ? iso : `${when.format(t)} IST`; };
export const actionTone = (action: 'BUY' | 'SELL' | 'HOLD'): string => (action === 'BUY' ? 'text-up' : action === 'SELL' ? 'text-down' : 'text-muted-foreground');
