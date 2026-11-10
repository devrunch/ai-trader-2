import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PromptDefaults } from '../application/prompt-registry';

/** The reviewed default prompts shipped next to the code (`prompts/<key>.md`; copied to dist by nest-cli assets). */
export class FilePromptDefaults implements PromptDefaults {
  private readonly cache = new Map<string, string>();
  constructor(private readonly dir: string = join(__dirname, '..', 'prompts')) {}
  keys(): string[] {
    return existsSync(this.dir) ? readdirSync(this.dir).filter(name => name.endsWith('.md')).map(name => name.slice(0, -3)).sort() : [];
  }
  read(key: string): string | null {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(key)) return null;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const path = join(this.dir, `${key}.md`);
    if (!existsSync(path)) return null;
    const content = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
    this.cache.set(key, content);
    return content;
  }
}
