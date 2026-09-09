import { collection, query, onSnapshot, getDocs, limit, orderBy, doc, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Booking } from '@/types';

export async function checkInBooking(bookingId: string, adminUid: string): Promise<void> {
  const bookingRef = doc(db, 'bookings', bookingId);
  
  await runTransaction(db, async (transaction) => {
    const bookingDoc = await transaction.get(bookingRef);
    if (!bookingDoc.exists()) {
      throw new Error("Booking does not exist.");
    }
    
    const data = bookingDoc.data();
    const currentStatus = (data.status || '').toUpperCase().trim();
    
    if (currentStatus === 'CHECKED_IN') {
      throw new Error("ALREADY_CHECKED_IN");
    }
    if (currentStatus !== 'CONFIRMED') {
      throw new Error("NOT_CONFIRMED");
    }
    
    // Determine the centre ID and date for the queue
    const centreId = data.centreId || 'UNKNOWN_CENTRE';
    const centreName = data.centreName || 'Unknown Centre';
    
    // Get current date in IST for queueDate (YYYY-MM-DD)
    const now = new Date();
    // Adjust to IST (UTC+5:30)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const dateStr = istDate.toISOString().split('T')[0];
    
    // Reference for the counter document
    const counterId = `${centreId}_${dateStr}`;
    const counterRef = doc(db, 'queueCounters', counterId);
    
    // Read the counter document
    const counterDoc = await transaction.get(counterRef);
    let lastTokenNumber = 0;
    if (counterDoc.exists()) {
      lastTokenNumber = counterDoc.data().lastTokenNumber || 0;
    }
    
    // Calculate new token
    const newTokenNumber = lastTokenNumber + 1;
    
    // Format a human-readable prefix based on the centre name
    const prefixMatch = centreName.match(/\b([A-Z])/g);
    const prefix = prefixMatch ? prefixMatch.join('').substring(0, 2).toUpperCase() : 'QC';
    const tokenLabel = `${prefix}-${newTokenNumber.toString().padStart(3, '0')}`;
    
    // Prepare the new queue entry document
    // Using bookingId as the queueEntry document ID ensures 1:1 idempotency per booking
    const queueEntryRef = doc(db, 'queueEntries', bookingId);
    
    // Partially update the booking
    transaction.update(bookingRef, {
      status: 'CHECKED_IN',
      updatedAt: serverTimestamp(),
      checkedInAt: serverTimestamp(),
      checkedInBy: adminUid,
      queueToken: tokenLabel
    });
    
    // Update or create the counter
    transaction.set(counterRef, {
      centreId,
      date: dateStr,
      lastTokenNumber: newTokenNumber,
      updatedAt: serverTimestamp()
    }, { merge: true });
    
    // Create the queue entry
    transaction.set(queueEntryRef, {
      bookingId: bookingId,
      trackingId: data.trackingId || '',
      farmerId: data.farmerId || '',
      farmerName: data.farmerName || 'Unknown Farmer',
      centreId: centreId,
      centreName: centreName,
      tokenNumber: newTokenNumber,
      tokenLabel: tokenLabel,
      status: 'CHECKED_IN',
      queueDate: dateStr,
      checkInTime: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
}

export async function getBookingByTrackingId(trackingId: string): Promise<Booking | null> {
  // We check if the trackingId is actually the document ID, or if it matches the trackingId field.
  const q = query(collection(db, 'bookings'), where('trackingId', '==', trackingId), limit(1));
  const snapshot = await getDocs(q);
  
  if (!snapshot.empty) {
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as Booking;
  }
  
  // Fallback: Check if it's actually the document ID
  const docRef = doc(db, 'bookings', trackingId);
  try {
    const docSnap = await getDocs(query(collection(db, 'bookings'), where('__name__', '==', trackingId)));
    if (!docSnap.empty) {
      const bDoc = docSnap.docs[0];
      return { id: bDoc.id, ...bDoc.data() } as Booking;
    }
  } catch (e) {
    // Ignore error
  }
  
  return null;
}

export async function confirmBooking(bookingId: string, adminUid: string): Promise<void> {
  const bookingRef = doc(db, 'bookings', bookingId);
  
  await runTransaction(db, async (transaction) => {
    const bookingDoc = await transaction.get(bookingRef);
    if (!bookingDoc.exists()) {
      throw new Error("Booking does not exist.");
    }
    
    const data = bookingDoc.data();
    const currentStatus = (data.status || '').toUpperCase().trim();
    
    if (currentStatus === 'CONFIRMED') {
      throw new Error("ALREADY_CONFIRMED");
    }
    
    // Partially update the booking
    transaction.update(bookingRef, {
      status: 'CONFIRMED',
      updatedAt: serverTimestamp(),
      confirmedAt: serverTimestamp(),
      confirmedBy: adminUid
    });
  });
}

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

export function subscribeToBookings(
  statusFilter: string,
  callback: (bookings: Booking[]) => void,
  onError: (error: Error) => void
) {
  let q;
  if (statusFilter && statusFilter !== 'ALL') {
    q = query(
      collection(db, 'bookings'),
      where('status', '==', statusFilter),
      orderBy('createdAt', 'desc'),
      limit(500)
    );
  } else {
    q = query(
      collection(db, 'bookings'),
      orderBy('createdAt', 'desc'),
      limit(200)
    );
  }

  return onSnapshot(q, (snapshot) => {
    const bookings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
    callback(bookings);
  }, (error) => {
    if (error.message.includes('index')) {
      console.warn('Missing index for status/createdAt. Falling back to unordered query.');
      const fallbackQ = statusFilter !== 'ALL' 
        ? query(collection(db, 'bookings'), where('status', '==', statusFilter), limit(500))
        : query(collection(db, 'bookings'), limit(200));
        
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
