import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateToIST(dateInput: any): string {
  if (!dateInput) return 'Not available';
  try {
    const date = dateInput?.toDate ? dateInput.toDate() : new Date(dateInput);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  } catch (e) {
    return 'Not available';
  }
}

export function isTodayIST(dateInput: any): boolean {
  if (!dateInput) return false;
  try {
    const date = dateInput?.toDate ? dateInput.toDate() : new Date(dateInput);
    if (isNaN(date.getTime())) return false;
    const today = new Date();
    
    // Format both to IST and compare YYYY-MM-DD
    const dateIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
    const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(today);
    
    return dateIST === todayIST;
  } catch (e) {
    return false;
  }
}
