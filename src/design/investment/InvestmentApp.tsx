import { createHashRouter, Navigate, Outlet, RouterProvider } from 'react-router';
import { NotFound, Root, RouteError } from '../../app/routeParts';
import { AccountPage } from '../../pages/AccountPage';
import { LoginPage, SignupPage } from '../../pages/AuthPages';
import { CalendarPage } from '../../pages/CalendarPage';
import { ComparePage } from '../../pages/ComparePage';
import { CourseLevel1Page, CoursesPage } from '../../pages/CoursePage';
import { ImportPage } from '../../pages/ImportPage';
import { PropertyPage } from '../../pages/PropertyPage';
import { getRouter } from '../routerRegistry';
import { INVESTMENT_BASE } from '../variants';
import './inv.css';
import { InvestmentDashboard } from './InvestmentDashboard';
import { InvestmentHome } from './InvestmentHome';
import { InvestmentProperty } from './InvestmentProperty';
import { InvPublicLayout, InvRequireAuth } from './InvestmentShell';

/** Alle Investment-sider ligger inne i .inv, slik at designtokenene gjelder også delte sider og dialoger. */
function InvestmentTheme() {
  return (
    <div className="inv">
      <Outlet />
    </div>
  );
}

/**
 * Investment har eget rutertre med `basename` /design/investment (samme mønster som Finance). Dermed fungerer alle lenker i delte
 * sider (`<Link to="/oversikt">`, `navigate('/objekter/…')`) uendret og havner i Investment. Sider som ikke er redesignet
 * (kalender, sammenligning, konto, kurs, import) gjenbrukes med Investment-tokens.
 */
const createInvestmentRouter = () =>
  createHashRouter(
    [
      {
        element: <Root />,
        errorElement: <RouteError home={`#${INVESTMENT_BASE}/oversikt`} />,
        children: [
          {
            element: <InvestmentTheme />,
            children: [
              {
                element: <InvPublicLayout />,
                children: [
                  { path: '/', element: <InvestmentHome /> },
                  { path: '/slik-fungerer-det', element: <Navigate to="/" replace /> },
                ],
              },
              { path: '/logg-inn', element: <LoginPage /> },
              { path: '/registrer', element: <SignupPage /> },
              { path: '/glemt-passord', element: <Navigate to="/logg-inn" replace /> },
              {
                element: <InvRequireAuth />,
                errorElement: <RouteError home={`#${INVESTMENT_BASE}/oversikt`} />,
                children: [
                  { path: '/oversikt', element: <InvestmentDashboard /> },
                  { path: '/objekter/:id', element: <PropertyPage view={InvestmentProperty} /> },
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
        ],
      },
    ],
    { basename: INVESTMENT_BASE },
  );

export default function InvestmentApp() {
  return <RouterProvider router={getRouter('investment', createInvestmentRouter)} />;
}
