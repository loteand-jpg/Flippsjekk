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
import { PROPERTY_BASE } from '../variants';
import './prop.css';
import { PropertyDashboard } from './PropertyDashboard';
import { PropertyHome } from './PropertyHome';
import { PropertyObject } from './PropertyObject';
import { PropPublicLayout, PropRequireAuth } from './PropertyShell';

/** Alle Property-sider ligger inne i .prop, slik at designtokenene gjelder også delte sider og dialoger. */
function PropertyTheme() {
  return (
    <div className="prop">
      <Outlet />
    </div>
  );
}

/**
 * Property har eget rutertre med `basename` /design/property (samme mønster som Finance og Investment). Dermed fungerer alle lenker i
 * delte sider (`<Link to="/oversikt">`, `navigate('/objekter/…')`) uendret og havner i Property. Sider som ikke er redesignet
 * (kalender, sammenligning, konto, kurs, import) gjenbrukes med Property-tokens.
 */
const createPropertyRouter = () =>
  createHashRouter(
    [
      {
        element: <Root />,
        errorElement: <RouteError home={`#${PROPERTY_BASE}/oversikt`} />,
        children: [
          {
            element: <PropertyTheme />,
            children: [
              {
                element: <PropPublicLayout />,
                children: [
                  { path: '/', element: <PropertyHome /> },
                  { path: '/slik-fungerer-det', element: <Navigate to="/" replace /> },
                ],
              },
              { path: '/logg-inn', element: <LoginPage /> },
              { path: '/registrer', element: <SignupPage /> },
              { path: '/glemt-passord', element: <Navigate to="/logg-inn" replace /> },
              {
                element: <PropRequireAuth />,
                errorElement: <RouteError home={`#${PROPERTY_BASE}/oversikt`} />,
                children: [
                  { path: '/oversikt', element: <PropertyDashboard /> },
                  { path: '/objekter/:id', element: <PropertyPage view={PropertyObject} /> },
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
    { basename: PROPERTY_BASE },
  );

export default function PropertyApp() {
  return <RouterProvider router={getRouter('property', createPropertyRouter)} />;
}
