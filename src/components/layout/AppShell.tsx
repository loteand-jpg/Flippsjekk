import clsx from 'clsx';
import { CalendarDays, Columns3, GraduationCap, House, LayoutDashboard, LogOut, Plus, UserRound } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { useServices } from '../../app/services';
import { useSession } from '../../app/session';
import { SUBSCRIPTION_STATUS_LABEL } from '../../domain/enums';
import { formatDate } from '../../lib/format';
import { AnalyzeBox } from '../property/AnalyzeBox';
import { Dialog } from '../ui/overlay';
import { Alert, PageLoading } from '../ui/primitives';
import { DemoBar, DemoControls } from './DemoControls';

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 font-semibold text-pine-900" aria-label="Flippsjekk – til forsiden">
      <span className="flex size-8 items-center justify-center rounded-lg bg-pine-800 text-white">
        <House className="size-4" aria-hidden />
      </span>
      <span className="text-lg tracking-tight">Flippsjekk</span>
    </Link>
  );
}

const NAV = [
  { to: '/oversikt', label: 'Oversikt', icon: LayoutDashboard },
  { to: '/kalender', label: 'Kalender', icon: CalendarDays },
  { to: '/sammenligning', label: 'Sammenligning', icon: Columns3 },
  { to: '/kurs', label: 'Kurs', icon: GraduationCap },
  { to: '/konto', label: 'Konto', icon: UserRound },
];

/** Demo-rammen (stripe + testkontroller) vises på alle sider når mocktjenestene brukes. */
export function DemoFrame({ children }: { children: ReactNode }) {
  const services = useServices();
  const [open, setOpen] = useState(false);
  const report = services.demo?.loadReport();
  return (
    <>
      {services.demo && <DemoBar onOpen={() => setOpen(true)} />}
      {report && (report.status === 'recovered' || report.status === 'repaired' || report.status === 'migrated') && <StorageNotice message={report.message} status={report.status} />}
      {children}
      {services.demo && <DemoControls open={open} onClose={() => setOpen(false)} />}
    </>
  );
}

function StorageNotice({ message, status }: { message: string | null; status: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="mx-auto max-w-7xl px-4 pt-3">
      <Alert
        tone={status === 'recovered' ? 'warning' : 'info'}
        title={status === 'recovered' ? 'Lokale demodata kunne ikke leses' : 'Lokale demodata er oppdatert'}
        action={
          <button type="button" className="text-sm font-medium underline" onClick={() => setHidden(true)}>
            Skjul
          </button>
        }
      >
        <p>
          {message} {status === 'recovered' ? 'En kopi av de gamle dataene er tatt vare på i nettleseren, og demoen startet med nye demodata.' : ''}
        </p>
      </Alert>
    </div>
  );
}

export function RequireAuth() {
  const { ready, session } = useSession();
  const location = useLocation();
  if (!ready) return <PageLoading />;
  if (!session) return <Navigate to="/logg-inn" replace state={{ from: location.pathname }} />;
  return <AppShell />;
}

export function SubscriptionBanner() {
  const { entitlements } = useSession();
  if (!entitlements || entitlements.access === 'full') return null;
  const text: Record<string, string> = {
    no_subscription: 'Du har ikke et aktivt abonnement. Du kan se og eksportere lagrede objekter, men ikke analysere nye eller lagre endringer.',
    past_due: 'Siste betaling gikk ikke gjennom. Lagrede data er tilgjengelige i lesemodus til betalingen er ordnet.',
    canceled: 'Abonnementet er avsluttet. Lagrede objekter og scenarioer er tatt vare på i lesemodus.',
    expired: 'Abonnementsperioden er utløpt. Lagrede data er tilgjengelige i lesemodus.',
    incomplete: 'Abonnementet er ikke fullført.',
  };
  return (
    <div className="mx-auto max-w-7xl px-4 pt-4">
      <Alert
        tone="warning"
        title="Lesemodus"
        action={
          <Link to="/konto" className="font-medium text-amber-950 underline">
            {entitlements.reason === 'past_due' ? 'Oppdater betaling' : 'Se abonnement'}
          </Link>
        }
      >
        {text[entitlements.reason] ?? 'Abonnementet gir ikke full tilgang nå.'}
      </Alert>
    </div>
  );
}

function AppShell() {
  const services = useServices();
  const { session, subscription, entitlements } = useSession();
  const navigate = useNavigate();
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const signOut = async () => {
    await services.auth.signOut();
    navigate('/');
  };
  return (
    <div className="min-h-dvh pb-20 lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
          <Logo to="/oversikt" />
          <nav aria-label="Hovedmeny" className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  clsx('flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-pine-50 text-pine-900' : 'text-slate-700 hover:bg-slate-100')
                }
              >
                <n.icon className="size-4" aria-hidden />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <div className="hidden text-right text-xs leading-tight sm:block">
              <p className="font-medium text-ink">{session?.user.displayName}</p>
              <p className="text-slate-600">
                {subscription ? `${SUBSCRIPTION_STATUS_LABEL[subscription.status]}${entitlements?.reason === 'canceling' ? ` til ${formatDate(subscription.currentPeriodEnd)}` : ''}` : 'Uten abonnement'}
              </p>
            </div>
            <button type="button" onClick={signOut} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-ink" aria-label="Logg ut">
              <LogOut className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </header>
      <SubscriptionBanner />
      <main id="innhold" className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>

      {/* Mobil: kompakt bunnmeny og lett tilgjengelig analyseknapp */}
      <nav aria-label="Hovedmeny (mobil)" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-6 items-end">
          {NAV.slice(0, 2).map((n) => (
            <MobileLink key={n.to} {...n} />
          ))}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setAnalyzeOpen(true)}
              className="-mt-5 flex size-14 flex-col items-center justify-center rounded-full bg-pine-800 text-white shadow-lg ring-4 ring-white"
              aria-label="Analyser bolig"
            >
              <Plus className="size-6" aria-hidden />
            </button>
          </div>
          {NAV.slice(2).map((n) => (
            <MobileLink key={n.to} {...n} label={n.label === 'Sammenligning' ? 'Sammenlign' : n.label} />
          ))}
        </div>
      </nav>
      <Dialog open={analyzeOpen} onClose={() => setAnalyzeOpen(false)} title="Analyser bolig" description="Lim inn lenken til en boligannonse på FINN.">
        <AnalyzeBox autoFocus onDone={() => setAnalyzeOpen(false)} />
      </Dialog>
    </div>
  );
}

function MobileLink({ to, label, icon: Icon }: { to: string; label: string; icon: typeof House }) {
  return (
    <NavLink to={to} className={({ isActive }) => clsx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-pine-900' : 'text-slate-600')}>
      <Icon className="size-5" aria-hidden />
      {label}
    </NavLink>
  );
}
