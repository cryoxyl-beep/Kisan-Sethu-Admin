import { useEffect, useState, useMemo } from 'react';
import { Clock, CheckCircle2, ListTodo, Activity, Loader2, AlertCircle } from 'lucide-react';
import { cn, formatDateToIST, isTodayIST } from '@/lib/utils';
import { subscribeToRecentBookings } from '@/services/bookings';
import { Booking } from '@/types';

export default function Dashboard() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToRecentBookings((data) => {
      setBookings(data);
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error("Dashboard bookings listener error:", err);
      setError("Unable to load today's bookings. Please check your permissions.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const stats = useMemo(() => {
    // Determine "Today's Bookings" based on bookingDate or createdAt
    const todayBookings = bookings.filter(b => isTodayIST(b.bookingDate) || isTodayIST(b.createdAt));
    
    // Status normalizer helper
    const normalizeStatus = (status?: string) => (status || '').toUpperCase().trim();
    
    const active = bookings.filter(b => ['BOOKED', 'ACTIVE', 'CONFIRMED'].includes(normalizeStatus(b.status)));
    const completed = bookings.filter(b => normalizeStatus(b.status) === 'COMPLETED');
    const pending = bookings.filter(b => normalizeStatus(b.status) === 'PENDING');

    return [
      { name: "Today's Bookings", value: todayBookings.length.toString(), icon: ListTodo, color: 'text-blue-600', bg: 'bg-blue-50' },
      { name: 'Active Bookings', value: active.length.toString(), icon: Activity, color: 'text-orange-600', bg: 'bg-orange-50' },
      { name: 'Completed', value: completed.length.toString(), icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
      { name: 'Pending', value: pending.length.toString(), icon: Clock, color: 'text-gray-600', bg: 'bg-gray-50' },
    ];
  }, [bookings]);

  const todayBookingsList = useMemo(() => {
    return bookings.filter(b => isTodayIST(b.bookingDate) || isTodayIST(b.createdAt));
  }, [bookings]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-green-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-xl p-6 flex flex-col items-center text-center">
        <AlertCircle className="w-8 h-8 text-red-600 mb-3" />
        <p className="text-red-700 font-medium mb-4">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-white text-red-600 text-sm font-medium border border-red-200 rounded-lg shadow-sm hover:bg-red-50 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">{stat.name}</p>
              <h3 className="text-2xl font-semibold text-gray-900">{stat.value}</h3>
            </div>
            <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center shrink-0", stat.bg)}>
              <stat.icon className={cn("w-6 h-6", stat.color)} />
            </div>
          </div>
        ))}
      </div>

      {/* Bookings Table Section */}
      <div className="bg-white border border-gray-100 shadow-sm rounded-xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Today's Bookings</h2>
          <span className="text-sm font-medium text-gray-500">{todayBookingsList.length} total</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 font-medium">Tracking ID</th>
                <th className="px-6 py-4 font-medium">Farmer</th>
                <th className="px-6 py-4 font-medium">Centre</th>
                <th className="px-6 py-4 font-medium">Time</th>
                <th className="px-6 py-4 font-medium">Crop</th>
                <th className="px-6 py-4 font-medium">Quantity</th>
                <th className="px-6 py-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {todayBookingsList.map((booking) => (
                <tr key={booking.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">{booking.trackingId || 'N/A'}</td>
                  <td className="px-6 py-4 text-gray-600">{booking.farmerName || 'N/A'}</td>
                  <td className="px-6 py-4 text-gray-600">{booking.centreName || 'N/A'}</td>
                  <td className="px-6 py-4 text-gray-600">{booking.slotStartTime || formatDateToIST(booking.bookingDate || booking.createdAt)}</td>
                  <td className="px-6 py-4 text-gray-600">{booking.crop || 'N/A'}</td>
                  <td className="px-6 py-4 text-gray-600">{booking.quantity ? `${booking.quantity} ${booking.quantityUnit || 'Qtl'}` : 'N/A'}</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
                      ['COMPLETED', 'CONFIRMED'].includes((booking.status || '').toUpperCase()) ? "bg-green-50 text-green-700 border-green-200" :
                      ['BOOKED', 'ACTIVE'].includes((booking.status || '').toUpperCase()) ? "bg-orange-50 text-orange-700 border-orange-200" :
                      "bg-gray-50 text-gray-700 border-gray-200"
                    )}>
                      {booking.status || 'UNKNOWN'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {todayBookingsList.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No bookings scheduled for today.
          </div>
        )}
      </div>
    </div>
  );
}
