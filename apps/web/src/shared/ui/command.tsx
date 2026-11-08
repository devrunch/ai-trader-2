import { Command as CommandPrimitive } from 'cmdk';
import type { ComponentProps } from 'react';
import { cn } from './lib/cn';

export function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
  return <CommandPrimitive className={cn('flex flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground', className)} {...props} />;
}
export function CommandInput({ className, ...props }: ComponentProps<typeof CommandPrimitive.Input>) {
  return <CommandPrimitive.Input className={cn('h-12 w-full border-b bg-transparent px-3 outline-none placeholder:text-muted-foreground', className)} {...props} />;
}
export function CommandList({ className, ...props }: ComponentProps<typeof CommandPrimitive.List>) {
  return <CommandPrimitive.List className={cn('max-h-80 overflow-y-auto p-2', className)} {...props} />;
}
export function CommandItem({ className, ...props }: ComponentProps<typeof CommandPrimitive.Item>) {
  return <CommandPrimitive.Item className={cn('cursor-pointer rounded px-3 py-2 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground', className)} {...props} />;
}
export function CommandGroup(props: ComponentProps<typeof CommandPrimitive.Group>) {
  return <CommandPrimitive.Group className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-sm [&_[cmdk-group-heading]]:text-muted-foreground" {...props} />;
}
