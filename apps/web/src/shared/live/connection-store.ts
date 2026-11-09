import { createStore, useStore } from 'zustand';

export type ConnectionState =
  | { state: 'connecting' }
  | { state: 'live' }
  | { state: 'reconnecting'; attempt: number; nextAt: number }
  | { state: 'offline' }
  | { state: 'unauthorized' };

/** Connection status for the UI (FR-UI-8); written only by LiveClient. */
export const connectionStore = createStore<{ connection: ConnectionState }>(() => ({ connection: { state: 'connecting' } }));

export function setConnection(connection: ConnectionState): void { connectionStore.setState({ connection }); }

export function useConnection(): ConnectionState { return useStore(connectionStore, s => s.connection); }
