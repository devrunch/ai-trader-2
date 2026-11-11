import type { Bar } from '@aitrader/contracts';
import type { IndicatorInstance, IndicatorProgram, IndicatorRuntime, PlotValues, RuntimeContext } from '../../application/ports/indicator-runtime';
import type { BarKernel, BarKernelFactory } from './bar-kernel';
import { CHANNEL_KERNELS } from './channel-kernels';
import { MOMENTUM_KERNELS } from './momentum-kernels';
import { MOVING_AVERAGE_KERNELS } from './moving-average-kernels';
import { OSCILLATOR_KERNELS } from './oscillator-kernels';
import { TREND_KERNELS } from './trend-kernels';
import { VOLATILITY_KERNELS } from './volatility-kernels';
import { VOLUME_KERNELS } from './volume-kernels';
import { pivotKernel } from './pivot-kernel';
import { vwapKernel } from './vwap-kernel';

const KERNELS: Readonly<Record<string, BarKernelFactory>> = {
  ...MOVING_AVERAGE_KERNELS, ...OSCILLATOR_KERNELS, ...VOLATILITY_KERNELS, ...TREND_KERNELS, ...CHANNEL_KERNELS, ...MOMENTUM_KERNELS, ...VOLUME_KERNELS,
  vwap: vwapKernel, pivots: pivotKernel,
};

/** Built-ins on trading-signals, wrapped to TradingView semantics (FR-IN-2). About a microsecond per update. */
export class NativeRuntime implements IndicatorRuntime {
  readonly name = 'native';

  supports(program: IndicatorProgram): boolean {
    return program.kind === 'builtin' && program.builtin.definition.id in KERNELS;
  }

  create(program: IndicatorProgram, context: RuntimeContext): IndicatorInstance {
    const factory = program.kind === 'builtin' ? KERNELS[program.builtin.definition.id] : undefined;
    if (!factory) throw new Error('The native runtime only runs its built-ins');
    return new NativeInstance(factory(program.inputs, context));
  }
}

class NativeInstance implements IndicatorInstance {
  constructor(private readonly kernel: BarKernel) {}
  seed(bars: readonly Bar[]): Promise<PlotValues[]> { return Promise.resolve(bars.map(bar => this.kernel.update(bar, false))); }
  update(bar: Bar, replace: boolean): Promise<PlotValues> { return Promise.resolve(this.kernel.update(bar, replace)); }
  close(): void { /* no resources */ }
}
