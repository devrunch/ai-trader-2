import { useEffect, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';

const SPEEDS = [1, 2, 5, 10] as const;
const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

export interface ReplayTarget {
  step(direction: 1 | -1): number | null;
  atEnd(): boolean;
  stop(): void;
}

/** Bar replay controls (TradingView-style): step back, play or pause at 1-10 bars a second, step forward, exit. */
export function ReplayControls({ target, at }: { target: ReplayTarget; at: number | null }) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [shown, setShown] = useState(at);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setShown(target.step(1));
      if (target.atEnd()) setPlaying(false);
    }, 1000 / speed);
    return () => { clearInterval(timer); };
  }, [playing, speed, target]);
  const button = 'grid size-7 place-items-center rounded hover:bg-muted';
  return <div role="toolbar" aria-label="Bar replay" className="pointer-events-auto flex items-center gap-1 rounded border bg-panel px-2 py-1 text-sm shadow">
    <span className="mr-1 font-semibold">Replay</span>
    <button type="button" aria-label="Step back" className={button} onClick={() => { setPlaying(false); setShown(target.step(-1)); }}><SkipBack className="size-4" /></button>
    <button type="button" aria-label={playing ? 'Pause' : 'Play'} className={button} onClick={() => { setPlaying(p => !p); }}>
      {playing ? <Pause className="size-4" /> : <Play className="size-4" />}</button>
    <button type="button" aria-label="Step forward" className={button} onClick={() => { setPlaying(false); setShown(target.step(1)); }}><SkipForward className="size-4" /></button>
    <select aria-label="Speed" className="h-6 border bg-panel px-1" value={speed} onChange={e => { setSpeed(Number(e.target.value) as (typeof SPEEDS)[number]); }}>
      {SPEEDS.map(s => <option key={s} value={s}>{s}x</option>)}
    </select>
    <span className="num min-w-28 text-muted-foreground">{shown === null ? '' : time.format(shown)}</span>
    <button type="button" aria-label="Exit replay" className={button} onClick={() => { setPlaying(false); target.stop(); }}><X className="size-4" /></button>
  </div>;
}
