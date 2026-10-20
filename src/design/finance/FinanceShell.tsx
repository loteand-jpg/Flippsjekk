import clsx from 'clsx';
import { CalendarDays, Columns3, GraduationCap, House, LayoutDashboard, LogOut, Palette, Plus, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { useServices } from '../../app/services';
import { useSession } from '../../app/session';
import { SubscriptionBanner } from '../../components/layout/AppShell';
import { AnalyzeBox } from '../../components/property/AnalyzeBox';
import { Dialog } from '../../components/ui/overlay';
import { PageLoading } from '../../components/ui/primitives';
import { SUBSCRIPTION_STATUS_LABEL } from '../../domain/enums';
import { formatDate } from '../../lib/format';

export function FinLogo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 text-ink" aria-label="Flippsjekk – til forsiden">
      <span className="flex size-8 items-center justify-center rounded-md bg-pine-800 text-white">
        <House className="size-[18px]" aria-hidden />
      </span>
      <span className="text-[1.0625rem] font-semibold tracking-tight">Flippsjekk</span>
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

/** Lenke tilbake til designgalleriet. Kun for testing av designforslagene. */
function GalleryLink({ className = 'inline-flex' }: { className?: string }) {
  return (
    <a href="#/design" className={clsx('items-center gap-1 text-xs text-slate-600 hover:text-ink hover:underline', className)}>
      <Palette className="size-3.5" aria-hidden /> Designforslag
    </a>
  );
}

/** Offentlig layout (forside). */
export function FinancePublicLayout() {
  const { session } = useSession();
  return (
    <div className="flex min-h-[calc(100dvh-2rem)] flex-col">
      <header className="border-b border-[var(--fin-line)] bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <FinLogo />
          <div className="flex items-center gap-4">
            <GalleryLink className="hidden sm:inline-flex" />
            <Link
              to={session ? '/oversikt' : '/logg-inn'}
              className="inline-flex h-11 items-center rounded-lg bg-pine-800 px-4 text-sm font-medium whitespace-nowrap text-white hover:bg-pine-900"
            >
              {session ? 'Til oversikten' : 'Logg inn'}
            </Link>
          </div>
        </div>
      </header>
      <main id="innhold" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-[var(--fin-line)] bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-slate-600">
          <p>Flippsjekk er et beslutningsverktøy, ikke finans-, skatte- eller juridisk rådgivning. Demo med fiktive data.</p>
          <GalleryLink />
        </div>
      </footer>
    </div>
  );
}

export function FinanceRequireAuth() {
  const { ready, session } = useSession();
  const location = useLocation();
  if (!ready) return <PageLoading />;
  if (!session) return <Navigate to="/logg-inn" replace state={{ from: location.pathname }} />;
  return <FinanceShell />;
}

function FinanceShell() {
  const services = useServices();
  const { session, subscription, entitlements } = useSession();
  const navigate = useNavigate();
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const signOut = async () => {
    await services.auth.signOut();
    navigate('/');
  };
  return (
    <div className="min-h-dvh pb-24 lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-[var(--fin-line)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-8">
            <FinLogo to="/oversikt" />
            <nav aria-label="Hovedmeny" className="hidden items-stretch gap-1 self-stretch lg:flex">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={({ isActive }) =>
                    clsx(
                      'relative flex items-center px-3 text-sm font-medium after:absolute after:inset-x-3 after:bottom-0 after:h-0.5',
                      isActive ? 'text-ink after:bg-pine-800' : 'text-slate-600 after:bg-transparent hover:text-ink',
                    )
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <GalleryLink className="hidden xl:inline-flex" />
            <div className="hidden text-right text-xs leading-tight sm:block">
              <p className="font-medium text-ink">{session?.user.displayName}</p>
              <p className="text-slate-600">
                {subscription ? `${SUBSCRIPTION_STATUS_LABEL[subscription.status]}${entitlements?.reason === 'canceling' ? ` til ${formatDate(subscription.currentPeriodEnd)}` : ''}` : 'Uten abonnement'}
              </p>
            </div>
            <button type="button" onClick={signOut} className="flex size-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-ink" aria-label="Logg ut">
              <LogOut className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </header>
      <SubscriptionBanner />
      <main id="innhold" className="mx-auto max-w-7xl px-4 py-6 lg:py-8">
        <Outlet />
      </main>

      {/* Mobil: bunnmeny med tydelig analyse-handling */}
      <nav aria-label="Hovedmeny (mobil)" className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--fin-line)] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5 items-stretch">
          {[NAV[0], NAV[1]].map((n) => (
            <MobileLink key={n.to} {...n} />
          ))}
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => setAnalyzeOpen(true)}
              className="flex size-12 items-center justify-center rounded-full bg-pine-800 text-white shadow-md hover:bg-pine-900"
              aria-label="Analyser bolig"
            >
              <Plus className="size-6" aria-hidden />
            </button>
          </div>
          <MobileLink {...NAV[2]} label="Sammenlign" />
          <MobileLink {...NAV[4]} />
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
    <NavLink
      to={to}
      className={({ isActive }) => clsx('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', isActive ? 'text-pine-800' : 'text-slate-600')}
    >
      <Icon className="size-5" aria-hidden />
      {label}
    </NavLink>
  );
}
