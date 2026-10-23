import { useEffect } from 'react';
import { Navigate, Outlet, createHashRouter, RouterProvider, Link, useNavigate, useRouteError } from 'react-router';
import { AnalyzeFlowProvider } from './app/analyzeFlow';
import { ServicesProvider, useServices } from './app/services';
import { SessionProvider } from './app/session';
import { ToastProvider } from './app/toast';
import { DemoFrame, Logo, LogoMark, RequireAuth, RequireBackend } from './components/layout/AppShell';
import { Alert, buttonClass } from './components/ui/primitives';
import { supabaseConfigFromEnv } from './services/supabase/config';
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

/**
 * Retur fra Google (produksjon): leser utfallet som tjenesten fanget da siden ble lastet, og sender brukeren til innloggingssiden. Den viser
 * feilen (avbrutt innlogging) eller sender videre så snart sesjonen er på plass. Gjør ingenting i demoen (mocken har ingen omdirigering).
 */
function AuthReturn() {
  const services = useServices();
  const navigate = useNavigate();
  useEffect(() => {
    const r = services.auth.takeRedirectResult?.();
    if (!r) return;
    navigate('/logg-inn', { replace: true, state: r.kind === 'error' ? { authError: r.message } : { authReturned: true } });
  }, [services, navigate]);
  return null;
}

function Root() {
  return (
    <AnalyzeFlowProvider>
      <DemoFrame>
        <AuthReturn />
        <Outlet />
      </DemoFrame>
    </AnalyzeFlowProvider>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <Logo />
      <h1 className="mt-6 text-xl font-semibold">Siden finnes ikke</h1>
      <p className="mt-2 text-sm text-slate-600">Lenken kan være feil eller utdatert.</p>
      <Link to="/oversikt" className={buttonClass('primary', 'md', 'mt-6')}>
        Til oversikten
      </Link>
    </div>
  );
}

/** Feilgrense for ruter: viser en forståelig melding i stedet for hvit skjerm. */
function RouteError() {
  const err = useRouteError() as Error | undefined;
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <Alert tone="danger" title="Noe gikk galt på denne siden">
        <p>{err?.message ?? 'Ukjent feil.'}</p>
        <p>Prøv å laste siden på nytt. Hvis feilen gjentar seg i demoen, kan du tilbakestille demodata fra testkontrollene.</p>
      </Alert>
      <div className="mt-4 flex gap-2">
        <button type="button" className={buttonClass('primary')} onClick={() => window.location.reload()}>
          Last inn på nytt
        </button>
        <a href="#/oversikt" className={buttonClass('secondary')}>
          Til oversikten
        </a>
      </div>
    </div>
  );
}

const router = createHashRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <LandingPage /> },
      { path: '/slik-fungerer-det', element: <HowItWorksPage /> },
      { path: '/logg-inn', element: <LoginPage /> },
      { path: '/registrer', element: <SignupPage /> },
      { path: '/glemt-passord', element: <Navigate to="/logg-inn" replace /> },
      {
        element: <RequireAuth />,
        errorElement: <RouteError />,
        children: [
          // Konto fungerer med bare innlogging og profil. De øvrige sidene trenger backend-deler som ikke er koblet til i produksjon ennå:
          // da viser `RequireBackend` en forklaring i stedet for siden (i demoen slipper den alltid gjennom).
          { path: '/konto', element: <AccountPage /> },
          { element: <RequireBackend areas={['properties', 'scenarios', 'analysis']} />, children: [{ path: '/oversikt', element: <DashboardPage /> }] },
          {
            element: <RequireBackend areas={['properties', 'scenarios', 'comparables', 'risks', 'analysis', 'calendar']} />,
            children: [{ path: '/objekter/:id', element: <PropertyPage /> }],
          },
          { element: <RequireBackend areas={['properties', 'calendar']} />, children: [{ path: '/kalender', element: <CalendarPage /> }] },
          { element: <RequireBackend areas={['properties', 'scenarios']} />, children: [{ path: '/sammenligning', element: <ComparePage /> }] },
          {
            element: <RequireBackend areas={['courses']} />,
            children: [
              { path: '/kurs', element: <CoursesPage /> },
              { path: '/kurs/flipping-privat', element: <CourseLevel1Page /> },
            ],
          },
          { element: <RequireBackend areas={['imports']} />, children: [{ path: '/import', element: <ImportPage /> }] },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export function App({ services }: { services: Services }) {
  return (
    <ServicesProvider services={services}>
      <SessionProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </SessionProvider>
    </ServicesProvider>
  );
}

export function NotConfigured() {
  // Vises bare når produksjonsmodus mangler gyldig konfigurasjon. Viser årsaken; verdiene vises aldri, og ingenting kobles til Supabase her.
  const supabase = supabaseConfigFromEnv();
  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <LogoMark />
      <h1 className="mt-6 text-xl font-semibold">Produksjonsmodus mangler Supabase-konfigurasjon</h1>
      <p className="mt-2 text-sm text-slate-700">
        Appen er bygget i produksjonsmodus (VITE_FLIPPROM_MODE=production), men Supabase-URL og offentlig nøkkel mangler eller er ugyldige, så innlogging og profil kan ikke kobles til. Demomodus og
        testkontroller er av i denne modusen. Se docs/supabase.md og docs/integrasjoner.md.
      </p>
      <p className="mt-3 text-sm text-slate-700" data-testid="supabase-config-status">
        {supabase.ok ? 'Supabase-konfigurasjon (URL og offentlig nøkkel) er funnet.' : `Supabase-konfigurasjon mangler eller er ugyldig: ${supabase.problems.join(' ')}`}
      </p>
    </div>
  );
}
