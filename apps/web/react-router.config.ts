import type { Config } from '@react-router/dev/config';

export default {
  // Server-authoritative app: SSR on, loaders/actions are the client↔server boundary.
  ssr: true,
} satisfies Config;
