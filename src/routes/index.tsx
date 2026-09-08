import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import DashboardLayout from '@/layouts/DashboardLayout';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Placeholder from '@/components/Placeholder';

const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <DashboardLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Dashboard />,
      },
      {
        path: 'bookings',
        element: <Placeholder title="Bookings Management" />,
      },
      {
        path: 'queue',
        element: <Placeholder title="Queue Control" />,
      },
      {
        path: 'payments',
        element: <Placeholder title="Payment Processing" />,
      },
      {
        path: 'farmers',
        element: <Placeholder title="Farmer Directory" />,
      },
      {
        path: 'settings',
        element: <Placeholder title="System Settings" />,
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
