import { createRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { z } from 'zod';
import { DeskPage } from '../../features/desk';
import { rootRoute } from './root-route';

const searchSchema = z.object({ symbol: z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!-]+$/).catch('NSE:NIFTY') });

function DeskRoute() {
  const { symbol } = useSearch({ from: '/desk' });
  const navigate = useNavigate();
  return <DeskPage symbol={symbol} onSymbol={next => { void navigate({ to: '/desk', search: { symbol: next }, replace: true }); }} />;
}

export const deskRoute = createRoute({ getParentRoute: () => rootRoute, path: '/desk', validateSearch: (search) => searchSchema.parse(search), component: DeskRoute });
