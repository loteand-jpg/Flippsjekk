import { Navigate, Outlet, createHashRouter, RouterProvider, Link, useRouteError } from 'react-router';
import { AnalyzeFlowProvider } from './app/analyzeFlow';
import { ServicesProvider } from './app/services';
import { SessionProvider } from './app/session';
import { ToastProvider } from './app/toast';
import { DemoFrame, Logo, RequireAuth } from './components/layout/AppShell';
import { Alert, buttonClass } from './components/ui/primitives';
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

function Root() {
  return (
    <AnalyzeFlowProvider>
      <DemoFrame>
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
