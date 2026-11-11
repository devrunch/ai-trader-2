export type CompletionKind = 'function' | 'variable' | 'constant' | 'keyword';
export type Expectation = 'supported' | 'refused';

/** One feature and a tiny script that uses it; the spec runs the script and checks the outcome equals `expect`. */
export interface Probe {
  group: string;
  feature: string;
  /** Names offered to the editor when the feature runs. */
  names: readonly string[];
  kind: CompletionKind;
  detail: string;
  /** Statements placed between the indicator() header and a closing plot(close). */
  body: string;
  /** A whole script, for features that cannot sit under indicator(). */
  source?: string;
  expect: Expectation;
}

const probes: Probe[] = [];
const DRAWINGS = new Set(['label', 'line', 'box', 'table', 'linefill', 'polyline']);
const groupOf = (name: string): string => {
  const space = name.split('.')[0] ?? name;
  return DRAWINGS.has(space) ? 'drawings' : space.length > 0 && !name.includes('.') ? 'functions' : space;
};

/** `x = name(args)`; `prelude` declares what the call needs. */
function call(name: string, args: string, prelude = '', expect: Expectation = 'supported'): void {
  probes.push({ group: groupOf(name), feature: name, names: [name], kind: 'function', detail: `${name}(${args})`, body: `${prelude}\nx = ${name}(${args})`, expect });
}
/** A call used as a statement (plots, alerts, drawings). */
function stmt(group: string, name: string, args: string, prelude = '', expect: Expectation = 'supported'): void {
  probes.push({ group, feature: name, names: [name], kind: 'function', detail: `${name}(${args})`, body: `${prelude}\n${name}(${args})`, expect });
}
/** Names read as values; one row for the lot when they share a `label`. */
function values(group: string, kind: 'variable' | 'constant', names: readonly string[], detail: string, label?: string): void {
  const feature = label ?? names[0] ?? group;
  probes.push({ group, feature, names, kind, detail, body: names.map((n, i) => `v${String(i)} = ${n}`).join('\n'), expect: 'supported' });
}
function language(feature: string, body: string, names: readonly string[] = [], kind: CompletionKind = 'keyword', expect: Expectation = 'supported', source?: string): void {
  probes.push({ group: 'language', feature, names, kind, detail: 'keyword', body, expect, ...(source ? { source } : {}) });
}
function refuse(group: string, feature: string, body: string, source?: string): void {
  probes.push({ group, feature, names: [], kind: 'function', detail: '', body, expect: 'refused', ...(source ? { source } : {}) });
}

// ta: the functions PineTS 0.13.1 ships (dist/types/namespaces/ta).
const SRC = 'close';
for (const [name, args] of [
  ['alma', `${SRC}, 9, 0.85, 6`], ['atr', '14'], ['barssince', 'close > open'], ['bbw', `${SRC}, 20, 2`], ['cci', `${SRC}, 20`], ['change', SRC], ['cmo', `${SRC}, 9`],
  ['cog', `${SRC}, 10`], ['correlation', `${SRC}, open, 10`], ['cross', `${SRC}, open`], ['crossover', `${SRC}, open`], ['crossunder', `${SRC}, open`], ['cum', SRC],
  ['dev', `${SRC}, 10`], ['ema', `${SRC}, 14`], ['falling', `${SRC}, 3`], ['highest', `${SRC}, 5`], ['highestbars', `${SRC}, 5`], ['hma', `${SRC}, 9`], ['kcw', `${SRC}, 20, 2`],
  ['linreg', `${SRC}, 10, 0`], ['lowest', `${SRC}, 5`], ['lowestbars', `${SRC}, 5`], ['max', SRC], ['median', `${SRC}, 5`], ['mfi', `${SRC}, 14`], ['min', SRC], ['mode', `${SRC}, 5`],
  ['mom', `${SRC}, 5`], ['percentile_linear_interpolation', `${SRC}, 10, 50`], ['percentile_nearest_rank', `${SRC}, 10, 50`], ['percentrank', `${SRC}, 10`], ['pivothigh', '5, 5'],
  ['pivotlow', '5, 5'], ['range', `${SRC}, 10`], ['rising', `${SRC}, 3`], ['rma', `${SRC}, 14`], ['roc', `${SRC}, 9`], ['rsi', `${SRC}, 14`], ['sar', '0.02, 0.02, 0.2'], ['sma', `${SRC}, 14`],
  ['stdev', `${SRC}, 10`], ['stoch', `${SRC}, high, low, 14`], ['swma', SRC], ['tr', 'true'], ['tsi', `${SRC}, 5, 13`], ['valuewhen', 'close > open, close, 0'], ['variance', `${SRC}, 10`],
  ['vwap', SRC], ['vwma', `${SRC}, 10`], ['wma', `${SRC}, 10`], ['wpr', '14'], ['rci', `${SRC}, 10`],
] as const) call(`ta.${name}`, args);
for (const [name, args, count] of [['bb', `${SRC}, 20, 2`, 3], ['dmi', '14, 14', 3], ['kc', `${SRC}, 20, 2`, 3], ['macd', `${SRC}, 12, 26, 9`, 3], ['supertrend', '3, 10', 2]] as const) {
  const targets = Array.from({ length: count }, (_, i) => `t${String(i)}`).join(', ');
  probes.push({ group: 'ta', feature: `ta.${name}`, names: [`ta.${name}`], kind: 'function', detail: `ta.${name}(${args})`, body: `[${targets}] = ta.${name}(${args})`, expect: 'supported' });
}
call('ta.pivot_point_levels', '"Traditional", timeframe.change("D")', '', 'supported');
values('ta', 'variable', ['ta.accdist'], 'accumulation/distribution');
values('ta', 'variable', ['ta.iii'], 'intraday intensity index');
values('ta', 'variable', ['ta.nvi'], 'negative volume index');
values('ta', 'variable', ['ta.obv'], 'on balance volume');
values('ta', 'variable', ['ta.pvi'], 'positive volume index');
values('ta', 'variable', ['ta.pvt'], 'price-volume trend');
values('ta', 'variable', ['ta.wad'], 'Williams accumulation/distribution');
values('ta', 'variable', ['ta.wvad'], 'Williams variable accumulation/distribution');

for (const [name, args] of [
  ['abs', 'close'], ['acos', '0.5'], ['asin', '0.5'], ['atan', '0.5'], ['avg', 'close, open'], ['ceil', 'close'], ['cos', '1'], ['exp', '1'], ['floor', 'close'], ['log', 'close'], ['log10', 'close'],
  ['max', 'close, open'], ['min', 'close, open'], ['pow', 'close, 2'], ['random', '0, 1'], ['round', 'close, 1'], ['round_to_mintick', 'close'], ['sign', 'close'], ['sin', '1'], ['sqrt', 'close'],
  ['sum', 'close, 5'], ['tan', '1'], ['todegrees', '1'], ['toradians', '90'],
] as const) call(`math.${name}`, args);
values('math', 'constant', ['math.pi'], 'pi');
values('math', 'constant', ['math.e'], 'Euler number');
values('math', 'constant', ['math.phi'], 'golden ratio');
values('math', 'constant', ['math.rphi'], 'golden ratio conjugate');

for (const [name, args] of [
  ['int', '1, "Length"'], ['float', '1.5, "Factor"'], ['bool', 'true, "Flag"'], ['string', '"a", "Text"'], ['source', 'close, "Source"'], ['color', 'color.red, "Colour"'],
  ['price', '100.0, "Price"'], ['time', '1700000000000, "Time"'], ['timeframe', '"D", "Timeframe"'], ['symbol', '"NSE:X", "Symbol"'], ['session', '"0915-1530", "Session"'],
  ['text_area', '"a", "Notes"'],
] as const) call(`input.${name}`, args);
call('input.enum', 'Mode.a, "Mode"', 'enum Mode\n    a\n    b');
call('input.any', '1, "Any"');

for (const [name, args] of [
  ['tostring', 'close'], ['tonumber', '"1"'], ['lower', '"A"'], ['upper', '"a"'], ['trim', '" a "'], ['repeat', '"a", 3'], ['replace_all', '"aa", "a", "b"'], ['replace', '"aa", "a", "b", 0'],
  ['contains', '"abc", "b"'], ['endswith', '"abc", "c"'], ['startswith', '"abc", "a"'], ['pos', '"abc", "b"'], ['length', '"abc"'], ['match', '"abc", "b"'], ['split', '"a,b", ","'],
  ['substring', '"abc", 0, 2'], ['format', '"{0}", close'], ['format_time', 'time, "yyyy-MM-dd"'],
] as const) call(`str.${name}`, args);

const ARRAY = 'a = array.new_float(5, 1.0)\nb = array.new_float(5, 2.0)';
for (const [name, args] of [
  ['new_float', '3, 1.0'], ['new_int', '3, 1'], ['new_bool', '3, true'], ['new_string', '3, "a"'], ['new_color', '2, color.red'], ['new_label', '1'], ['new_line', '1'], ['new_box', '1'],
  ['new_table', '1'], ['new_linefill', '1'], ['from', '1.0, 2.0'],
] as const) call(`array.${name}`, args);
for (const [name, args] of [
  ['abs', 'a'], ['avg', 'a'], ['binary_search', 'a, 1.0'], ['binary_search_leftmost', 'a, 1.0'], ['binary_search_rightmost', 'a, 1.0'], ['concat', 'a, b'], ['copy', 'a'],
  ['covariance', 'a, b'], ['first', 'a'], ['get', 'a, 0'], ['includes', 'a, 1.0'], ['indexof', 'a, 1.0'], ['join', 'a, ","'], ['last', 'a'], ['lastindexof', 'a, 1.0'], ['max', 'a'],
  ['median', 'a'], ['min', 'a'], ['mode', 'a'], ['percentile_linear_interpolation', 'a, 50'], ['percentile_nearest_rank', 'a, 50'], ['percentrank', 'a, 0'], ['pop', 'a'], ['range', 'a'],
  ['remove', 'a, 0'], ['shift', 'a'], ['size', 'a'], ['slice', 'a, 0, 2'], ['sort_indices', 'a'], ['standardize', 'a'], ['stdev', 'a'], ['sum', 'a'], ['variance', 'a'],
] as const) call(`array.${name}`, args, ARRAY);
for (const [name, args] of [
  ['clear', 'a'], ['fill', 'a, 2.0'], ['insert', 'a, 0, 1.0'], ['push', 'a, 1.0'], ['reverse', 'a'], ['set', 'a, 0, 2.0'], ['sort', 'a'], ['unshift', 'a, 1.0'],
] as const) stmt('array', `array.${name}`, args, ARRAY);

const MAP = 'm = map.new<string, float>()\nmap.put(m, "k", 1.0)';
for (const [name, args] of [['contains', 'm, "k"'], ['copy', 'm'], ['get', 'm, "k"'], ['keys', 'm'], ['remove', 'm, "k"'], ['size', 'm'], ['values', 'm']] as const) call(`map.${name}`, args, MAP);
call('map.new', '', 'm = map.new<string, float>()');
stmt('map', 'map.put', 'm, "k", 2.0', MAP);
stmt('map', 'map.clear', 'm', MAP);
stmt('map', 'map.put_all', 'm, m', MAP);

const MATRIX = 'm = matrix.new<float>(2, 2, 1.0)';
/** Several calls in one script, one row: the functions share a family and a setup. */
function family(group: string, feature: string, calls: readonly string[], prelude: string, assign: boolean): void {
  const names = calls.map(c => c.slice(0, c.indexOf('(')).replace(/<.*>/, ''));
  const body = calls.map((c, i) => (assign ? `r${String(i)} = ${c}` : c)).join('\n');
  probes.push({ group, feature, names, kind: 'function', detail: calls[0] ?? feature, body: `${prelude}\n${body}`, expect: 'supported' });
}
family('matrix', 'matrix.new, get, rows, columns, row, col, copy, transpose, mult, sum, diff, det, inv, pinv, trace, rank, avg, min, max, median, mode, kron, pow, submatrix, concat, eigenvalues, eigenvectors, elements_count', [
  'matrix.new<float>(2, 2, 1.0)', 'matrix.get(m, 0, 0)', 'matrix.rows(m)', 'matrix.columns(m)', 'matrix.elements_count(m)', 'matrix.row(m, 0)', 'matrix.col(m, 0)', 'matrix.copy(m)', 'matrix.transpose(m)',
  'matrix.mult(m, m)', 'matrix.sum(m, m)', 'matrix.diff(m, m)', 'matrix.det(m)', 'matrix.inv(m)', 'matrix.pinv(m)', 'matrix.trace(m)', 'matrix.rank(m)', 'matrix.avg(m)', 'matrix.min(m)', 'matrix.max(m)',
  'matrix.median(m)', 'matrix.mode(m)', 'matrix.kron(m, m)', 'matrix.pow(m, 2)', 'matrix.submatrix(m, 0, 1, 0, 1)', 'matrix.concat(m, m)', 'matrix.eigenvalues(m)', 'matrix.eigenvectors(m)',
], MATRIX, true);
family('matrix', 'matrix.is_*', ['matrix.is_square(m)', 'matrix.is_symmetric(m)', 'matrix.is_identity(m)', 'matrix.is_zero(m)', 'matrix.is_diagonal(m)', 'matrix.is_binary(m)', 'matrix.is_stochastic(m)', 'matrix.is_triangular(m)', 'matrix.is_antidiagonal(m)', 'matrix.is_antisymmetric(m)'], MATRIX, true);
family('matrix', 'matrix.set, fill, add_row, add_col, remove_row, remove_col, reshape, reverse, sort, swap_rows, swap_columns', [
  'matrix.set(m, 0, 0, 2.0)', 'matrix.fill(m, 3.0)', 'matrix.add_row(m, 0, array.from(1.0, 2.0))', 'matrix.add_col(m, 0, array.from(1.0, 2.0, 3.0))', 'matrix.remove_row(m, 0)', 'matrix.remove_col(m, 0)',
  'matrix.reshape(m, 1, 2)', 'matrix.reverse(m)', 'matrix.sort(m)', 'matrix.swap_rows(m, 0, 0)', 'matrix.swap_columns(m, 0, 0)',
], MATRIX, false);

values('color', 'constant', ['color.aqua', 'color.black', 'color.blue', 'color.fuchsia', 'color.gray', 'color.green', 'color.lime', 'color.maroon', 'color.navy', 'color.olive', 'color.orange', 'color.purple', 'color.red', 'color.silver', 'color.teal', 'color.white', 'color.yellow'], 'named colour', 'color.<name>');
for (const [name, args] of [['new', 'color.red, 50'], ['rgb', '10, 20, 30'], ['from_gradient', 'close, 0, 100, color.red, color.green'], ['r', 'color.red'], ['g', 'color.red'], ['b', 'color.red'], ['t', 'color.red']] as const) call(`color.${name}`, args);

stmt('plotting', 'plot', 'close, "p", color.red, 2');
stmt('plotting', 'hline', '100, "h"');
stmt('plotting', 'plotshape', 'close > open, "s", shape.circle');
stmt('plotting', 'plotchar', 'close > open, "c", "x"');
stmt('plotting', 'plotarrow', 'close - open');
stmt('plotting', 'plotcandle', 'open, high, low, close');
stmt('plotting', 'plotbar', 'open, high, low, close');
stmt('plotting', 'bgcolor', 'color.new(color.red, 80)');
stmt('plotting', 'barcolor', 'color.red');
stmt('plotting', 'fill', 'p1, p2', 'p1 = plot(close)\np2 = plot(open)');
stmt('alerts', 'alert', '"x"');
stmt('alerts', 'alertcondition', 'close > open, "t", "m"');
probes.push({ group: 'alerts', feature: 'log.info', names: ['log.info'], kind: 'function', detail: 'log.info("x")', body: 'if barstate.islast\n    log.info("x")', expect: 'supported' });
probes.push({ group: 'alerts', feature: 'log.warning', names: ['log.warning'], kind: 'function', detail: 'log.warning("x")', body: 'if barstate.islast\n    log.warning("x")', expect: 'supported' });
probes.push({ group: 'alerts', feature: 'log.error', names: ['log.error'], kind: 'function', detail: 'log.error("x")', body: 'if barstate.islast\n    log.error("x")', expect: 'supported' });

call('label.new', 'bar_index, close, "t"');
stmt('drawings', 'label.set_text', 'l, "u"', 'l = label.new(bar_index, close, "t")');
stmt('drawings', 'label.delete', 'l', 'l = label.new(bar_index, close, "t")');
call('line.new', 'bar_index, close, bar_index + 1, close');
stmt('drawings', 'line.delete', 'l', 'l = line.new(bar_index, close, bar_index + 1, close)');
call('box.new', 'bar_index, high, bar_index + 1, low');
call('table.new', 'position.top_right, 2, 2');
stmt('drawings', 'table.cell', 't, 0, 0, "x"', 't = table.new(position.top_right, 2, 2)');
call('linefill.new', 'l1, l2', 'l1 = line.new(0, 1, 1, 1)\nl2 = line.new(0, 2, 1, 2)');
call('polyline.new', 'array.from(chart.point.now(close))');

for (const [name, args] of [['security', '"NSE:X", "15", close'], ['security_lower_tf', '"NSE:X", "1", close'], ['currency_rate', '"USD", "INR"']] as const) call(`request.${name}`, args);

values('variables', 'variable', ['open'], 'bar open');
values('variables', 'variable', ['high'], 'bar high');
values('variables', 'variable', ['low'], 'bar low');
values('variables', 'variable', ['close'], 'bar close');
values('variables', 'variable', ['volume'], 'bar volume');
values('variables', 'variable', ['hl2'], '(high + low) / 2');
values('variables', 'variable', ['hlc3'], '(high + low + close) / 3');
values('variables', 'variable', ['ohlc4'], '(open + high + low + close) / 4');
values('variables', 'variable', ['hlcc4'], '(high + low + close + close) / 4');
values('variables', 'variable', ['time'], 'bar open time');
values('variables', 'variable', ['time_close'], 'bar close time');
values('variables', 'variable', ['time_tradingday'], 'trading day start');
values('variables', 'variable', ['bar_index'], 'bar number');
values('variables', 'variable', ['last_bar_index'], 'last bar number');
values('variables', 'variable', ['last_bar_time'], 'last bar time');
values('variables', 'variable', ['timenow'], 'current time');
values('variables', 'variable', ['dayofmonth', 'dayofweek', 'hour', 'minute', 'month', 'second', 'weekofyear', 'year'], 'calendar of the bar', 'calendar variables');
values('variables', 'constant', ['na'], 'not available');
values('barstate', 'variable', ['barstate.isfirst', 'barstate.islast', 'barstate.isnew', 'barstate.isconfirmed', 'barstate.isrealtime', 'barstate.ishistory', 'barstate.islastconfirmedhistory'], 'bar state', 'barstate.<state>');
values('timeframe', 'variable', ['timeframe.period', 'timeframe.multiplier', 'timeframe.isdaily', 'timeframe.isintraday', 'timeframe.isminutes', 'timeframe.ismonthly', 'timeframe.isseconds', 'timeframe.isweekly', 'timeframe.isdwm'], 'chart timeframe', 'timeframe.<state>');
call('timeframe.in_seconds', '"15"');
call('timeframe.from_seconds', '900');
call('timeframe.change', '"D"');
values('syminfo', 'variable', ['tickerid', 'ticker', 'prefix', 'root', 'type', 'currency', 'basecurrency', 'mintick', 'pointvalue', 'session', 'timezone', 'description', 'volumetype', 'pricescale', 'minmove'].map(n => `syminfo.${n}`), 'symbol info', 'syminfo.<field>');
values('session', 'variable', ['session.isfirstbar', 'session.islastbar', 'session.ismarket', 'session.ispostmarket', 'session.ispremarket', 'session.isfirstbar_regular', 'session.islastbar_regular'], 'session state', 'session.<state>');
values('chart', 'variable', ['chart.bg_color', 'chart.fg_color', 'chart.is_standard', 'chart.is_heikinashi', 'chart.is_renko', 'chart.is_kagi', 'chart.is_linebreak', 'chart.is_pnf', 'chart.is_range'], 'chart type', 'chart.<state>');
values('constants', 'constant', ['dayofweek.sunday', 'dayofweek.monday', 'dayofweek.tuesday', 'dayofweek.wednesday', 'dayofweek.thursday', 'dayofweek.friday', 'dayofweek.saturday'], 'day of the week', 'dayofweek.<day>');
values('constants', 'constant', ['display.all', 'display.none', 'display.pane', 'display.data_window', 'display.status_line', 'display.price_scale'], 'plot display', 'display.<where>');
values('constants', 'constant', ['plot.style_line', 'plot.style_linebr', 'plot.style_stepline', 'plot.style_histogram', 'plot.style_columns', 'plot.style_area', 'plot.style_areabr', 'plot.style_circles', 'plot.style_cross'], 'plot style', 'plot.style_<style>');
values('constants', 'constant', ['shape.xcross', 'shape.cross', 'shape.circle', 'shape.triangleup', 'shape.triangledown', 'shape.flag', 'shape.arrowup', 'shape.arrowdown', 'shape.square', 'shape.diamond', 'shape.labelup', 'shape.labeldown'], 'shape', 'shape.<shape>');
values('constants', 'constant', ['location.abovebar', 'location.belowbar', 'location.top', 'location.bottom', 'location.absolute'], 'shape location', 'location.<where>');
values('constants', 'constant', ['size.auto', 'size.tiny', 'size.small', 'size.normal', 'size.large', 'size.huge'], 'label size', 'size.<size>');
values('constants', 'constant', ['position.top_left', 'position.top_center', 'position.top_right', 'position.middle_left', 'position.middle_center', 'position.middle_right', 'position.bottom_left', 'position.bottom_center', 'position.bottom_right'], 'table position', 'position.<where>');
values('constants', 'constant', ['line.style_solid', 'line.style_dotted', 'line.style_dashed', 'line.style_arrow_left', 'line.style_arrow_right', 'line.style_arrow_both'], 'line style', 'line.style_<style>');
values('constants', 'constant', ['hline.style_solid', 'hline.style_dotted', 'hline.style_dashed'], 'hline style', 'hline.style_<style>');
values('constants', 'constant', ['extend.none', 'extend.left', 'extend.right', 'extend.both'], 'line extension', 'extend.<how>');
values('constants', 'constant', ['label.style_none', 'label.style_label_up', 'label.style_label_down', 'label.style_label_left', 'label.style_label_right', 'label.style_label_center', 'label.style_circle', 'label.style_square', 'label.style_diamond', 'label.style_triangleup', 'label.style_triangledown', 'label.style_arrowup', 'label.style_arrowdown', 'label.style_text_outline'], 'label style', 'label.style_<style>');
values('constants', 'constant', ['format.inherit', 'format.price', 'format.volume', 'format.percent', 'format.mintick'], 'number format', 'format.<format>');
values('constants', 'constant', ['scale.left', 'scale.right', 'scale.none'], 'price scale', 'scale.<side>');
values('constants', 'constant', ['text.align_left', 'text.align_center', 'text.align_right', 'text.align_top', 'text.align_bottom', 'text.wrap_auto', 'text.wrap_none'], 'text alignment', 'text.<option>');

call('ticker.heikinashi', 'syminfo.tickerid');
call('ticker.new', '"NSE", "X"');
call('ticker.standard', 'syminfo.tickerid');
call('ticker.modify', 'syminfo.tickerid');
call('ticker.inherit', 'syminfo.tickerid, "NSE:Y"');
call('timestamp', '2024, 1, 1, 0, 0');
probes.push({ group: 'functions', feature: 'time()', names: [], kind: 'function', detail: 'time("15")', body: 'x = time("15")', expect: 'supported' });
probes.push({ group: 'functions', feature: 'year(time)', names: [], kind: 'function', detail: 'year(time)', body: 'x = year(time)', expect: 'supported' });
for (const [name, args] of [['nz', 'close, 0'], ['fixnan', 'close'], ['int', 'close'], ['float', 'close'], ['bool', 'close'], ['string', 'close'], ['color', 'color.red']] as const) {
  probes.push({ group: 'functions', feature: name, names: [name], kind: 'function', detail: `${name}(${args})`, body: `x = ${name}(${args})`, expect: 'supported' });
}

language('var', 'var x = 0.0\nx := x + 1', ['var']);
language('varip', 'varip x = 0.0\nx := x + 1', ['varip']);
language('if / else', 'x = 0.0\nif close > open\n    x := 1\nelse\n    x := 2', ['if', 'else']);
language('for / to / by', 's = 0.0\nfor i = 0 to 5 by 1\n    s += i', ['for', 'to', 'by']);
language('for ... in', 'a = array.from(1, 2)\ns = 0\nfor v in a\n    s += v', ['in']);
language('while', 'i = 0\nwhile i < 3\n    i += 1', ['while']);
language('switch', 'x = switch\n    close > open => 1\n    => 2', ['switch']);
language('break / continue', 's = 0\nfor i = 0 to 5\n    if i == 2\n        continue\n    if i == 4\n        break\n    s += i', ['break', 'continue']);
language('true / false', 'x = true and false or not true', ['true', 'false', 'and', 'or', 'not'], 'constant');
language('user function', 'f(a) => a * 2\nx = f(close)');
language('multi-line user function', 'f(a) =>\n    b = a * 2\n    b + 1\nx = f(close)');
language('tuple return', 'f() => [close, open]\n[a, b] = f()');
language('series history ([n])', 'x = close[1] + high[2]');
language('history of an expression', 'x = (close + open)[1]');
language('ternary', 'x = close > open ? 1 : 2');
language('type (user-defined)', 'type P\n    float x\np = P.new(1.0)\ny = p.x', ['type']);
language('method', 'method double(float this) =>\n    this * 2\nx = close.double()', ['method']);
language('enum', 'enum Mode\n    a\n    b\nx = Mode.a', ['enum']);
language('generics (array.new<float>)', 'a = array.new<float>(3, 1.0)');
language('string concatenation', 'x = "a" + str.tostring(close)');
language('indicator() options', '', [], 'keyword', 'supported', '//@version=5\nindicator("p", overlay=true, precision=2, max_bars_back=100)\nplot(close)');
language('Pine v6', '', [], 'keyword', 'supported', '//@version=6\nindicator("p")\nplot(close)');
language('input in a function', 'f() => input.int(1, "n")\nx = f()', [], 'keyword', 'supported');
language('request.security tuple', 'x = request.security("NSE:X", "15", [close, open])');
language('request.security with expression', 'x = request.security("NSE:X", "15", ta.sma(close, 5))');

refuse('strategy', 'strategy()', '', '//@version=5\nstrategy("s")\nplot(close)');
for (const [name, args] of [['entry', '"l", strategy.long'], ['exit', '"x", "l"'], ['close', '"l"'], ['close_all', ''], ['order', '"o", strategy.long'], ['cancel', '"l"']] as const) refuse('strategy', `strategy.${name}`, `strategy.${name}(${args})`);
refuse('strategy', 'strategy.position_size', 'x = strategy.position_size');
refuse('strategy', 'strategy.equity', 'x = strategy.equity');
refuse('strategy', 'strategy.netprofit', 'x = strategy.netprofit');
refuse('library', 'library()', '', '//@version=5\nlibrary("l")\nexport f(x) => x');
refuse('library', 'import', '', '//@version=5\nindicator("x")\nimport TradingView/ta/7 as t\nplot(close)');
refuse('language', 'Pine v4', '', '//@version=4\nstudy("t")\nplot(close)');
refuse('language', 'Pine v3', '', '//@version=3\nstudy("t")\nplot(close)');
for (const name of ['financial', 'earnings', 'dividends', 'splits', 'economic', 'quandl', 'seed']) refuse('request', `request.${name}`, `x = request.${name}("a", "b", "c")`);

/** Every probe, in declaration order. */
export const PROBES: readonly Probe[] = probes;
