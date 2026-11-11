import type { EventEmitter } from 'node:events';

/**
 * pg's pool drops its own error listener while a client is checked out, so a connection that dies mid-use emits an
 * unhandled 'error' and crashes the process. Listen for it until release; a failed client is destroyed, not reused.
 */
export function watchCheckedOut(client: Pick<EventEmitter, 'on' | 'off'>): { failed: () => boolean; stop: () => void } {
  let failed = false;
  const onError = () => { failed = true; };
  client.on('error', onError);
  return { failed: () => failed, stop: () => { client.off('error', onError); } };
}
