import { Timestamp } from 'firebase/firestore';

export interface Booking {
  id?: string;
  trackingId?: string;
  farmerId?: string;
  farmerName?: string;
  phoneNumber?: string;
  centreId?: string;
  centreName?: string;
  bookingDate?: string | Timestamp | Date;
  slotId?: string;
  slotStartTime?: string;
  slotEndTime?: string;
  crop?: string;
  quantity?: number | string;
  quantityUnit?: string;
  quantityKg?: number;
  status?: string;
  qrCodeData?: string;
  createdAt?: Timestamp | Date | string;
  updatedAt?: Timestamp | Date | string;
  [key: string]: any;
}

export interface QueueEntry {
  id?: string;
  bookingId: string;
  trackingId: string;
  farmerId: string;
  centreId: string;
  centreName: string;
  tokenNumber: number;
  tokenLabel: string;
  status: string; // 'WAITING', 'NOW_SERVING', 'PROCESSING', 'COMPLETED', 'SKIPPED', 'CANCELLED'
  queueDate: string; // 'YYYY-MM-DD'
  checkInTime: Timestamp | Date | string;
  queueJoinedAt: Timestamp | Date | string;
  createdAt: Timestamp | Date | string;
  updatedAt: Timestamp | Date | string;
}

export interface QueueCounter {
  id?: string;
  centreId: string;
  date: string; // 'YYYY-MM-DD'
  lastTokenNumber: number;
  updatedAt: Timestamp | Date | string;
}

export interface Farmer {
  id?: string;
  farmerId?: string;
  fullName?: string;
  phoneNumber?: string;
  state?: string;
  district?: string;
  mandal?: string;
  city?: string;
  locality?: string;
  status?: string;
  accountStatus?: string;
  createdAt?: Timestamp | Date | string;
  [key: string]: any;
}
