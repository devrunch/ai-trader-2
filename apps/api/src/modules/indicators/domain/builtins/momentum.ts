import { numberInput } from '../inputs';
import { defineBuiltin, lengthInput, line, sourceInputDef } from './define';

const length = (values: Parameters<typeof numberInput>[0]): number => numberInput(values, 'length');
const pineHeader = (title: string, short: string, len: number, source: string | null): string => `//@version=6
indicator("${title}", "${short}")
length = input.int(${String(len)}, "Length", minval = 1)${source ? `\nsrc = input.source(${source}, "Source")` : ''}`;

export const CCI = defineBuiltin({
  id: 'cci', name: 'Commodity Channel Index', shortName: 'CCI', overlay: false, inputs: [lengthInput(20), sourceInputDef('hlc3')],
  plots: [line('cci', 'CCI', 'blue')],
  levels: [{ id: 'upper', title: 'Upper Band', value: 100 }, { id: 'middle', title: 'Middle Band', value: 0 }, { id: 'lower', title: 'Lower Band', value: -100 }],
  warmup: length, pine: `${pineHeader('Commodity Channel Index', 'CCI', 20, 'hlc3')}\nplot(ta.cci(src, length), "CCI")`,
});

export const MFI = defineBuiltin({
  id: 'mfi', name: 'Money Flow Index', shortName: 'MFI', overlay: false, inputs: [lengthInput(14)],
  plots: [line('mf', 'MF', 'violet')],
  levels: [{ id: 'upper', title: 'Overbought', value: 80 }, { id: 'middle', title: 'Middle Band', value: 50 }, { id: 'lower', title: 'Oversold', value: 20 }],
  warmup: values => length(values) + 1, pine: `${pineHeader('Money Flow Index', 'MFI', 14, null)}\nplot(ta.mfi(hlc3, length), "MF")`,
});

export const WILLIAMS_R = defineBuiltin({
  id: 'wpr', name: 'Williams %R', shortName: '%R', overlay: false, inputs: [lengthInput(14)], plots: [line('pr', '%R', 'violet')],
  levels: [{ id: 'upper', title: 'Upper Band', value: -20 }, { id: 'middle', title: 'Middle Band', value: -50 }, { id: 'lower', title: 'Lower Band', value: -80 }],
  warmup: length, pine: `${pineHeader('Williams %R', '%R', 14, null)}\nplot(ta.wpr(length), "%R")`,
});

export const ROC = defineBuiltin({
  id: 'roc', name: 'Rate Of Change', shortName: 'ROC', overlay: false, inputs: [lengthInput(9), sourceInputDef()], plots: [line('roc', 'ROC', 'blue')],
  levels: [{ id: 'zero', title: 'Zero Line', value: 0 }], warmup: values => length(values) + 1,
  pine: `${pineHeader('Rate Of Change', 'ROC', 9, 'close')}\nplot(ta.roc(src, length), "ROC")`,
});

export const MOMENTUM = defineBuiltin({
  id: 'mom', name: 'Momentum', shortName: 'MOM', overlay: false, inputs: [lengthInput(10), sourceInputDef()], plots: [line('mom', 'MOM', 'blue')],
  warmup: values => length(values) + 1, pine: `${pineHeader('Momentum', 'MOM', 10, 'close')}\nplot(ta.mom(src, length), "MOM")`,
});
