import { createRoute } from '@tanstack/react-router';
import { SettingsPage } from '../../features/settings';
import { rootRoute } from './root-route';

export const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsPage });
