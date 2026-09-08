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
  [key: string]: any; // Allow for flexible fields if schema varies slightly
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
