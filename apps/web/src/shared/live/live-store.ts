import { rafScheduler, type FrameScheduler } from './frame-scheduler';

interface Subscription<T> {
  listener: (value: T) => void;
  active: boolean;
}

function subscribe<T>(subscriptions: Set<Subscription<T>>, listener: (value: T) => void): () => void {
  const subscription = { listener, active: true };
  subscriptions.add(subscription);
  return () => {
    subscription.active = false;
    subscriptions.delete(subscription);
  };
}

function notify<T>(subscriptions: readonly Subscription<T>[], value: T): void {
  for (const subscription of subscriptions) {
    if (!subscription.active) continue;
    try {
      subscription.listener(value);
    } catch (err) {
      queueMicrotask(() => { throw err; });
    }
  }
}

export class LiveStore<V> {
  private readonly values = new Map<string, V>();
  private dirty = new Set<string>();
  private readonly listeners = new Map<string, Set<Subscription<void>>>();
  private readonly allListeners = new Set<Subscription<ReadonlySet<string>>>();

  constructor(private readonly scheduler: FrameScheduler = rafScheduler) {}

  set(key: string, value: V): void {
    this.values.set(key, value);
    this.markDirty(key);
  }

  get(key: string): V | undefined {
    return this.values.get(key);
  }

  delete(key: string): void {
    this.values.delete(key);
    this.markDirty(key);
  }

  subscribe(key: string, listener: () => void): () => void {
    let subscriptions = this.listeners.get(key);
    if (!subscriptions) {
      subscriptions = new Set();
      this.listeners.set(key, subscriptions);
    }
    const unsubscribe = subscribe(subscriptions, listener);
    return () => {
      unsubscribe();
      if (subscriptions.size === 0 && this.listeners.get(key) === subscriptions) this.listeners.delete(key);
    };
  }

  subscribeAll(listener: (changed: ReadonlySet<string>) => void): () => void {
    return subscribe(this.allListeners, listener);
  }

  private markDirty(key: string): void {
    const needsFrame = this.dirty.size === 0;
    this.dirty.add(key);
    if (needsFrame) this.scheduler.schedule(this.flush);
  }

  private readonly flush = (): void => {
    const changed = this.dirty;
    this.dirty = new Set();
    // Snapshot every key and global listener before user callbacks can subscribe.
    const perKey = Array.from(changed, key => [...(this.listeners.get(key) ?? [])]);
    const all = [...this.allListeners];
    for (const subscriptions of perKey) notify(subscriptions, undefined);
    notify(all, changed);
  };
}
