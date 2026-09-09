import { useEffect, useState, useMemo } from 'react';
import { Loader2, AlertCircle, Search, Filter, X, CheckCircle2 } from 'lucide-react';
import { cn, formatDateToIST } from '@/lib/utils';
import { subscribeToBookings, confirmBooking } from '@/services/bookings';
import { Booking } from '@/types';
import { useAuth } from '@/hooks/useAuth';

export default function Bookings() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filtering & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  
  // Modal State
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  
  // Confirmation State
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmSuccess, setConfirmSuccess] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToBookings(
      statusFilter,
      (data) => {
        setBookings(data);
        
        // Update selected booking if it was modified
        if (selectedBooking) {
          const updatedSelected = data.find(b => b.id === selectedBooking.id);
          if (updatedSelected) {
            setSelectedBooking(updatedSelected);
          }
        }
        
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("Error fetching bookings:", err);
        setError("Unable to load bookings. Please check your network connection and permissions.");
        setLoading(false);
      }
    );
    
    return () => unsubscribe();
  }, [statusFilter]); // eslint-disable-next-line react-hooks/exhaustive-deps

  const filteredBookings = useMemo(() => {
    return bookings.filter(b => {
      // Search Term
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const searchString = `
          ${b.trackingId || ''} 
          ${b.farmerName || ''} 
          ${b.farmerId || ''} 
          ${b.phoneNumber || ''} 
          ${b.centreName || ''}
        `.toLowerCase();
        
        if (!searchString.includes(term)) return false;
      }
      
      return true;
    });
  }, [bookings, searchTerm]);

  const handleConfirmBooking = async () => {
    if (!selectedBooking || !user) return;
    
    setConfirmError(null);
    setIsConfirming(true);
    
    try {
      await confirmBooking(selectedBooking.id, user.uid);
      setConfirmSuccess("Booking confirmed successfully.");
      
      // Update local state to reflect change immediately
      setBookings(prev => prev.map(b => 
        b.id === selectedBooking.id ? { ...b, status: 'CONFIRMED' } : b
      ));
      setSelectedBooking(prev => prev ? { ...prev, status: 'CONFIRMED' } : null);
      
      // Trigger serverless FCM notification asynchronously
      if (selectedBooking.farmerId) {
        fetch('/api/send-queue-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            farmerId: selectedBooking.farmerId,
            title: "Booking Confirmed",
            body: `Your procurement slot at ${selectedBooking.centreName || 'the centre'} on ${formatDateToIST(selectedBooking.bookingDate || selectedBooking.createdAt)} at ${selectedBooking.slotStartTime || ''} has been confirmed.`
          })
        }).then(res => {
          if (!res.ok) throw new Error('Failed to send notification');
        }).catch(err => {
          console.error("Notification trigger failed:", err);
          setNotificationError("Notification failed to send to farmer — they may not be alerted.");
          setTimeout(() => setNotificationError(null), 5000);
        });
      }

      // Close dialog after brief success message
      setTimeout(() => {
        setShowConfirmDialog(false);
        setConfirmSuccess(null);
      }, 2000);
      
    } catch (err: any) {
      if (err.message === 'ALREADY_CONFIRMED') {
        setConfirmError("This booking has already been confirmed.");
        // Correct the local state silently
        setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, status: 'CONFIRMED' } : b));
        setSelectedBooking(prev => prev ? { ...prev, status: 'CONFIRMED' } : null);
      } else if (err.code === 'permission-denied') {
        setConfirmError("Permission denied. You do not have access to modify bookings.");
      } else {
        setConfirmError("Unable to confirm this booking. Please try again.");
      }
    } finally {
      setIsConfirming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-green-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Loading bookings...</p>
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
    <div className="space-y-6 relative">
      {notificationError && (
        <div className="fixed bottom-4 right-4 z-50 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-sm font-medium">{notificationError}</span>
          <button onClick={() => setNotificationError(null)} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Bookings Management</h1>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text"
              placeholder="Search ID, Farmer, Centre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-green-500 focus:border-green-500 w-full sm:w-64 outline-none"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-green-500 focus:border-green-500 appearance-none bg-white w-full sm:w-auto outline-none cursor-pointer"
            >
              <option value="ALL">All Status</option>
              <option value="BOOKED">Booked</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="CHECKED_IN">Checked In</option>
              <option value="WAITING">Waiting</option>
              <option value="NOW_SERVING">Now Serving</option>
              <option value="PROCESSING">Processing</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bookings Table */}
      <div className="bg-white border border-gray-100 shadow-sm rounded-xl overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 font-medium">Tracking ID</th>
                <th className="px-6 py-4 font-medium">Farmer</th>
                <th className="px-6 py-4 font-medium">Centre</th>
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium">Time</th>
                <th className="px-6 py-4 font-medium">Crop</th>
                <th className="px-6 py-4 font-medium">Quantity</th>
                <th className="px-6 py-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredBookings.map((booking) => (
                <tr 
                  key={booking.id} 
                  onClick={() => setSelectedBooking(booking)}
                  className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4 font-medium text-gray-900">{booking.trackingId || 'N/A'}</td>
                  <td className="px-6 py-4 text-gray-600">{booking.farmerName || 'N/A'}</td>
                  <td className="px-6 py-4 text-gray-600">{booking.centreName || 'N/A'}</td>
                  <td className="px-6 py-4 text-gray-600">{formatDateToIST(booking.bookingDate || booking.createdAt)}</td>
                  <td className="px-6 py-4 text-gray-600">{booking.slotStartTime || 'N/A'}</td>
                  <td className="px-6 py-4 text-gray-600">{booking.crop || 'N/A'}</td>
                  <td className="px-6 py-4 text-gray-600">{booking.quantity ? `${booking.quantity} ${booking.quantityUnit || 'Qtl'}` : 'N/A'}</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
                      ['COMPLETED', 'CONFIRMED'].includes((booking.status || '').toUpperCase()) ? "bg-green-50 text-green-700 border-green-200" :
                      ['BOOKED', 'ACTIVE'].includes((booking.status || '').toUpperCase()) ? "bg-orange-50 text-orange-700 border-orange-200" :
                      (booking.status || '').toUpperCase() === 'CANCELLED' ? "bg-red-50 text-red-700 border-red-200" :
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
        
        {filteredBookings.length === 0 && (
          <div className="p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No bookings found</h3>
            <p className="text-gray-500">Try adjusting your search or filters.</p>
          </div>
        )}
      </div>

      {/* Booking Details Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 bg-gray-900/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-900">Booking Details</h3>
              <button 
                onClick={() => { setSelectedBooking(null); setShowConfirmDialog(false); setConfirmError(null); setConfirmSuccess(null); }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Tracking ID</p>
                  <p className="text-sm font-medium text-gray-900">{selectedBooking.trackingId || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Status</p>
                  <p className="text-sm font-medium text-gray-900">{selectedBooking.status || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Farmer Name</p>
                  <p className="text-sm font-medium text-gray-900">{selectedBooking.farmerName || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Farmer ID</p>
                  <p className="text-sm font-medium text-gray-900">{selectedBooking.farmerId || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Phone Number</p>
                  <p className="text-sm font-medium text-gray-900">{selectedBooking.phoneNumber || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Centre</p>
                  <p className="text-sm font-medium text-gray-900">{selectedBooking.centreName || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Date</p>
                  <p className="text-sm font-medium text-gray-900">{formatDateToIST(selectedBooking.bookingDate)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Time Slot</p>
                  <p className="text-sm font-medium text-gray-900">{selectedBooking.slotStartTime || 'N/A'} - {selectedBooking.slotEndTime || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Crop</p>
                  <p className="text-sm font-medium text-gray-900">{selectedBooking.crop || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Quantity</p>
                  <p className="text-sm font-medium text-gray-900">{selectedBooking.quantity ? `${selectedBooking.quantity} ${selectedBooking.quantityUnit || 'Qtl'}` : 'N/A'}</p>
                </div>
                <div className="col-span-2 pt-4 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">System Record Created</p>
                  <p className="text-sm text-gray-600">{formatDateToIST(selectedBooking.createdAt)}</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center relative">
              <div>
                {(selectedBooking.status || '').toUpperCase().trim() === 'BOOKED' && !showConfirmDialog && (
                  <button 
                    onClick={() => setShowConfirmDialog(true)}
                    className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                  >
                    Confirm Booking
                  </button>
                )}
                {(selectedBooking.status || '').toUpperCase().trim() === 'CONFIRMED' && (
                  <span className="flex items-center text-green-700 font-medium text-sm">
                    <CheckCircle2 className="w-5 h-5 mr-2" /> Booking Confirmed
                  </span>
                )}
              </div>
              <button 
                onClick={() => { setSelectedBooking(null); setShowConfirmDialog(false); setConfirmError(null); setConfirmSuccess(null); }}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
              
              {/* Inline Confirmation Dialog */}
              {showConfirmDialog && (
                <div className="absolute inset-x-0 bottom-full mb-2 mx-4 bg-white border border-gray-200 shadow-lg rounded-xl p-5 z-20">
                  <h4 className="text-base font-semibold text-gray-900 mb-1">Confirm this booking?</h4>
                  <p className="text-sm text-gray-600 mb-4">
                    Confirming this booking will notify the farmer that their slot has been officially confirmed.
                  </p>
                  
                  {confirmError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-700 text-sm rounded-lg flex items-start">
                      <AlertCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                      <p>{confirmError}</p>
                    </div>
                  )}
                  {confirmSuccess && (
                    <div className="mb-4 p-3 bg-green-50 border border-green-100 text-green-700 text-sm rounded-lg flex items-start">
                      <CheckCircle2 className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                      <p>{confirmSuccess}</p>
                    </div>
                  )}

                  <div className="flex justify-end gap-3">
                    <button 
                      onClick={() => { setShowConfirmDialog(false); setConfirmError(null); }}
                      disabled={isConfirming || !!confirmSuccess}
                      className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleConfirmBooking}
                      disabled={isConfirming || !!confirmSuccess}
                      className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center shadow-sm"
                    >
                      {isConfirming && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      {isConfirming ? 'Confirming...' : 'Confirm Booking'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
