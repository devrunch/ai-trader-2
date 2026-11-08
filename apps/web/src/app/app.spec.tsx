import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from './app';

// SRD §10.3; NFR-QL-1.
it('renders the root without crashing', () => {
  render(<App />);
  expect(screen.getByTestId('app-root').textContent).toBe('AI Trader');
});
