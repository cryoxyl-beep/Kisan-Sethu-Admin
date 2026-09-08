import { useState, useEffect, createContext, useContext } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, isConfigValid } from '@/lib/firebase';

export interface AdminProfile {
  uid: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
}

interface AuthContextType {
  user: User | null;
  adminProfile: AdminProfile | null;
  loading: boolean;
  configError: boolean;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  adminProfile: null, 
  loading: true, 
  configError: false 
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState(!isConfigValid);

  useEffect(() => {
    if (!isConfigValid || !auth || !db) {
      setLoading(false);
      setConfigError(true);
      return;
    }

    let unsubscribeProfile: (() => void) | undefined;

    try {
      const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = undefined;
        }

        if (currentUser) {
          setUser(currentUser);
          unsubscribeProfile = onSnapshot(doc(db, 'admins', currentUser.uid), (docSnap) => {
            if (docSnap.exists()) {
              setAdminProfile(docSnap.data() as AdminProfile);
            } else {
              setAdminProfile(null);
            }
            setLoading(false);
          }, (error) => {
            console.error("Error fetching admin profile:", error);
            setAdminProfile(null);
            setLoading(false);
          });
        } else {
          setUser(null);
          setAdminProfile(null);
          setLoading(false);
        }
      });

      return () => {
        unsubscribeAuth();
        if (unsubscribeProfile) {
          unsubscribeProfile();
        }
      };
    } catch (error) {
      console.error("Auth state error:", error);
      setConfigError(true);
      setLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, adminProfile, loading, configError }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
