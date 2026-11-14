import type { ReactNode } from 'react';
import type { Icon } from '@phosphor-icons/react';
import { cn } from './lib/cn';

/** A scrolling page body with the same measure as the public site. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className="min-h-0 flex-1 overflow-y-auto"><div className={cn('mx-auto w-full max-w-7xl min-w-0 space-y-4 px-3 py-5 md:px-6 md:py-7', className)}>{children}</div></div>;
}

/** Page title in the display face, a one-line purpose, and the page's main actions on the right. */
export function PageHeader({ icon: HeaderIcon, title, description, actions }: { icon?: Icon; title: string; description?: ReactNode; actions?: ReactNode }) {
  return <header className="flex flex-wrap items-end gap-x-6 gap-y-3 pb-1">
    <div className="min-w-0 flex-1 basis-72">
      <h1 className="font-display flex items-center gap-2.5 text-[1.75rem] font-semibold leading-tight tracking-tight">
        {HeaderIcon && <HeaderIcon weight="duotone" className="size-7 text-link" aria-hidden="true" />}{title}
      </h1>
      {description && <p className="mt-1.5 max-w-[70ch] text-base leading-relaxed text-muted-foreground">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>;
}

/** A titled section of a page. `ai` marks content the agent produced with its gradient hairline. */
export function Panel({ title, action, children, ai = false, className, bodyClassName }:
  { title?: ReactNode; action?: ReactNode; children: ReactNode; ai?: boolean; className?: string; bodyClassName?: string }) {
  return <section aria-label={typeof title === 'string' ? title : undefined} className={cn('min-w-0', ai ? 'ai-border' : 'border bg-panel', className)}>
    {(title !== undefined || action) && <header className="flex min-h-11 items-center justify-between gap-2 border-b px-4 py-2">
      {typeof title === 'string' ? <h2 className="text-base font-semibold">{title}</h2> : title}{action}
    </header>}
    <div className={cn('p-4 text-base leading-relaxed', bodyClassName)}>{children}</div>
  </section>;
}

/** A labelled form field with the label above, as on the sign-in page. */
export const fieldClass = 'h-9 w-full min-w-0 border bg-background px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30';
export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <label className={cn('flex min-w-0 flex-col gap-1 text-sm font-medium text-muted-foreground', className)}>{label}{children}</label>;
}
