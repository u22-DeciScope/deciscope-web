import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";
import { useState } from "react";

import { AppSidebar } from "~/components/shared/navigation/AppSidebar";
import { AppMobileHeader } from "~/components/shared/navigation/AppMobileHeader";
import { AppMobileNavigation } from "~/components/shared/navigation/AppMobileNavigation";
import type { AppNavigationItemId } from "~/components/shared/navigation/navigationItems";
import { AuthenticatedLayoutProvider } from "~/context/AuthenticatedLayoutContext";
import { useAuthenticatedSession } from "~/hooks/useAuthenticatedSession";
import type { Route } from "./+types/root";
import "~/app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" data-theme="white">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var theme=localStorage.getItem("deciscope-theme")||"white";if(theme==="dark"||theme==="white"){document.documentElement.dataset.theme=theme;}}catch(e){}',
          }}
        />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const { pathname } = useLocation();

  if (!isWorkspacePath(pathname)) {
    return <Outlet />;
  }

  return <AuthenticatedLayout pathname={pathname} />;
}

function AuthenticatedLayout({ pathname }: { pathname: string }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { avatarLetter, displayEmail, displayName, handleLogout, today, user } = useAuthenticatedSession();
  const activeItem = activeNavigationItem(pathname);

  return (
    <AuthenticatedLayoutProvider today={today} user={user}>
      <div className="min-h-svh md:flex md:h-dvh md:gap-2 md:overflow-hidden md:p-2.25" style={{ background: "var(--ds-bg)" }}>
        <AppSidebar
          activeItem={activeItem}
          avatarLetter={avatarLetter}
          className="hidden md:flex"
          collapsed={sidebarCollapsed}
          displayEmail={displayEmail}
          displayName={displayName}
          photoUrl={user?.photoURL}
          onCollapsedChange={setSidebarCollapsed}
          onLogout={handleLogout}
        />
        <AppMobileHeader avatarLetter={avatarLetter} photoUrl={user?.photoURL} />
        <main className="min-w-0 p-2 pb-24 md:flex-1 md:overflow-hidden md:p-0">
          <Outlet />
        </main>
        <AppMobileNavigation activeItem={activeItem} />
      </div>
    </AuthenticatedLayoutProvider>
  );
}

function isWorkspacePath(pathname: string) {
  return pathname.startsWith("/w/");
}

function activeNavigationItem(pathname: string): AppNavigationItemId {
  if (pathname.includes("/meetings")) {
    return "meetings";
  }
  if (pathname.includes("/team")) {
    return "team";
  }
  if (pathname.includes("/reports")) {
    return "reports";
  }
  return "home";
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
