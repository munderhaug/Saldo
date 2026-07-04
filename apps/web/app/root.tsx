import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from 'react-router';
import type { LinksFunction } from 'react-router';
import { useEffect, useRef } from 'react';
import { t } from '~/copy';
// Self-hosted brand fonts (ADR 0026): Fraunces (display/peaks) + IBM Plex Sans (body/UI + tabular
// figures). Variable files, bundled by Vite — no external CDN (EU-resident, offline PWA).
import '@fontsource-variable/fraunces/index.css';
import '@fontsource-variable/ibm-plex-sans/index.css';
import './app.css';

export const links: LinksFunction = () => [
  { rel: 'manifest', href: '/manifest.webmanifest' },
  { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
  { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#ffffff" />
        <Meta />
        <Links />
      </head>
      <body className="bg-background text-foreground antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

// Root error boundary: a thrown loader/action error or an unmatched route renders here inside Layout.
export function ErrorBoundary() {
  const error = useRouteError();
  // Move focus to the error heading when this renders on a client transition, so a keyboard/
  // screen-reader user is taken to the message rather than left where the failed action was
  // (WCAG 2.4.3). `tabIndex={-1}` makes the heading programmatically focusable, never a tab stop.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const heading = isRouteErrorResponse(error)
    ? t('error.statusHeading', { status: error.status, statusText: error.statusText })
    : t('error.title');
  const message = isRouteErrorResponse(error)
    ? typeof error.data === 'string'
      ? error.data
      : t('error.requestFailed')
    : error instanceof Error
      ? error.message
      : t('error.unknown');

  return (
    <main className="mx-auto grid max-w-xl gap-3 p-6 sm:p-10">
      <h1 ref={headingRef} tabIndex={-1} className="font-serif text-2xl tracking-tight">
        {heading}
      </h1>
      <p className="text-muted-foreground">{message}</p>
    </main>
  );
}
