import { cleanup, render, screen } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { afterEach, expect, it } from 'vitest';
import { MessageParts } from './message-parts';

afterEach(cleanup);
const done = (name: string) => ({ type: `tool-${name}`, toolCallId: name, state: 'output-available', input: {}, output: { ok: true, data: {} } });

it('folds the data the assistant looked at into one line instead of a card per lookup', () => {
  const parts = [done('getQuote'), done('getBars'), done('getNews'), done('calculate'), done('calculate'), done('loadTools'), { type: 'text', text: 'Here is the plan.' }] as unknown as UIMessage['parts'];
  render(<MessageParts parts={parts} role="assistant" />);
  expect(screen.getByText(/Checked price, chart, news, 2 calculations/)).toBeDefined();
  expect(screen.queryByText(/loadTools/)).toBeNull();
  expect(screen.getByText('Here is the plan.')).toBeDefined();
});
