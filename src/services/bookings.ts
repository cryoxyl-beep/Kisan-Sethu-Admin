import { collection, query, onSnapshot, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Booking } from '@/types';

export function subscribeToRecentBookings(
  callback: (bookings: Booking[]) => void,
  onError: (error: Error) => void
) {
  // Query for the most recent 200 bookings. 
  // If the 'createdAt' index is missing in the existing Firebase project, 
  // we catch the error and fallback to an unordered query to prevent crashes.
  const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'), limit(200));
  
  return onSnapshot(q, (snapshot) => {
    const bookings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
    callback(bookings);
  }, (error) => {
    if (error.message.includes('index')) {
      console.warn('Missing index for createdAt. Falling back to unordered query.');
      const fallbackQ = query(collection(db, 'bookings'), limit(200));
      onSnapshot(fallbackQ, (fallbackSnap) => {
         const fallbackBookings = fallbackSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
         callback(fallbackBookings);
      }, onError);
    } else {
      onError(error);
    }
  });
}

export async function getAllBookings(): Promise<Booking[]> {
  try {
    const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'), limit(1000));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
  } catch (error: any) {
    if (error.message.includes('index')) {
        console.warn('Missing index for createdAt. Falling back to unordered query.');
        const fallbackQ = query(collection(db, 'bookings'), limit(1000));
        const fallbackSnap = await getDocs(fallbackQ);
        return fallbackSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
    }
    throw error;
  }
}
