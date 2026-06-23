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
import { t } from '~/copy';
import './app.css';

export const links: LinksFunction = () => [{ rel: 'manifest', href: '/manifest.webmanifest' }];

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
      <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
      <p className="text-muted-foreground">{message}</p>
    </main>
  );
}
