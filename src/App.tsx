import { lazy, Suspense, useEffect, useRef, useSyncExternalStore } from 'react';
import { Navigate, createHashRouter, RouterProvider } from 'react-router';
import { ServicesProvider } from './app/services';
import { SessionProvider } from './app/session';
import { ToastProvider } from './app/toast';
import { Logo, RequireAuth } from './components/layout/AppShell';
import { NotFound, RouteError, Root } from './app/routeParts';
import { PageLoading } from './components/ui/primitives';
import { DesignGallery } from './design/DesignGallery';
import { disposeRouter, getRouter } from './design/routerRegistry';
import { routingVariantFromHash, type RoutingVariant } from './design/variants';
import type { Services } from './services/types';
import { AccountPage } from './pages/AccountPage';
import { LoginPage, SignupPage } from './pages/AuthPages';
import { CalendarPage } from './pages/CalendarPage';
import { ComparePage } from './pages/ComparePage';
import { CourseLevel1Page, CoursesPage } from './pages/CoursePage';
import { DashboardPage } from './pages/DashboardPage';
import { HowItWorksPage } from './pages/HowItWorksPage';
import { ImportPage } from './pages/ImportPage';
import { LandingPage } from './pages/LandingPage';
import { PropertyPage } from './pages/PropertyPage';

const createOriginalRouter = () => createHashRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <LandingPage /> },
      { path: '/slik-fungerer-det', element: <HowItWorksPage /> },
      { path: '/logg-inn', element: <LoginPage /> },
      { path: '/registrer', element: <SignupPage /> },
      { path: '/glemt-passord', element: <Navigate to="/logg-inn" replace /> },
      // Designforslag (kun testing). Original = dagens ruter og utseende; Finance, Investment og Property har egne rutertrær under /design/finance, /design/investment og /design/property.
      { path: '/design', element: <DesignGallery /> },
      { path: '/design/original', element: <Navigate to="/" replace /> },
      {
        element: <RequireAuth />,
        errorElement: <RouteError />,
        children: [
          { path: '/oversikt', element: <DashboardPage /> },
          { path: '/objekter/:id', element: <PropertyPage /> },
          { path: '/kalender', element: <CalendarPage /> },
          { path: '/sammenligning', element: <ComparePage /> },
          { path: '/kurs', element: <CoursesPage /> },
          { path: '/kurs/flipping-privat', element: <CourseLevel1Page /> },
          { path: '/konto', element: <AccountPage /> },
          { path: '/import', element: <ImportPage /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

/** Finance, Investment og Property lastes først når variantene åpnes, så Original ikke blir tyngre. */
const FinanceApp = lazy(() => import('./design/finance/FinanceApp'));
const InvestmentApp = lazy(() => import('./design/investment/InvestmentApp'));
const PropertyApp = lazy(() => import('./design/property/PropertyApp'));

function OriginalApp() {
  return <RouterProvider router={getRouter('original', createOriginalRouter)} />;
}

const subscribeHash = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

/**
 * Velger rutertre ut fra adressen: `#/design/finance/...` åpner Finance, `#/design/investment/...` åpner Investment, `#/design/property/...` åpner Property, alt annet er Original. Ved bytte av variant
 * kastes den forrige ruteren (ikke i en effect-opprydding, så StrictMode ikke river den ned i utvikling).
 */
function RoutedApp() {
  const variant = useSyncExternalStore<RoutingVariant>(
    subscribeHash,
    () => routingVariantFromHash(window.location.hash),
    () => 'original',
  );
  const current = useRef(variant);
  useEffect(() => {
    const onChange = () => {
      const next = routingVariantFromHash(window.location.hash);
      if (next !== current.current) {
        disposeRouter(current.current);
        current.current = next;
      }
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  if (variant === 'finance') {
    return (
      <Suspense fallback={<PageLoading label="Laster Finance …" />}>
        <FinanceApp key="finance" />
      </Suspense>
    );
  }
  if (variant === 'investment') {
    return (
      <Suspense fallback={<PageLoading label="Laster Investment …" />}>
        <InvestmentApp key="investment" />
      </Suspense>
    );
  }
  if (variant === 'property') {
    return (
      <Suspense fallback={<PageLoading label="Laster Property …" />}>
        <PropertyApp key="property" />
      </Suspense>
    );
  }
  return <OriginalApp key="original" />;
}

export function App({ services }: { services: Services }) {
  return (
    <ServicesProvider services={services}>
      <SessionProvider>
        <ToastProvider>
          <RoutedApp />
        </ToastProvider>
      </SessionProvider>
    </ServicesProvider>
  );
}

export function NotConfigured() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <Logo />
      <h1 className="mt-6 text-xl font-semibold">Produksjonsbackend er ikke koblet til</h1>
      <p className="mt-2 text-sm text-slate-700">
        Appen er bygget i produksjonsmodus (VITE_FLIPPROM_MODE=production), men Supabase Auth (Google og e-postkode), database, Vipps og analyseagenten er ikke koblet til ennå. Demomodus og
        testkontroller er av i denne modusen. Se docs/integrasjoner.md.
      </p>
    </div>
  );
}
