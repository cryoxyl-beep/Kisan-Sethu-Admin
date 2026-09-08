import { collection, query, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Farmer } from '@/types';

export async function getFarmers(): Promise<Farmer[]> {
  try {
    const q = query(collection(db, 'farmers'), limit(1000));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Farmer));
  } catch (error) {
    console.error("Error fetching farmers:", error);
    throw error;
  }
}
