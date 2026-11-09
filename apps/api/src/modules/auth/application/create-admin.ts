import { normalizeUsername } from '../domain/user.js';
import { validatePassword } from '../domain/password-policy.js';
import type { UserRepository } from './ports/user.repository.js';
import type { PasswordHasher } from './ports/password-hasher.js';
export class CreateAdmin { constructor(private readonly users: UserRepository, private readonly passwords: PasswordHasher) {} async execute(username: string, password: string, signal?: AbortSignal): Promise<void> { validatePassword(password); await this.users.upsertAdmin(normalizeUsername(username), await this.passwords.hash(password, signal), signal); } }
