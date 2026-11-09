import { Navigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useSession } from './use-session';
export function RequireRole({ role, children }: { role: 'admin' | 'user'; children: ReactNode }) {
  const session = useSession();
  if (session.isPending) return <div role="status" aria-label="Loading session">Loading…</div>;
  if (session.isError) return <Navigate to="/login" search={{ redirect: window.location.pathname }} />;
  if (session.data.user.role !== role) return <div role="alert">You do not have permission to view this page.</div>;
  return children;
}
