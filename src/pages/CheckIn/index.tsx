import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { QrCode, Search, AlertCircle, Loader2, CheckCircle2, User, Camera, CameraOff, X } from 'lucide-react';
import { cn, formatDateToIST } from '@/lib/utils';
import { getBookingByTrackingId, checkInBooking } from '@/services/bookings';
import { Booking } from '@/types';
import { useAuth } from '@/hooks/useAuth';

export default function CheckIn() {
  const { user, adminProfile } = useAuth();
  
  const [mode, setMode] = useState<'scan' | 'manual'>('scan');
  
  // Scanner state
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  
  // Input state
  const [manualId, setManualId] = useState('');
  
  // Lookup state
  const [isVerifying, setIsVerifying] = useState(false);
  const [lookupError, setLookupError] = useState<{ message: string, type: 'not_found' | 'invalid_qr' | 'network_error' | 'unauthorized' } | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  
  // Check-in state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [checkInSuccess, setCheckInSuccess] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  const startScanner = async () => {
    setCameraError(null);
    setLookupError(null);
    
    try {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode("qr-reader");
      }
      
      // Update UI first so the #qr-reader div becomes visible (display block)
      // before html5-qrcode tries to inject video elements and calculate dimensions.
      setIsScanning(true);
      
      await html5QrCodeRef.current.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          // Stop scanner immediately on success, then process
          stopScanner().then(() => {
            handleQrScanResult(decodedText);
          });
        },
        (errorMessage) => {
          // parse errors are normal while looking for a code, ignore them
        }
      );
    } catch (err: any) {
      console.error("Camera start error:", err);
      setIsScanning(false);
      setCameraError("Unable to access camera. Please check your browser permissions.");
    }
  };

  const stopScanner = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (err) {
        console.error("Failed to stop scanner:", err);
      }
      try {
        html5QrCodeRef.current.clear();
      } catch (err) {
        console.error("Failed to clear scanner:", err);
      }
    }
    setIsScanning(false);
  };

  const handleModeSwitch = async (newMode: 'scan' | 'manual') => {
    if (newMode === 'manual' && isScanning) {
      await stopScanner();
    }
    setMode(newMode);
  };

  const parseQrData = (data: string): string | null => {
    // Try to parse as JSON first (if the Android app generates JSON)
    try {
      const parsed = JSON.parse(data);
      if (parsed && parsed.trackingId) {
        return String(parsed.trackingId).trim();
      }
      if (parsed && parsed.bookingId) {
        return String(parsed.bookingId).trim();
      }
    } catch (e) {
      // Not JSON, fall through
    }
    
    // Validate plain string format (typically alphanumeric)
    const cleaned = data.trim();
    if (cleaned.length > 5 && cleaned.length < 50 && /^[a-zA-Z0-9_-]+$/.test(cleaned)) {
      return cleaned;
    }
    
    return null;
  };

  const handleQrScanResult = (decodedText: string) => {
    const extractedId = parseQrData(decodedText);
    
    if (!extractedId) {
      setLookupError({ 
        message: "Unreadable QR or not a valid booking QR.", 
        type: 'invalid_qr' 
      });
      return;
    }
    
    verifyBooking(extractedId);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualId.trim()) return;
    
    // Also parse it just in case they pasted JSON
    const extractedId = parseQrData(manualId) || manualId.trim();
    verifyBooking(extractedId);
  };

  const verifyBooking = async (trackingId: string) => {
    setIsVerifying(true);
    setLookupError(null);
    setBooking(null);
    setCheckInSuccess(null);
    
    try {
      const foundBooking = await getBookingByTrackingId(trackingId);
      
      if (!foundBooking) {
        setLookupError({ message: "Booking not found.", type: 'not_found' });
        return;
      }
      
      // Centre check if admins are assigned to a centre 
      // (Assuming we don't strictly have a centreId in adminProfile yet based on schema, but adding the check structure)
      // if (adminProfile?.centreId && foundBooking.centreId !== adminProfile.centreId) {
      //   setLookupError({ message: "This booking belongs to a different procurement centre.", type: 'unauthorized' });
      //   return;
      // }
      
      setBooking(foundBooking);
      
    } catch (err: any) {
      console.error("Lookup error:", err);
      setLookupError({ 
        message: "Connection error — check your internet and try again.", 
        type: 'network_error' 
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const resetLookup = () => {
    setBooking(null);
    setLookupError(null);
    setManualId('');
    if (mode === 'scan') {
      startScanner();
    }
  };

  const handleCheckIn = async () => {
    if (!booking || !user) return;
    
    setIsCheckingIn(true);
    setCheckInError(null);
    
    try {
      await checkInBooking(booking.id!, user.uid);
      setCheckInSuccess("Farmer checked in successfully.");
      
      // Update local booking state immediately
      setBooking(prev => prev ? { ...prev, status: 'CHECKED_IN' } : null);
      
      // Trigger serverless FCM notification asynchronously
      if (booking.farmerId) {
        fetch('/api/send-queue-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            farmerId: booking.farmerId,
            title: "Checked In",
            body: `You have been checked in at ${booking.centreName || 'the centre'}. Please wait for your turn to be called.`
          })
        }).then(res => {
          if (!res.ok) throw new Error('Failed to send notification');
        }).catch(err => {
          console.error("Notification trigger failed:", err);
          setNotificationError("Notification failed to send to farmer — they may not be alerted.");
          setTimeout(() => setNotificationError(null), 5000);
        });
      }

      setShowConfirmDialog(false);
    } catch (err: any) {
      console.error("Check-in error:", err);
      if (err.message === 'ALREADY_CHECKED_IN') {
        setCheckInError("Farmer already checked in.");
        setBooking(prev => prev ? { ...prev, status: 'CHECKED_IN' } : null);
      } else if (err.message === 'NOT_CONFIRMED') {
        setCheckInError("This booking is not in a CONFIRMED state.");
      } else if (err.code === 'permission-denied') {
        setCheckInError("Permission denied. You do not have access to modify bookings.");
      } else {
        setCheckInError("Unable to check in this booking. Please try again.");
      }
    } finally {
      setIsCheckingIn(false);
    }
  };

  const currentStatus = (booking?.status || '').toUpperCase().trim();

  return (
    <div className="max-w-3xl mx-auto space-y-6 relative">
      {notificationError && (
        <div className="fixed bottom-4 right-4 z-50 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-sm font-medium">{notificationError}</span>
          <button onClick={() => setNotificationError(null)} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Check In Farmer</h1>
      </div>
      
      {/* Search / Scan Controls */}
      {!booking && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => handleModeSwitch('scan')}
              className={cn(
                "flex-1 py-4 px-6 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors",
                mode === 'scan' ? "border-green-600 text-green-700 bg-green-50/30" : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              )}
            >
              <QrCode className="w-4 h-4" />
              Scan QR Code
            </button>
            <button
              onClick={() => handleModeSwitch('manual')}
              className={cn(
                "flex-1 py-4 px-6 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors",
                mode === 'manual' ? "border-green-600 text-green-700 bg-green-50/30" : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              )}
            >
              <Search className="w-4 h-4" />
              Enter Tracking ID
            </button>
          </div>

          <div className="p-6">
            {/* SCAN MODE */}
            <div className={cn("flex flex-col items-center", mode !== 'scan' && "hidden")}>
              <div className="w-full max-w-sm relative">
                {/* Dedicated stable DOM container for html5-qrcode. React must NEVER render children inside this. */}
                <div 
                  id="qr-reader" 
                  className={cn(
                    "w-full bg-black border-2 border-dashed border-gray-200 rounded-xl overflow-hidden",
                    !isScanning && "hidden"
                  )}
                ></div>
                
                {/* React overlays (only shown when not scanning) */}
                {!isScanning && (
                  <div className="w-full aspect-square bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center p-8">
                    <Camera className="w-12 h-12 text-gray-300 mb-4" />
                    <p className="text-sm text-gray-500 text-center mb-6">
                      Place the farmer's QR code inside the frame to verify their booking.
                    </p>
                    <button
                      onClick={startScanner}
                      className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center shadow-sm"
                    >
                      <Camera className="w-4 h-4 mr-2" />
                      Start Camera
                    </button>
                  </div>
                )}
              </div>
              
              {isScanning && (
                <div className="mt-6 flex flex-col items-center">
                  <p className="text-sm text-gray-600 mb-4 flex items-center">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-2"></span>
                    Scanning for QR code...
                  </p>
                  <button
                    onClick={stopScanner}
                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center"
                  >
                    <CameraOff className="w-4 h-4 mr-2" />
                    Stop Camera
                  </button>
                </div>
              )}
              
              {cameraError && (
                <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-lg flex items-start text-red-700 text-sm max-w-sm w-full">
                  <AlertCircle className="w-5 h-5 mr-2 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium mb-1">Camera access denied</p>
                    <p>{cameraError}</p>
                  </div>
                </div>
              )}
            </div>

            {/* MANUAL MODE */}
            <div className={cn("max-w-md mx-auto py-8", mode !== 'manual' && "hidden")}>
              <form onSubmit={handleManualSubmit} className="space-y-4">
                <div>
                  <label htmlFor="trackingId" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Tracking ID or Booking ID
                  </label>
                  <input
                    id="trackingId"
                    type="text"
                    value={manualId}
                    onChange={(e) => setManualId(e.target.value)}
                    placeholder="e.g. KS268SX58H"
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isVerifying || !manualId.trim()}
                  className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center disabled:opacity-50"
                >
                  {isVerifying ? (
                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Verifying...</>
                  ) : (
                    <><Search className="w-5 h-5 mr-2" /> Verify Booking</>
                  )}
                </button>
              </form>
            </div>
            
            {/* Status Messages */}
            {lookupError && (
              <div className={cn(
                "mt-6 max-w-md mx-auto p-4 border rounded-xl flex flex-col items-center text-center",
                lookupError.type === 'invalid_qr' ? "bg-orange-50 border-orange-100 text-orange-800" :
                lookupError.type === 'not_found' ? "bg-gray-50 border-gray-200 text-gray-700" :
                "bg-red-50 border-red-100 text-red-800"
              )}>
                <AlertCircle className="w-8 h-8 mb-3 opacity-80" />
                <p className="font-medium">{lookupError.message}</p>
                {lookupError.type === 'network_error' && (
                  <button onClick={() => verifyBooking(manualId || "latest")} className="mt-3 text-sm font-medium underline">
                    Try Again
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Booking Verification View */}
      {booking && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                Booking Details
                <span className={cn(
                  "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ml-2",
                  currentStatus === 'CHECKED_IN' ? "bg-blue-50 text-blue-700 border-blue-200" :
                  currentStatus === 'COMPLETED' ? "bg-green-50 text-green-700 border-green-200" :
                  currentStatus === 'CONFIRMED' ? "bg-green-50 text-green-700 border-green-200" :
                  ['BOOKED', 'ACTIVE'].includes(currentStatus) ? "bg-orange-50 text-orange-700 border-orange-200" :
                  "bg-gray-50 text-gray-700 border-gray-200"
                )}>
                  {currentStatus || 'UNKNOWN'}
                </span>
              </h2>
              <p className="text-sm text-gray-500 mt-1">ID: {booking.trackingId || booking.id}</p>
            </div>
            
            <button 
              onClick={resetLookup}
              className="p-2 text-gray-400 hover:text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              title="Scan another booking"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Farmer Info */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4 flex items-center">
                  <User className="w-4 h-4 mr-2" /> Farmer Information
                </h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-500">Name</p>
                    <p className="font-medium text-gray-900">{booking.farmerName || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Farmer ID</p>
                    <p className="font-medium text-gray-900">{booking.farmerId || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Phone Number</p>
                    <p className="font-medium text-gray-900">{booking.phoneNumber || 'N/A'}</p>
                  </div>
                </div>
              </div>
              
              {/* Booking Info */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4 flex items-center">
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Procurement Slot
                </h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-500">Centre</p>
                    <p className="font-medium text-gray-900">{booking.centreName || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Date & Time</p>
                    <p className="font-medium text-gray-900">
                      {formatDateToIST(booking.bookingDate)} <span className="text-gray-400 mx-1">•</span> {booking.slotStartTime || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Produce</p>
                    <p className="font-medium text-gray-900">
                      {booking.quantity ? `${booking.quantity} ${booking.quantityUnit || 'Qtl'}` : 'N/A'} of {booking.crop || 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Action Area */}
          <div className="p-6 bg-gray-50 border-t border-gray-100 flex flex-col items-center justify-center relative">
            
            {checkInSuccess ? (
               <div className="w-full p-4 bg-green-50 border border-green-100 text-green-700 rounded-xl flex items-center justify-center">
                 <CheckCircle2 className="w-6 h-6 mr-2" />
                 <span className="font-medium">{checkInSuccess}</span>
               </div>
            ) : currentStatus === 'CONFIRMED' ? (
              <button
                onClick={() => setShowConfirmDialog(true)}
                disabled={isCheckingIn}
                className="w-full max-w-sm px-6 py-3.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition-colors shadow-sm flex items-center justify-center"
              >
                Check In Farmer
              </button>
            ) : currentStatus === 'BOOKED' ? (
               <div className="w-full p-4 bg-orange-50 border border-orange-100 text-orange-800 rounded-xl text-center">
                 <p className="font-medium">This booking has not been confirmed yet.</p>
                 <p className="text-sm mt-1">Please confirm the booking first from the Bookings page.</p>
               </div>
            ) : currentStatus === 'CHECKED_IN' ? (
               <div className="w-full p-4 bg-blue-50 border border-blue-100 text-blue-800 rounded-xl flex items-center justify-center">
                 <CheckCircle2 className="w-5 h-5 mr-2" />
                 <span className="font-medium">Farmer already checked in.</span>
               </div>
            ) : (
               <div className="w-full p-4 bg-gray-100 border border-gray-200 text-gray-600 rounded-xl text-center">
                 <p className="font-medium">Check-in not available for status: {currentStatus}</p>
               </div>
            )}
            
            {/* Inline Confirmation Dialog */}
            {showConfirmDialog && (
              <div className="absolute inset-x-4 sm:inset-x-auto sm:w-[400px] bottom-full mb-4 bg-white border border-gray-200 shadow-xl rounded-2xl p-6 z-20">
                <h4 className="text-lg font-semibold text-gray-900 mb-2">Check in this farmer?</h4>
                
                <div className="bg-gray-50 rounded-lg p-4 mb-5 border border-gray-100 text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Name:</span>
                    <span className="font-medium text-gray-900">{booking.farmerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Tracking ID:</span>
                    <span className="font-medium text-gray-900">{booking.trackingId || booking.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Centre:</span>
                    <span className="font-medium text-gray-900">{booking.centreName}</span>
                  </div>
                </div>
                
                {checkInError && (
                  <div className="mb-5 p-3 bg-red-50 border border-red-100 text-red-700 text-sm rounded-lg flex items-start">
                    <AlertCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                    <p>{checkInError}</p>
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <button 
                    onClick={() => { setShowConfirmDialog(false); setCheckInError(null); }}
                    disabled={isCheckingIn}
                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleCheckIn}
                    disabled={isCheckingIn}
                    className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center shadow-sm"
                  >
                    {isCheckingIn && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {isCheckingIn ? 'Processing...' : 'Check In Farmer'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
