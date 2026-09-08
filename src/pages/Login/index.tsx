import { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, AlertCircle, Leaf, CheckCircle2 } from 'lucide-react';
import { FirebaseError } from 'firebase/app';

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const navigate = useNavigate();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (!import.meta.env.VITE_FIREBASE_API_KEY || !auth || !db) {
         throw new Error("Firebase configuration is missing. Please configure your .env file in the Settings panel.");
      }

      if (isSignUp) {
        if (!fullName.trim()) throw new Error("Full name is required.");
        if (password !== confirmPassword) throw new Error("Passwords do not match.");
        if (password.length < 6) throw new Error("Password must be at least 6 characters.");

        // 1. Create account in Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        
        // 2. Create the admin profile in Firestore
        await setDoc(doc(db, 'admins', userCredential.user.uid), {
          uid: userCredential.user.uid,
          fullName: fullName.trim(),
          email: email.trim(),
          role: 'admin',
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        setSuccess("Admin account created successfully. Redirecting...");
        
        // Let the global auth listener navigate, but explicitly route to ensure flow
        setTimeout(() => {
           navigate('/', { replace: true });
        }, 1500);

      } else {
        // 1. Log in with Firebase Auth
        const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
        
        // 2. Verify admin profile exists and is active
        const adminDoc = await getDoc(doc(db, 'admins', userCredential.user.uid));
        
        if (!adminDoc.exists() || adminDoc.data().status !== 'active') {
          await signOut(auth); // Sign them back out immediately
          throw new Error("You do not have permission to access the admin dashboard.");
        }

        navigate('/', { replace: true });
      }
    } catch (err) {
      if (err instanceof Error) {
        if (err instanceof FirebaseError) {
           switch (err.code) {
             case 'auth/invalid-credential':
             case 'auth/user-not-found':
             case 'auth/wrong-password':
               setError('Invalid email or password.');
               break;
             case 'auth/email-already-in-use':
               setError('An account with this email already exists.');
               break;
             case 'auth/too-many-requests':
               setError('Too many failed attempts. Please try again later.');
               break;
             case 'auth/network-request-failed':
               setError('Network error. Please check your connection.');
               break;
             case 'auth/weak-password':
               setError('Password should be at least 6 characters.');
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

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setError(null);
    setSuccess(null);
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans text-gray-900">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-100 p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mb-4">
             <Leaf className="w-6 h-6 text-green-600" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Kissaan Sync</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isSignUp ? 'Create Admin Account' : 'Admin Portal'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-100 flex items-start gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-100 flex items-start gap-3 text-green-700">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm">{success}</p>
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-5">
          {isSignUp && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700" htmlFor="fullName">
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors text-sm"
                placeholder="Jane Doe"
                disabled={loading || !!success}
              />
            </div>
          )}

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
              disabled={loading || !!success}
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
                disabled={loading || !!success}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading || !!success}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {isSignUp && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700" htmlFor="confirmPassword">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors text-sm pr-10"
                  placeholder="••••••••"
                  disabled={loading || !!success}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={loading || !!success}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !!success}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 mt-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {isSignUp ? 'Creating Account...' : 'Signing In...'}
              </>
            ) : (
              isSignUp ? 'Create Admin Account' : 'Sign In'
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-100 text-center">
          <p className="text-sm text-gray-600">
            {isSignUp ? 'Already have an admin account?' : 'Need admin access?'}
            <button
              onClick={toggleMode}
              disabled={loading || !!success}
              className="ml-1 text-green-600 font-medium hover:text-green-700 disabled:opacity-50"
            >
              {isSignUp ? 'Sign in' : 'Create account'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
