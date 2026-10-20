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
import { FINANCE_BASE } from '../variants';
import './finance.css';
import { FinanceDashboard } from './FinanceDashboard';
import { FinanceHome } from './FinanceHome';
import { FinanceProperty } from './FinanceProperty';
import { FinancePublicLayout, FinanceRequireAuth } from './FinanceShell';

/** Alle Finance-sider ligger inne i .fin, slik at designtokenene gjelder også delte sider og dialoger. */
function FinanceTheme() {
  return (
    <div className="fin">
      <Outlet />
    </div>
  );
}

/**
 * Finance har eget rutertre med `basename` /design/finance. Dermed fungerer alle lenker i delte sider
 * (`<Link to="/oversikt">`, `navigate('/objekter/…')` osv.) uendret og havner i Finance.
 * Sider som ikke er redesignet (kalender, sammenligning, konto, kurs, import) gjenbrukes med Finance-tokens.
 */
const createFinanceRouter = () =>
  createHashRouter(
    [
      {
        element: <Root />,
        errorElement: <RouteError home={`#${FINANCE_BASE}/oversikt`} />,
        children: [
          {
            element: <FinanceTheme />,
            children: [
              {
                element: <FinancePublicLayout />,
                children: [
                  { path: '/', element: <FinanceHome /> },
                  { path: '/slik-fungerer-det', element: <Navigate to="/" replace /> },
                ],
              },
              { path: '/logg-inn', element: <LoginPage /> },
              { path: '/registrer', element: <SignupPage /> },
              { path: '/glemt-passord', element: <Navigate to="/logg-inn" replace /> },
              {
                element: <FinanceRequireAuth />,
                errorElement: <RouteError home={`#${FINANCE_BASE}/oversikt`} />,
                children: [
                  { path: '/oversikt', element: <FinanceDashboard /> },
                  { path: '/objekter/:id', element: <PropertyPage view={FinanceProperty} /> },
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
    { basename: FINANCE_BASE },
  );

export default function FinanceApp() {
  return <RouterProvider router={getRouter('finance', createFinanceRouter)} />;
}
