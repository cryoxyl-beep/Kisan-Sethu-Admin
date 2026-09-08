import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, adminProfile, loading, configError } = useAuth();

  if (configError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-4 max-w-md text-center p-6 bg-white rounded-xl shadow-sm border border-red-100 m-4">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Firebase Configuration Missing</h2>
          <p className="text-sm text-gray-500">
            Please configure your Firebase environment variables to continue. Check the `.env` setup instructions.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
          <p className="text-sm text-gray-500 font-medium">Authenticating Admin...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!adminProfile || adminProfile.status !== 'active') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-4 max-w-md text-center p-8 bg-white rounded-xl shadow-sm border border-red-100 m-4">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-2">
            <ShieldAlert className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Access Denied</h2>
          <p className="text-sm text-gray-600 mb-4">
            You do not have permission to access the admin dashboard. This account is either inactive or lacks administrator privileges.
          </p>
          <button 
            onClick={() => auth && signOut(auth)}
            className="px-6 py-2 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
