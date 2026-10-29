import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout, { NAV } from './Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Bookings from './pages/Bookings';
import Availability from './pages/Availability';
import { Pilots, Clients, Enquiries } from './pages/People';
import { Estimates, EstimateEditor } from './pages/Estimates';
import { Students, Batches, Certificates } from './pages/Training';
import { Fleet, Documents } from './pages/Assets';
import { Audit, Settings } from './pages/Admin';
import { Loading } from './ui';

const ROUTES = {
  '/': Dashboard, '/bookings': Bookings, '/availability': Availability, '/pilots': Pilots, '/fleet': Fleet,
  '/clients': Clients, '/enquiries': Enquiries, '/estimates': Estimates,
  '/students': Students, '/batches': Batches, '/certificates': Certificates,
  '/documents': Documents, '/audit': Audit, '/settings': Settings,
};

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>;
  const allowed = NAV.flatMap((g) => g.items).filter((i) => i.roles.includes(user.role)).map((i) => i.to);
  return (
    <Routes>
      <Route element={<Layout />}>
        {Object.entries(ROUTES).filter(([p]) => allowed.includes(p)).map(([p, C]) => <Route key={p} path={p} element={<C />} />)}
        {allowed.includes('/estimates') && <Route path="/estimates/:id" element={<EstimateEditor />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
