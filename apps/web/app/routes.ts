import { type RouteConfig, index, route } from '@react-router/dev/routes';

// Loaders/actions in these route modules are the typed client↔server boundary (no separate API).
export default [
  index('routes/home.tsx'),
  route('oppslag', 'routes/oppslag.tsx'),
  route('auth/login', 'routes/auth.login.tsx'),
  route('auth/callback', 'routes/auth.callback.tsx'),
  route('auth/logout', 'routes/auth.logout.tsx'),
] satisfies RouteConfig;
