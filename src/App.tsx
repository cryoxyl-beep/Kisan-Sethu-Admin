/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { AuthProvider } from './hooks/useAuth';
import { AppRouter } from './routes';

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
