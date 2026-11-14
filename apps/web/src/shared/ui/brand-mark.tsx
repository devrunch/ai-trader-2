/** The mark: three candles whose last body is the agent's gradient. */
function BrandMark({ className = 'size-6' }: { className?: string }) {
  return <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={className}>
    <defs>
      <linearGradient id="brand-ai" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="var(--accent)" /><stop offset="0.5" stopColor="var(--link)" /><stop offset="1" stopColor="var(--accent)" />
      </linearGradient>
    </defs>
    <path d="M7 6v20" stroke="currentColor" strokeWidth="1.6" opacity="0.45" /><rect x="4.5" y="11" width="5" height="10" rx="1" fill="currentColor" opacity="0.45" />
    <path d="M16 3v23" stroke="currentColor" strokeWidth="1.6" opacity="0.7" /><rect x="13.5" y="8" width="5" height="12" rx="1" fill="currentColor" opacity="0.7" />
    <path d="M25 2v18" stroke="url(#brand-ai)" strokeWidth="1.6" /><rect x="22.5" y="4" width="5" height="12" rx="1" fill="url(#brand-ai)" />
  </svg>;
}

export function Wordmark({ className = '' }: { className?: string }) {
  return <span className={`inline-flex items-center gap-2 ${className}`}><BrandMark /><span className="font-display text-[15px] font-semibold tracking-tight">AI Trader</span></span>;
}
