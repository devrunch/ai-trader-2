export function validatePassword(password: string): void {
  if (password.length < 12) throw new Error('Password must be at least 12 characters');
}
