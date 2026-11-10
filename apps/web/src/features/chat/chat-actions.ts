import { createContext, useContext } from 'react';
import type { Interval } from '@aitrader/contracts';

/** What the host screen lets an applied card do outside the chat. */
export interface ChatActions { openSymbol: (symbol: string, interval?: Interval) => void }
export const ChatActionsContext = createContext<ChatActions>({ openSymbol: () => { throw new Error('Opening symbols is not available on this screen'); } });
export const useChatActions = (): ChatActions => useContext(ChatActionsContext);
