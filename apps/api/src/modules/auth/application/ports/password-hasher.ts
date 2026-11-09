export interface PasswordHasher { hash(password: string, signal?: AbortSignal): Promise<string>; verify(hash: string, password: string, signal?: AbortSignal): Promise<boolean>; verifyDummy(password: string, signal?: AbortSignal): Promise<void> }
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
