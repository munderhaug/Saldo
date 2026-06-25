import { type RouteConfig, index, route } from '@react-router/dev/routes';

// Loaders/actions in these route modules are the typed client↔server boundary (no separate API).
export default [
  index('routes/home.tsx'),
  route('oppslag', 'routes/oppslag.tsx'),
  route('orgs', 'routes/orgs.tsx'),
  route('orgs/new', 'routes/orgs.new.tsx'),
  route('orgs/:orgId', 'routes/orgs.$orgId.tsx'),
  route('orgs/:orgId/contacts', 'routes/orgs.$orgId.contacts.tsx'),
  route('orgs/:orgId/contacts/new', 'routes/orgs.$orgId.contacts.new.tsx'),
  route('orgs/:orgId/contacts/:contactId', 'routes/orgs.$orgId.contacts.$contactId.tsx'),
  route('orgs/:orgId/products', 'routes/orgs.$orgId.products.tsx'),
  route('orgs/:orgId/products/new', 'routes/orgs.$orgId.products.new.tsx'),
  route('orgs/:orgId/products/:productId', 'routes/orgs.$orgId.products.$productId.tsx'),
  route('orgs/:orgId/vouchers/new', 'routes/orgs.$orgId.vouchers.new.tsx'),
  route('orgs/:orgId/receipts/new', 'routes/orgs.$orgId.receipts.new.tsx'),
  route('auth/login', 'routes/auth.login.tsx'),
  route('auth/callback', 'routes/auth.callback.tsx'),
  route('auth/logout', 'routes/auth.logout.tsx'),
] satisfies RouteConfig;
