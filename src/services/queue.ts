import { collection, query, where, orderBy, getDocs, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { QueueEntry } from '@/types';

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
