import { createContext, useContext } from 'react';
import type { Drawing, Interval } from '@aitrader/contracts';

/** What the host screen lets an applied card do outside the chat. */
export interface ChatActions { openSymbol: (symbol: string, interval?: Interval) => void; addDrawing: (cardId: string, drawing: Drawing) => void }
const unavailable = (what: string) => () => { throw new Error(`${what} is not available on this screen`); };
export const ChatActionsContext = createContext<ChatActions>({ openSymbol: unavailable('Opening symbols'), addDrawing: unavailable('Drawing') });
export const useChatActions = (): ChatActions => useContext(ChatActionsContext);
