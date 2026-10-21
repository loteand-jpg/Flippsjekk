import clsx from 'clsx';
import { CalendarDays, Columns3, GraduationCap, Home, LayoutGrid, LogOut, Palette, Plus, UserRound } from 'lucide-react';
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

export function PropLogo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 text-ink" aria-label="Flippsjekk – til forsiden">
      <span className="flex size-8 items-center justify-center rounded-lg bg-pine-700 text-white">
        <Home className="size-[18px]" strokeWidth={2} aria-hidden />
      </span>
      <span className="prop-serif text-[1.25rem] tracking-tight">Flippsjekk</span>
    </Link>
  );
}

const NAV = [
  { to: '/oversikt', label: 'Boliger', icon: LayoutGrid },
  { to: '/kalender', label: 'Kalender', icon: CalendarDays },
  { to: '/sammenligning', label: 'Sammenligning', icon: Columns3 },
  { to: '/kurs', label: 'Kurs', icon: GraduationCap },
  { to: '/konto', label: 'Konto', icon: UserRound },
];

/** Lenke tilbake til designgalleriet. Kun for testing av designforslagene. */
function GalleryLink({ className = 'inline-flex' }: { className?: string }) {
  return (
    <a href="#/design" className={clsx('items-center gap-1.5 text-xs', className)}>
      <Palette className="size-3.5" aria-hidden /> Designforslag
    </a>
  );
}

/** Offentlig layout (forside): lys topplinje, redaksjonelt fotavtrykk. */
export function PropPublicLayout() {
  const { session } = useSession();
  return (
    <div className="flex min-h-[calc(100dvh-2rem)] flex-col">
      <header className="border-b border-[var(--prop-line)] bg-[var(--prop-paper)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <PropLogo />
          <div className="flex items-center gap-4">
            <GalleryLink className="hidden text-slate-600 hover:underline sm:inline-flex" />
            <Link to={session ? '/oversikt' : '/logg-inn'} className="inline-flex h-11 items-center rounded-lg bg-pine-700 px-4 text-sm font-semibold whitespace-nowrap text-white hover:bg-pine-800">
              {session ? 'Til boligene' : 'Logg inn'}
            </Link>
          </div>
        </div>
      </header>
      <main id="innhold" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-[var(--prop-line)] bg-[var(--prop-sand-2)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-slate-700">
          <p>Flippsjekk er et beslutningsverktøy, ikke finans-, skatte- eller juridisk rådgivning. Demo med fiktive data.</p>
          <GalleryLink className="inline-flex text-slate-700 hover:underline" />
        </div>
      </footer>
    </div>
  );
}

export function PropRequireAuth() {
  const { ready, session } = useSession();
  const location = useLocation();
  if (!ready) return <PageLoading />;
  if (!session) return <Navigate to="/logg-inn" replace state={{ from: location.pathname }} />;
  return <PropShell />;
}

function PropShell() {
  const services = useServices();
  const { session, subscription, entitlements } = useSession();
  const navigate = useNavigate();
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const signOut = async () => {
    await services.auth.signOut();
    navigate('/');
  };
  const subText = subscription ? `${SUBSCRIPTION_STATUS_LABEL[subscription.status]}${entitlements?.reason === 'canceling' ? ` til ${formatDate(subscription.currentPeriodEnd)}` : ''}` : 'Uten abonnement';
  return (
    <div className="min-h-dvh pb-24 lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-[var(--prop-line)] bg-[var(--prop-paper)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--prop-paper)]/85" data-testid="prop-topbar">
        <div className="mx-auto flex h-14 max-w-[88rem] items-center gap-4 px-4 lg:h-16 lg:px-8">
          <PropLogo to="/oversikt" />
          <nav aria-label="Hovedmeny" className="ml-4 hidden flex-1 items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) => clsx('inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors', isActive ? 'bg-[var(--prop-sand)] text-ink' : 'text-slate-700 hover:bg-[var(--prop-sand-2)]')}
              >
                <n.icon className="size-4" aria-hidden />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => setAnalyzeOpen(true)} className="hidden min-h-11 items-center gap-2 rounded-lg bg-pine-700 px-4 text-sm font-semibold text-white hover:bg-pine-800 lg:inline-flex">
              <Plus className="size-4" aria-hidden /> Analyser bolig
            </button>
            <div className="hidden text-right text-xs leading-tight xl:block">
              <p className="max-w-40 truncate font-semibold">{session?.user.displayName}</p>
              <p className="text-slate-600">{subText}</p>
            </div>
            <GalleryLink className="hidden text-slate-600 hover:underline xl:inline-flex" />
            <button type="button" onClick={signOut} className="flex size-11 items-center justify-center rounded-lg text-slate-700 hover:bg-[var(--prop-sand)]" aria-label="Logg ut">
              <LogOut className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </header>
      <SubscriptionBanner />
      <main id="innhold" className="mx-auto max-w-[88rem] px-4 py-5 lg:px-8 lg:py-8">
        <Outlet />
      </main>

      {/* Mobil: bunnmeny med tydelig analyse-handling */}
      <nav aria-label="Hovedmeny (mobil)" data-testid="prop-bottomnav" className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--prop-line)] bg-[var(--prop-paper)] pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-[repeat(5,minmax(0,1fr))] items-stretch">
          {[NAV[0], NAV[1]].map((n) => (
            <MobileLink key={n.to} {...n} />
          ))}
          <div className="flex items-center justify-center">
            <button type="button" onClick={() => setAnalyzeOpen(true)} className="flex size-12 items-center justify-center rounded-full bg-pine-700 text-white shadow-lg hover:bg-pine-800" aria-label="Analyser bolig">
              <Plus className="size-6" strokeWidth={2.5} aria-hidden />
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

function MobileLink({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Home }) {
  return (
    <NavLink to={to} className={({ isActive }) => clsx('flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', isActive ? 'text-pine-700' : 'text-slate-600')}>
      <Icon className="size-5" aria-hidden />
      {label}
    </NavLink>
  );
}
