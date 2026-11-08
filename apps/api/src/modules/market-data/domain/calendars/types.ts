export interface SessionWindow { open: number; close: number }

export interface MarketCalendar {
  readonly id: string;
  readonly timezone: string;
  sessionsOn(date: string): SessionWindow[];
  isOpen(at: number): boolean;
  nextOpen(at: number): number | null;
  sessionContaining(at: number): SessionWindow | null;
}
