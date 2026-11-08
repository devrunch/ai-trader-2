import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from './app';

// SRD §10.3; NFR-QL-1.
it('renders the root without crashing', async () => {
  render(<App />);
  expect((await screen.findByTestId('app-root')).textContent).toBe('AI Trader');
});
