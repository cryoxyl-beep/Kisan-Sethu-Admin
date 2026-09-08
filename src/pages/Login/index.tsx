import { useState } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, AlertCircle, Leaf } from 'lucide-react';
import { FirebaseError } from 'firebase/app';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const navigate = useNavigate();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!import.meta.env.VITE_FIREBASE_API_KEY || !auth || !db) {
         throw new Error("Firebase configuration is missing. Please configure your .env file in the Settings panel.");
      }

      // 1. Log in with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      
      // 2. Verify admin profile exists and is active
      const adminDoc = await getDoc(doc(db, 'admins', userCredential.user.uid));
      
      if (!adminDoc.exists() || adminDoc.data().status !== 'active') {
        await signOut(auth); // Sign them back out immediately
        throw new Error("You do not have permission to access the admin dashboard.");
      }

      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof Error) {
        if (err instanceof FirebaseError) {
           switch (err.code) {
             case 'auth/invalid-credential':
             case 'auth/user-not-found':
             case 'auth/wrong-password':
               setError('Invalid email or password.');
               break;
             case 'auth/too-many-requests':
               setError('Too many failed attempts. Please try again later.');
               break;
             case 'auth/network-request-failed':
               setError('Network error. Please check your connection.');
               break;
             default:
               setError(`Authentication failed: ${err.message}`);
           }
        } else {
           setError(err.message);
        }
      } else {
        setError('An unexpected error occurred.');
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans text-gray-900">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-100 p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mb-4">
             <Leaf className="w-6 h-6 text-green-600" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Kissaan Sync</h1>
          <p className="text-sm text-gray-500 mt-1">Admin Portal</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-100 flex items-start gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors text-sm"
              placeholder="admin@kissaansync.local"
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors text-sm pr-10"
                placeholder="••••••••"
                disabled={loading}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 mt-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Signing In...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
