import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { useHomePath, useServices } from '../../app/services';
import { useSession } from '../../app/session';
import { Logo } from '../layout/AppShell';
import { buttonClass } from '../ui/primitives';

/** Felles ramme for åpne sider (forside og «Slik fungerer det»). */
export function PublicLayout({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const services = useServices();
  const home = useHomePath();
  const cta = session ? home : '/logg-inn';
  return (
    <div className="bg-white">
      <header className="border-b border-slate-100">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <nav aria-label="Forside" className="flex items-center gap-1 text-sm">
            <NavLink to="/slik-fungerer-det" className={({ isActive }) => `px-3 py-2 hover:text-ink ${isActive ? 'font-semibold text-ink' : 'text-slate-700'}`}>
              Slik fungerer det
            </NavLink>
            <Link to={cta} className={buttonClass('primary', 'sm', 'ml-1')}>
              {session ? (home === '/oversikt' ? 'Til oversikten' : 'Til kontoen') : 'Logg inn'}
            </Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="border-t border-slate-100">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-xs text-slate-600 sm:flex-row sm:justify-between">
          <p>Flippsjekk er et analyseverktøy. Anslag er ikke pristilbud, verdivurdering, skatteråd eller budfullmakt.</p>
          <p>{services.demo ? 'Demoversjon – fiktive data.' : 'Tidlig produksjonsversjon: innlogging, profil, objektlisten og scenarioer er koblet til.'}</p>
        </div>
      </footer>
    </div>
  );
}
