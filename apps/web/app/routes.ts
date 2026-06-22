import { type RouteConfig, index } from '@react-router/dev/routes';

// Loaders/actions in these route modules are the typed client↔server boundary (no separate API).
export default [index('routes/home.tsx')] satisfies RouteConfig;
