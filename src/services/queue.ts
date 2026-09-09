import { collection, query, where, orderBy, getDocs, limit, onSnapshot, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { QueueEntry } from '@/types';

/**
 * SYNCHRONIZATION RULE:
 * Both `bookings` and `queueEntries` collections represent the status of a farmer.
 * To maintain the single source of truth and ensure real-time synchronization with the Farmer App:
 * Every state transition in the queue (WAITING -> NOW_SERVING -> PROCESSING -> COMPLETED)
 * MUST be executed as a Firestore Transaction that atomically updates the `status` 
 * and timestamp fields on BOTH the `queueEntries` document AND the corresponding `bookings` document.
 * This guarantees `bookings.status` and `queueEntries.status` will never drift apart.
 */

// State Transition: CHECKED_IN -> WAITING
export async function addToQueue(queueEntryId: string): Promise<void> {
  const entryRef = doc(db, 'queueEntries', queueEntryId);
  const bookingRef = doc(db, 'bookings', queueEntryId);
  
  await runTransaction(db, async (transaction) => {
    const entryDoc = await transaction.get(entryRef);
    if (!entryDoc.exists()) {
      throw new Error("Queue entry not found.");
    }
    
    if (entryDoc.data().status !== 'CHECKED_IN') {
      throw new Error("Farmer must be CHECKED_IN to be added to the queue.");
    }
    
    transaction.update(entryRef, {
      status: 'WAITING',
      updatedAt: serverTimestamp(),
      waitingAt: serverTimestamp(),
      queueJoinedAt: serverTimestamp() // Set this here so they queue in correct order
    });

    transaction.update(bookingRef, {
      status: 'WAITING',
      updatedAt: serverTimestamp()
    });
  });
}

// State Transition: WAITING -> NOW_SERVING
// Ensures only ONE farmer is NOW_SERVING at a time by using the daily counter document as a transaction lock
export async function startNextFarmer(centreId: string, dateStr: string, nextFarmerId: string): Promise<void> {
  const counterRef = doc(db, 'queueCounters', `${centreId}_${dateStr}`);
  const nextFarmerRef = doc(db, 'queueEntries', nextFarmerId);
  const bookingRef = doc(db, 'bookings', nextFarmerId);

  await runTransaction(db, async (transaction) => {
    // 1. Read the counter to check the active lock
    const counterDoc = await transaction.get(counterRef);
    if (!counterDoc.exists()) {
      throw new Error("Queue counter not found for this centre and date.");
    }

    // 2. Read the next farmer to ensure they are still waiting
    const nextFarmerDoc = await transaction.get(nextFarmerRef);
    if (!nextFarmerDoc.exists()) {
      throw new Error("Selected queue entry not found.");
    }
    
    if (nextFarmerDoc.data().status !== 'WAITING') {
      throw new Error("This farmer is no longer in the WAITING status.");
    }

    // 3. Verify if someone else is already serving
    const counterData = counterDoc.data();
    if (counterData.activeServingId) {
      const activeServingRef = doc(db, 'queueEntries', counterData.activeServingId);
      const activeServingDoc = await transaction.get(activeServingRef);
      if (activeServingDoc.exists() && activeServingDoc.data().status === 'NOW_SERVING') {
        throw new Error("Another farmer is already currently being served.");
      }
    }

    // 4. Update the next farmer
    transaction.update(nextFarmerRef, {
      status: 'NOW_SERVING',
      updatedAt: serverTimestamp(),
      startedServingAt: serverTimestamp()
    });

    transaction.update(bookingRef, {
      status: 'NOW_SERVING',
      updatedAt: serverTimestamp()
    });

    // 5. Update the lock
    transaction.update(counterRef, {
      activeServingId: nextFarmerId,
      updatedAt: serverTimestamp()
    });
  });
}

// State Transition: NOW_SERVING -> PROCESSING
export async function startProcessing(queueEntryId: string): Promise<void> {
  const entryRef = doc(db, 'queueEntries', queueEntryId);
  const bookingRef = doc(db, 'bookings', queueEntryId);
  
  await runTransaction(db, async (transaction) => {
    const entryDoc = await transaction.get(entryRef);
    if (!entryDoc.exists()) {
      throw new Error("Queue entry not found.");
    }
    
    if (entryDoc.data().status !== 'NOW_SERVING') {
      throw new Error("Farmer must be NOW_SERVING to start processing.");
    }
    
    transaction.update(entryRef, {
      status: 'PROCESSING',
      updatedAt: serverTimestamp(),
      processingStartedAt: serverTimestamp()
    });

    transaction.update(bookingRef, {
      status: 'PROCESSING',
      updatedAt: serverTimestamp()
    });
  });
}

// State Transition: PROCESSING -> COMPLETED
export async function completeProcessing(queueEntryId: string): Promise<void> {
  const entryRef = doc(db, 'queueEntries', queueEntryId);
  const bookingRef = doc(db, 'bookings', queueEntryId);
  
  await runTransaction(db, async (transaction) => {
    const entryDoc = await transaction.get(entryRef);
    if (!entryDoc.exists()) {
      throw new Error("Queue entry not found.");
    }
    
    if (entryDoc.data().status !== 'PROCESSING') {
      throw new Error("Farmer must be PROCESSING to complete procurement.");
    }
    
    transaction.update(entryRef, {
      status: 'COMPLETED',
      updatedAt: serverTimestamp(),
      completedAt: serverTimestamp()
    });

    transaction.update(bookingRef, {
      status: 'COMPLETED',
      updatedAt: serverTimestamp(),
      completedAt: serverTimestamp()
    });
  });
}

// Query for All WAITING farmers at a specific centre for a specific date
export async function getWaitingQueue(centreId: string, dateStr: string): Promise<QueueEntry[]> {
  const q = query(
    collection(db, 'queueEntries'),
    where('centreId', '==', centreId),
    where('queueDate', '==', dateStr),
    where('status', '==', 'WAITING'),
    orderBy('queueJoinedAt', 'asc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QueueEntry));
}

// Subscribe to Live WAITING farmers at a specific centre (Preparation for A5.2)
export function subscribeToWaitingQueue(
  centreId: string, 
  dateStr: string,
  callback: (entries: QueueEntry[]) => void,
  onError: (error: Error) => void
) {
  const q = query(
    collection(db, 'queueEntries'),
    where('centreId', '==', centreId),
    where('queueDate', '==', dateStr),
    where('status', '==', 'WAITING'),
    orderBy('queueJoinedAt', 'asc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QueueEntry));
    callback(entries);
  }, onError);
}

// Get the currently active/serving queue entry
export async function getActiveQueueEntry(centreId: string, dateStr: string): Promise<QueueEntry | null> {
  const q = query(
    collection(db, 'queueEntries'),
    where('centreId', '==', centreId),
    where('queueDate', '==', dateStr),
    where('status', 'in', ['NOW_SERVING', 'PROCESSING']),
    orderBy('updatedAt', 'desc'),
    limit(1)
  );
  
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as QueueEntry;
  }
  return null;
}

// Query to find the next waiting farmer
export async function getNextWaitingFarmer(centreId: string, dateStr: string): Promise<QueueEntry | null> {
  const q = query(
    collection(db, 'queueEntries'),
    where('centreId', '==', centreId),
    where('queueDate', '==', dateStr),
    where('status', '==', 'WAITING'),
    orderBy('queueJoinedAt', 'asc'),
    limit(1)
  );
  
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as QueueEntry;
  }
  return null;
}

// Get the count of waiting farmers
export async function getWaitingFarmersCount(centreId: string, dateStr: string): Promise<number> {
  const q = query(
    collection(db, 'queueEntries'),
    where('centreId', '==', centreId),
    where('queueDate', '==', dateStr),
    where('status', '==', 'WAITING')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.size;
}

// Subscribe to all queue entries for a specific centre and date
export function subscribeToTodayQueue(
  centreId: string | undefined, 
  dateStr: string,
  callback: (entries: QueueEntry[]) => void,
  onError: (error: Error) => void
) {
  let q;
  if (centreId && centreId !== 'UNKNOWN_CENTRE') {
    q = query(
      collection(db, 'queueEntries'),
      where('centreId', '==', centreId),
      where('queueDate', '==', dateStr)
    );
  } else {
    // If admin has no specific centre, just query by date (shows all for today)
    q = query(
      collection(db, 'queueEntries'),
      where('queueDate', '==', dateStr)
    );
  }
  
  return onSnapshot(q, (snapshot) => {
    const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QueueEntry));
    callback(entries);
  }, onError);
}
