import clsx from 'clsx';
import { CalendarDays, Columns3, GraduationCap, LayoutDashboard, LogOut, Palette, Plus, TrendingUp, UserRound } from 'lucide-react';
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

export function InvLogo({ to = '/', dark = true }: { to?: string; dark?: boolean }) {
  return (
    <Link to={to} className={clsx('flex items-center gap-2.5', dark ? 'text-white' : 'text-ink')} aria-label="Flippsjekk – til forsiden">
      <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-300 to-cyan-600 text-slate-950">
        <TrendingUp className="size-[18px]" strokeWidth={2.5} aria-hidden />
      </span>
      <span className="text-[1.0625rem] font-bold tracking-tight">Flippsjekk</span>
    </Link>
  );
}

const NAV = [
  { to: '/oversikt', label: 'Pipeline', icon: LayoutDashboard },
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

/** Offentlig layout (forside): mørk topplinje. */
export function InvPublicLayout() {
  const { session } = useSession();
  return (
    <div className="flex min-h-[calc(100dvh-2rem)] flex-col">
      <header className="bg-[var(--inv-dark)] text-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <InvLogo />
          <div className="flex items-center gap-4">
            <GalleryLink className="hidden text-slate-300 hover:text-white hover:underline sm:inline-flex" />
            <Link to={session ? '/oversikt' : '/logg-inn'} className="inline-flex h-11 items-center rounded-lg bg-cyan-300 px-4 text-sm font-semibold whitespace-nowrap text-slate-950 hover:bg-cyan-200">
              {session ? 'Til pipeline' : 'Logg inn'}
            </Link>
          </div>
        </div>
      </header>
      <main id="innhold" className="flex-1">
        <Outlet />
      </main>
      <footer className="bg-[var(--inv-dark)] text-slate-300">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs">
          <p>Flippsjekk er et beslutningsverktøy, ikke finans-, skatte- eller juridisk rådgivning. Demo med fiktive data.</p>
          <GalleryLink className="inline-flex text-slate-200 hover:underline" />
        </div>
      </footer>
    </div>
  );
}

export function InvRequireAuth() {
  const { ready, session } = useSession();
  const location = useLocation();
  if (!ready) return <PageLoading />;
  if (!session) return <Navigate to="/logg-inn" replace state={{ from: location.pathname }} />;
  return <InvShell />;
}

function InvShell() {
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
    <div className="min-h-dvh pb-24 lg:flex lg:pb-0">
      {/* Desktop: mørk sidestolpe */}
      <aside className="inv-rail hidden w-56 shrink-0 bg-[var(--inv-dark)] text-slate-200 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="px-4 pt-5 pb-4">
          <InvLogo to="/oversikt" />
        </div>
        <nav aria-label="Hovedmeny" className="flex-1 space-y-0.5 px-2">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                clsx(
                  'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                  isActive ? 'bg-white/10 text-white shadow-[inset_2px_0_0_#22d3ee]' : 'text-slate-300 hover:bg-white/5 hover:text-white',
                )
              }
            >
              <n.icon className="size-[18px]" aria-hidden />
              {n.label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setAnalyzeOpen(true)}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-3 text-sm font-semibold text-slate-950 hover:bg-cyan-200"
          >
            <Plus className="size-4" aria-hidden /> Analyser bolig
          </button>
        </nav>
        <div className="border-t border-white/10 px-4 py-4 text-xs">
          <p className="truncate font-semibold text-white">{session?.user.displayName}</p>
          <p className="text-slate-300">{subText}</p>
          <div className="mt-3 flex items-center justify-between">
            <GalleryLink className="inline-flex text-slate-300 hover:text-white hover:underline" />
            <button type="button" onClick={signOut} className="flex size-10 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Logg ut">
              <LogOut className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobil/nettbrett: mørk topplinje */}
        <header className="sticky top-0 z-30 bg-[var(--inv-dark)] text-white lg:hidden">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <InvLogo to="/oversikt" />
            <div className="flex items-center gap-1">
              <span className="hidden max-w-40 truncate text-xs text-slate-300 sm:block">{session?.user.displayName}</span>
              <button type="button" onClick={signOut} className="flex size-11 items-center justify-center rounded-lg text-slate-200 hover:bg-white/10" aria-label="Logg ut">
                <LogOut className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        </header>
        <SubscriptionBanner />
        <main id="innhold" className="mx-auto max-w-[88rem] px-4 py-5 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>

      {/* Mobil: mørk bunnmeny med tydelig analyse-handling */}
      <nav aria-label="Hovedmeny (mobil)" className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[var(--inv-dark)] pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-[repeat(5,minmax(0,1fr))] items-stretch">
          {[NAV[0], NAV[1]].map((n) => (
            <MobileLink key={n.to} {...n} />
          ))}
          <div className="flex items-center justify-center">
            <button type="button" onClick={() => setAnalyzeOpen(true)} className="flex size-12 items-center justify-center rounded-full bg-cyan-300 text-slate-950 shadow-lg hover:bg-cyan-200" aria-label="Analyser bolig">
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

function MobileLink({ to, label, icon: Icon }: { to: string; label: string; icon: typeof TrendingUp }) {
  return (
    <NavLink to={to} className={({ isActive }) => clsx('flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', isActive ? 'text-cyan-300' : 'text-slate-300')}>
      <Icon className="size-5" aria-hidden />
      {label}
    </NavLink>
  );
}
