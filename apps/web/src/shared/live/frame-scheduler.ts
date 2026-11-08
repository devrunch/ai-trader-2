export interface FrameScheduler {
  schedule(callback: () => void): void;
}

export const rafScheduler: FrameScheduler = {
  schedule(callback) {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(callback);
    else setTimeout(callback, 16);
  },
};

export function createManualScheduler(): FrameScheduler & { flush(): void; readonly pending: number } {
  let callbacks: (() => void)[] = [];
  return {
    schedule(callback) { callbacks.push(callback); },
    flush() {
      const frame = callbacks;
      callbacks = [];
      for (const callback of frame) callback();
    },
    get pending() { return callbacks.length; },
  };
}
