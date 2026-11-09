import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';

export function Dialog({ title, description, children, onClose }: { title: string; description: string; children: ReactNode; onClose: () => void }) {
  return <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onClose(); }}><DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/80" />
    <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[min(95vw,40rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-popover p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between"><DialogPrimitive.Title className="font-semibold">{title}</DialogPrimitive.Title><DialogPrimitive.Close aria-label={`Close ${title.toLowerCase()}`}>✕</DialogPrimitive.Close></div>
      <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal></DialogPrimitive.Root>;
}
