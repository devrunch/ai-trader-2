import { createHash } from 'node:crypto';
import type { IndicatorDefinition } from '@aitrader/contracts';
import { PineUnsupportedError } from '../../domain/pine/pine-errors';
import { findUnsupported } from '../../domain/pine/pine-features';
import { buildPineDefinition } from '../../domain/pine/pine-definition';
import type { CandleSource } from '../../application/ports/candle-source';
import type { IndicatorInstance, IndicatorProgram, IndicatorRuntime, RuntimeContext } from '../../application/ports/indicator-runtime';
import type { ScriptInspector } from '../../application/ports/script-inspector';
import { failure } from './pine-failure';
import { PineInstance } from './pine-instance';
import type { PinePool } from './pine-pool';

const DEFINITIONS_KEPT = 64;

/** FR-IN-31: the second runtime behind the resolver; custom Pine runs on patched PineTS in the worker pool (FR-IN-29). */
export class PineRuntime implements IndicatorRuntime, ScriptInspector {
  readonly name = 'pine';
  private readonly definitions = new Map<string, IndicatorDefinition>();

  constructor(private readonly pool: PinePool, private readonly candles: CandleSource) {}

  supports(program: IndicatorProgram): boolean { return program.kind === 'pine'; }

  create(program: IndicatorProgram, context: RuntimeContext): IndicatorInstance {
    if (program.kind !== 'pine') throw new Error('PineRuntime runs Pine programs only');
    return new PineInstance(() => this.pool.acquire(), this.candles, program.source, program.inputs, context);
  }

  async inspect(source: string): Promise<IndicatorDefinition> {
    const hash = createHash('sha256').update(source).digest('hex').slice(0, 12);
    const cached = this.definitions.get(hash);
    if (cached) return cached;
    const unsupported = findUnsupported(source);
    if (unsupported) throw failure(new PineUnsupportedError(unsupported.feature, unsupported.line), source);
    const worker = this.pool.acquire();
    worker.instances++;
    try {
      const reply = await worker.request({ type: 'describe', source });
      if (reply.type !== 'meta') throw new Error('Unexpected reply from the Pine worker');
      const definition = buildPineDefinition(reply.meta, hash);
      if (this.definitions.size >= DEFINITIONS_KEPT) this.definitions.delete([...this.definitions.keys()][0] ?? '');
      this.definitions.set(hash, definition);
      return definition;
    } catch (error) {
      throw failure(error, source);
    } finally { worker.instances--; }
  }
}
