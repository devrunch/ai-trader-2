// Which Pine features does PineTS 0.13.1 actually run? One small script per feature.
import { PineTS } from 'pinets';
import { makeBars } from './data.mjs';

const bars = makeBars(400);
const v6 = (body) => `//@version=6\nindicator("t", overlay=true)\n${body}`;
const cases = {
  'plot/hline/fill/bgcolor': v6(`a = plot(ta.sma(close, 10))\nb = plot(ta.sma(close, 30))\nfill(a, b, color=color.new(color.blue, 80))\nhline(1000)\nbgcolor(close > open ? color.new(color.green, 90) : na)`),
  'plotshape/plotchar/barcolor': v6(`plotshape(ta.crossover(close, ta.sma(close, 20)), style=shape.triangleup)\nplotchar(close > open, char="•")\nbarcolor(close > open ? color.green : color.red)`),
  'plotcandle': v6(`plotcandle(open, high, low, close)`),
  'inputs (all types)': v6(`i1 = input.int(14, "len", minval=1, maxval=200, group="g")\ni2 = input.float(2.0, step=0.1)\ni3 = input.bool(true)\ni4 = input.string("EMA", options=["EMA","SMA"])\ni5 = input.color(color.red)\ni6 = input.source(close)\ni7 = input.timeframe("15")\ni8 = input.session("0915-1530")\ni9 = input.symbol("NSE:NIFTY")\ni10 = input.price(1000)\ni11 = input.time(timestamp("2024-01-01"))\ni12 = input.text_area("x")\nplot(i6)`),
  'var / varip': v6(`var float acc = 0.0\nacc += 1\nvarip int ticks = 0\nticks += 1\nplot(acc)`),
  'if/for/while/switch': v6(`float s = 0.0\nfor i = 0 to 9\n    s += close[i]\nint k = 0\nwhile k < 3\n    k += 1\nr = switch\n    close > open => 1\n    => -1\nplot(s / 10 + k + r)`),
  'for...in + arrays': v6(`a = array.from(1.0, 2.0, 3.0)\nfloat t = 0.0\nfor x in a\n    t += x\nplot(t)`),
  'map + matrix': v6(`m = map.new<string, float>()\nm.put("a", close)\nmx = matrix.new<float>(2, 2, 0)\nmx.set(0, 0, close)\nplot(m.get("a") + mx.get(0, 0))`),
  'UDT + methods': v6(`type P\n    float v\nmethod dbl(P this) => this.v * 2\np = P.new(close)\nplot(p.dbl())`),
  'user functions + tuples': v6(`f(x) =>\n    [x + 1, x - 1]\n[u, d] = f(close)\nplot(u - d)`),
  'label/line/box/table': v6(`if barstate.islast\n    label.new(bar_index, high, "hi")\n    line.new(bar_index - 10, low, bar_index, high)\n    box.new(bar_index - 5, high, bar_index, low)\n    t = table.new(position.top_right, 1, 1)\n    table.cell(t, 0, 0, "x")\nplot(close)`),
  'polyline/linefill': v6(`if barstate.islast\n    pts = array.new<chart.point>()\n    pts.push(chart.point.from_index(bar_index - 5, low))\n    pts.push(chart.point.from_index(bar_index, high))\n    polyline.new(pts)\n    l1 = line.new(bar_index - 5, low, bar_index, low)\n    l2 = line.new(bar_index - 5, high, bar_index, high)\n    linefill.new(l1, l2, color.new(color.blue, 80))\nplot(close)`),
  'ta: pivots/supertrend/vwap/dmi': v6(`ph = ta.pivothigh(5, 5)\n[st, dr] = ta.supertrend(3, 10)\nv = ta.vwap(hlc3)\n[dp, dm, adx] = ta.dmi(14, 14)\nplot(nz(ph) + st + v + adx)`),
  'alertcondition / alert': v6(`c = ta.crossover(close, ta.sma(close, 20))\nalertcondition(c, "x", "cross")\nif c\n    alert("cross", alert.freq_once_per_bar_close)\nplot(close)`),
  'strategy.*': `//@version=6\nstrategy("s", overlay=true)\nif ta.crossover(ta.sma(close, 10), ta.sma(close, 30))\n    strategy.entry("L", strategy.long)\nif ta.crossunder(ta.sma(close, 10), ta.sma(close, 30))\n    strategy.close("L")\nplot(strategy.equity)`,
  'timeframe/session/time builtins': v6(`plot(timeframe.in_seconds() + (session.ismarket ? 1 : 0) + hour + dayofweek)`),
  'request.security_lower_tf': v6(`a = request.security_lower_tf(syminfo.tickerid, "1", close)\nplot(array.size(a))`),
  'library import': `//@version=6\nindicator("t")\nimport TradingView/ta/7 as tvta\nplot(tvta.ao())`,
  'v5 script': `//@version=5\nindicator("v5")\nplot(ta.rsi(close, 14))`,
  'v4 script': `//@version=4\nstudy("v4")\nplot(rsi(close, 14))`,
};

let ok = 0;
for (const [name, code] of Object.entries(cases)) {
  try {
    const ctx = await new PineTS(bars.slice(), 'NSE:TEST', '1').run(code);
    const plots = Object.keys(ctx.plots).filter((k) => !k.startsWith('__'));
    console.log(`OK    ${name.padEnd(32)} plots: ${plots.length}`);
    ok++;
  } catch (e) {
    console.log(`FAIL  ${name.padEnd(32)} ${(e?.message ?? String(e)).split('\n')[0].slice(0, 110)}`);
  }
}
console.log(`${ok}/${Object.keys(cases).length} feature scripts ran`);
