// A still of the desk at work: 5-minute candles with the trade plan drawn on them and the analysts' notes beside it.
// Prices follow the desk's replayed RELIANCE call (11 Nov 2026, 11:30 IST): entry 1,335.4, stop 1,331.2, target 1,344.
const CANDLES: Array<[number, number, number, number]> = [
  [1322, 1325, 1320.5, 1324.2], [1324.2, 1327.8, 1323.4, 1327.1], [1327.1, 1328, 1324.9, 1325.6], [1325.6, 1330.2, 1325.1, 1329.6],
  [1329.6, 1333.4, 1328.8, 1332.7], [1332.7, 1334.1, 1330.6, 1331.2], [1331.2, 1336.8, 1330.9, 1336.1], [1336.1, 1340.5, 1335.2, 1339.8],
  [1339.8, 1343.9, 1338.7, 1343.1], [1343.1, 1347.4, 1341.9, 1346.2], [1346.2, 1346.9, 1341.3, 1342], [1342, 1343.2, 1338.4, 1339.1],
  [1339.1, 1340.1, 1335.6, 1336.4], [1336.4, 1338.2, 1333.4, 1334.6], [1334.6, 1336.9, 1333.9, 1336.2], [1336.2, 1337.4, 1334.8, 1335.4],
];
const W = 520; const H = 300; const LO = 1316; const HI = 1352;
const y = (p: number) => H - ((p - LO) / (HI - LO)) * H;
const STEP = 26;

function Level({ price, label, tone }: { price: number; label: string; tone: 'entry' | 'stop' | 'target' }) {
  const color = tone === 'stop' ? 'var(--down)' : tone === 'target' ? 'var(--up)' : 'var(--foreground)';
  return <g className="desk-level">
    <line x1="0" x2={W + 80} y1={y(price)} y2={y(price)} stroke={color} strokeWidth="1.2" strokeDasharray={tone === 'entry' ? '0' : '5 4'} opacity="0.85" />
    <rect x={W + 6} y={y(price) - 10} width="74" height="20" fill={color} opacity={tone === 'entry' ? 0.14 : 0.18} />
    <text x={W + 43} y={y(price) + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill={color} className="num">{label} {price.toFixed(1)}</text>
  </g>;
}

export function DeskPreview() {
  return <figure className="relative mx-auto w-full max-w-[640px]" aria-label="Example: the desk's trade plan on a RELIANCE 5-minute chart, with notes from the bull, the bear and the risk manager">
    <style>{`
      @keyframes desk-rise { from { transform: scaleY(0); } to { transform: scaleY(1); } }
      @keyframes desk-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      .desk-candle { transform-box: fill-box; transform-origin: bottom; animation: desk-rise 420ms cubic-bezier(.2,.7,.2,1) both; }
      .desk-level { animation: desk-fade 500ms ease-out both; animation-delay: 1.1s; }
      .desk-note { animation: desk-fade 500ms ease-out both; }
      @media (prefers-reduced-motion: reduce) { .desk-candle, .desk-level, .desk-note { animation: none; } }
    `}</style>
    <div className="border bg-panel p-4 shadow-[0_30px_80px_-40px_rgb(0_0_0/0.6)]">
      <div className="mb-3 flex items-baseline gap-3 text-sm">
        <span className="font-semibold">RELIANCE</span><span className="text-muted-foreground">NSE · 5m · as of 11 Nov, 11:30</span>
        <span className="ml-auto num text-up">1,335.4</span>
      </div>
      <svg viewBox={`0 0 ${String(W + 84)} ${String(H)}`} className="w-full" role="presentation">
        {[1320, 1330, 1340, 1350].map(p => <line key={p} x1="0" x2={W} y1={y(p)} y2={y(p)} stroke="var(--border)" strokeWidth="1" />)}
        {CANDLES.map(([o, h, l, c], i) => {
          const up = c >= o; const x = 14 + i * STEP; const color = up ? 'var(--up)' : 'var(--down)';
          return <g key={i} className="desk-candle" style={{ animationDelay: `${String(i * 45)}ms` }}>
            <line x1={x + 7} x2={x + 7} y1={y(h)} y2={y(l)} stroke={color} strokeWidth="1.3" />
            <rect x={x} y={y(Math.max(o, c))} width="14" height={Math.max(1.5, Math.abs(y(o) - y(c)))} fill={color} />
          </g>;
        })}
        <Level price={1344} label="Target" tone="target" />
        <Level price={1335.4} label="Entry" tone="entry" />
        <Level price={1331.2} label="Stop" tone="stop" />
      </svg>
    </div>
    <Note className="-left-4 top-16 sm:-left-10" delay="1.5s" who="Bull" tone="text-up">Pullback held the 5m EMA50 after a breakout on heavy volume.</Note>
    <Note className="-right-2 top-40 sm:-right-8" delay="1.9s" who="Bear" tone="text-down">India CPI lands at 16:00. A hot print can undo the move.</Note>
    <Note className="bottom-[-1.5rem] left-6 sm:left-16" delay="2.3s" who="Risk manager" tone="ai-text">Reward 2× risk. Size 0.5% of capital: 1,190 shares. Approved.</Note>
  </figure>;
}

function Note({ who, tone, delay, className, children }: { who: string; tone: string; delay: string; className: string; children: string }) {
  return <p className={`desk-note ai-border absolute max-w-[15rem] px-3 py-2 text-sm leading-snug shadow-lg ${className}`} style={{ animationDelay: delay }}>
    <span className={`block text-xs font-semibold ${tone}`}>{who}</span>{children}
  </p>;
}
