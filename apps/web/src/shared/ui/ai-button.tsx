import * as React from 'react';
import { Slot } from 'radix-ui';
import { Sparkles } from 'lucide-react';
import { cn } from './lib/cn';

type Size = 'sm' | 'md' | 'lg';
const SIZES: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-[12px] [&_svg]:size-3.5',
  md: 'h-9 gap-2 px-4 text-[13px] [&_svg]:size-4',
  lg: 'h-11 gap-2 px-5 text-[15px] [&_svg]:size-[18px]',
};

/** The one round, glowing control: every way into the agent uses it, so the agent is easy to find on any page. */
export function AiButton({ className, size = 'md', asChild = false, icon = true, children, ...props }:
  React.ComponentProps<'button'> & { size?: Size; asChild?: boolean; icon?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp data-slot="ai-button"
    className={cn('ai-button inline-flex shrink-0 items-center justify-center rounded-full font-semibold whitespace-nowrap outline-none',
      'focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--ai-3)_55%,transparent)] disabled:pointer-events-none disabled:opacity-60',
      SIZES[size], className)} {...props}>
    {asChild ? children : <>{icon && <Sparkles aria-hidden="true" />}{children}</>}
  </Comp>;
}
