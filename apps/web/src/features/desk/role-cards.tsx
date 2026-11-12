import type { DeskArgument, DeskTrail } from '@aitrader/contracts';
import { percent } from './desk-format';

const ROLES = [['news', 'News'], ['technical', 'Technical'], ['macro', 'Macro / sentiment'], ['fundamentals', 'Fundamentals']] as const;
const stanceTone = { bullish: 'text-up', bearish: 'text-down', neutral: 'text-muted-foreground' } as const;

export function RoleCards({ reports }: { reports: DeskTrail['reports'] }) {
  return <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
    {ROLES.map(([key, title]) => {
      const report = reports[key];
      return <section key={key} aria-label={title} className="rounded border p-2">
        <h4 className="mb-1 font-semibold">{title}</h4>
        {'skipped' in report ? <p className="text-muted-foreground">Skipped: {report.skipped}</p> : <>
          <p><span className={`font-semibold ${stanceTone[report.stance]}`}>{report.stance}</span> <span className="num text-muted-foreground">{percent(report.confidence)} confidence</span></p>
          <p>{report.summary}</p>
          {report.evidence.length > 0 && <ul className="mt-1 list-disc pl-4 text-[11px] text-muted-foreground">{report.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        </>}
      </section>;
    })}
  </div>;
}

export function Debate({ debate }: { debate: DeskArgument[] }) {
  if (debate.length === 0) return <p className="text-muted-foreground">No debate: the run stopped before the bull and bear spoke.</p>;
  const rounds = [...new Set(debate.map(a => a.round))].sort((a, b) => a - b);
  return <div className="space-y-2">{rounds.map(round => <div key={round} className="space-y-1">
    <h5 className="text-[11px] text-muted-foreground">Round {round}</h5>
    {debate.filter(a => a.round === round).map(a => <div key={a.side} className={`max-w-[46rem] rounded border p-2 ${a.side === 'bull' ? '' : 'ml-6'}`}>
      <p className={`font-semibold ${a.side === 'bull' ? 'text-up' : 'text-down'}`}>{a.side === 'bull' ? 'Bull' : 'Bear'}</p>
      <p>{a.argument}</p>
      {a.keyPoints.length > 0 && <ul className="list-disc pl-4 text-[11px]">{a.keyPoints.map((p, i) => <li key={i}>{p}</li>)}</ul>}
      {a.rebuttal !== '' && <p className="mt-1 text-[11px] text-muted-foreground">Rebuttal: {a.rebuttal}</p>}
    </div>)}
  </div>)}</div>;
}
