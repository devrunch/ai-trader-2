export type UserRole = 'admin' | 'user';
export interface User { id: string; username: string; role: UserRole; passwordHash: string; disabled: boolean; failedLogins: number; lockedUntil: Date | null }
export function normalizeUsername(value: string): string {
  const username = value.toLowerCase();
  if (username.length < 3 || username.length > 32 || !/^[a-z0-9_.-]+$/.test(username)) throw new Error('Invalid username');
  return username;
}
