import { Link, Outlet, useRouteError } from 'react-router';
import { AnalyzeFlowProvider } from './analyzeFlow';
import { DemoFrame, Logo } from '../components/layout/AppShell';
import { Alert, buttonClass } from '../components/ui/primitives';

export function Root() {
  return (
    <AnalyzeFlowProvider>
      <DemoFrame>
        <Outlet />
      </DemoFrame>
    </AnalyzeFlowProvider>
  );
}

export function NotFound() {
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
export function RouteError({ home = '#/oversikt' }: { home?: string } = {}) {
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
        <a href={home} className={buttonClass('secondary')}>
          Til oversikten
        </a>
      </div>
    </div>
  );
}
