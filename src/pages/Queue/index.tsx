import { useEffect, useState, useMemo } from 'react';
import { Users, Loader2, AlertCircle, Clock, CheckCircle2, User, PlayCircle, ArrowRight, Settings, X, Plus } from 'lucide-react';
import { cn, formatDateToIST } from '@/lib/utils';
import { subscribeToTodayQueue, startNextFarmer, startProcessing, addToQueue, completeProcessing } from '@/services/queue';
import { QueueEntry } from '@/types';
import { useAuth } from '@/hooks/useAuth';

export default function Queue() {
  const { adminProfile } = useAuth();
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);

  // Derive center ID directly from admin profile
  const centreId = adminProfile?.centreId;

  // We need the date string to query and lock the queue
  const [dateStr, setDateStr] = useState('');

  useEffect(() => {
    // Get current date in IST for queueDate (YYYY-MM-DD)
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const todayStr = istDate.toISOString().split('T')[0];
    setDateStr(todayStr);

    setLoading(true);
    const unsubscribe = subscribeToTodayQueue(centreId, todayStr, (data) => {
      setEntries(data);
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error("Queue listener error:", err);
      setError("Unable to load today's queue. Please check your permissions.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [centreId]);

  const { checkedIn, waiting, serving, processing } = useMemo(() => {
    const checkedIn = entries
      .filter(e => e.status === 'CHECKED_IN')
      .sort((a, b) => {
        const timeA = (a.checkInTime as any)?.toMillis?.() || new Date(a.checkInTime as string).getTime();
        const timeB = (b.checkInTime as any)?.toMillis?.() || new Date(b.checkInTime as string).getTime();
        return timeA - timeB;
      });

    const waiting = entries
      .filter(e => e.status === 'WAITING')
      .sort((a, b) => {
        const timeA = (a.queueJoinedAt as any)?.toMillis?.() || new Date(a.queueJoinedAt as string).getTime();
        const timeB = (b.queueJoinedAt as any)?.toMillis?.() || new Date(b.queueJoinedAt as string).getTime();
        return timeA - timeB;
      });
      
    const serving = entries
      .filter(e => e.status === 'NOW_SERVING')
      .sort((a, b) => {
        const timeA = (a.updatedAt as any)?.toMillis?.() || new Date(a.updatedAt as string).getTime();
        const timeB = (b.updatedAt as any)?.toMillis?.() || new Date(b.updatedAt as string).getTime();
        return timeB - timeA; // Most recently updated first
      });

    const processing = entries
      .filter(e => e.status === 'PROCESSING')
      .sort((a, b) => {
        const timeA = (a.updatedAt as any)?.toMillis?.() || new Date(a.updatedAt as string).getTime();
        const timeB = (b.updatedAt as any)?.toMillis?.() || new Date(b.updatedAt as string).getTime();
        return timeB - timeA;
      });

    return { checkedIn, waiting, serving, processing };
  }, [entries]);

  const [isActionLoading, setIsActionLoading] = useState(false);

  const handleAddToQueue = async (queueEntryId: string) => {
    setActionError(null);
    setIsActionLoading(true);
    
    try {
      await addToQueue(queueEntryId);
    } catch (err: any) {
      console.error("Error adding to queue:", err);
      setActionError(err.message || "Failed to add farmer to queue.");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCallNext = async () => {
    if (waiting.length === 0) return;
    const nextInLine = waiting[0];
    if (!nextInLine.id || !nextInLine.centreId) return;
    
    setActionError(null);
    setIsActionLoading(true);
    
    try {
      await startNextFarmer(nextInLine.centreId, dateStr, nextInLine.id);

      // Trigger serverless FCM notification asynchronously
      if (nextInLine.farmerId) {
        fetch('/api/send-queue-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            farmerId: nextInLine.farmerId,
            title: "Your turn is now",
            body: `Token ${nextInLine.tokenLabel || nextInLine.tokenNumber} is now being served. Please proceed to the procurement counter.`
          })
        }).then(res => {
          if (!res.ok) throw new Error('Failed to send notification');
        }).catch(err => {
          console.error("Notification trigger failed:", err);
          setNotificationError("Notification failed to send to farmer — they may not be alerted.");
          setTimeout(() => setNotificationError(null), 5000);
        });
      }
    } catch (err: any) {
      console.error("Error starting next farmer:", err);
      setActionError(err.message || "Failed to start next farmer.");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleStartProcessing = async (queueEntryId: string) => {
    setActionError(null);
    setIsActionLoading(true);
    
    try {
      await startProcessing(queueEntryId);

      // Trigger serverless FCM notification asynchronously
      const entry = serving.find(e => e.id === queueEntryId);
      if (entry?.farmerId) {
        fetch('/api/send-queue-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            farmerId: entry.farmerId,
            title: "Procurement started",
            body: "Your procurement process has started."
          })
        }).then(res => {
          if (!res.ok) throw new Error('Failed to send notification');
        }).catch(err => {
          console.error("Notification trigger failed:", err);
          setNotificationError("Notification failed to send to farmer — they may not be alerted.");
          setTimeout(() => setNotificationError(null), 5000);
        });
      }
    } catch (err: any) {
      console.error("Error starting processing:", err);
      setActionError(err.message || "Failed to start processing.");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCompleteProcessing = async (queueEntryId: string) => {
    setActionError(null);
    setIsActionLoading(true);
    
    try {
      await completeProcessing(queueEntryId);
    } catch (err: any) {
      console.error("Error completing processing:", err);
      setActionError(err.message || "Failed to complete processing.");
    } finally {
      setIsActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-green-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Loading live queue...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-xl p-6 flex flex-col items-center text-center">
        <AlertCircle className="w-8 h-8 text-red-600 mb-3" />
        <p className="text-red-700 font-medium mb-4">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto relative">
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
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Queue Control</h1>
        <div className="px-4 py-2 bg-white rounded-lg border border-gray-200 text-sm font-medium text-gray-600 flex items-center">
          <Clock className="w-4 h-4 mr-2 text-gray-400" />
          Today's Queue
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* CHECKED IN / PENDING QUEUE */}
        <div className="lg:col-span-2 space-y-4">
          {checkedIn.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-blue-100 overflow-hidden flex flex-col mb-6">
              <div className="p-5 border-b border-blue-50 flex items-center justify-between bg-blue-50/50">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-500" /> Pending Queue (Checked In)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium border border-blue-200">
                  {checkedIn.length} pending
                </span>
              </div>
              <div className="p-0">
                <ul className="divide-y divide-gray-100">
                  {checkedIn.map((entry) => (
                    <li key={entry.id} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 font-bold tracking-tight">
                          {entry.tokenLabel.split('-')[1] || entry.tokenNumber}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{entry.farmerName || 'Unknown Farmer'}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                            <span className="font-mono text-gray-400">{entry.tokenLabel}</span>
                            <span>•</span>
                            <span>ID: {entry.trackingId}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <button
                          onClick={() => handleAddToQueue(entry.id!)}
                          disabled={isActionLoading}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center shadow-sm"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add to Queue
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-gray-400" /> Waiting List
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium border border-gray-200">
                {waiting.length} waiting
              </span>
            </div>
            
            <div className="p-0">
              {waiting.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No farmers currently waiting in the queue.
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {waiting.map((entry, idx) => (
                    <li key={entry.id} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-green-50 border border-green-100 flex items-center justify-center text-green-700 font-bold tracking-tight">
                          {entry.tokenLabel.split('-')[1] || entry.tokenNumber}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{entry.farmerName || 'Unknown Farmer'}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                            <span className="font-mono text-gray-400">{entry.tokenLabel}</span>
                            <span>•</span>
                            <span>ID: {entry.trackingId}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                         <span className="text-xs text-gray-400 mb-1">Position</span>
                         <span className="text-sm font-semibold text-gray-700">#{idx + 1}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* ACTIVE & CONTROLS */}
        <div className="space-y-6">
          
          <div className="bg-white rounded-xl shadow-sm border border-green-200 overflow-hidden relative">
            <div className="absolute top-0 inset-x-0 h-1 bg-green-500"></div>
            <div className="p-5">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center">
                <PlayCircle className="w-4 h-4 mr-2" /> Now Serving
              </h2>
              
              {serving.length > 0 ? (
                <div className="space-y-4">
                  {serving.map(entry => (
                    <div key={entry.id} className="bg-green-50 border border-green-100 rounded-lg p-4 text-center">
                      <p className="text-xs font-medium text-green-600 uppercase tracking-wide mb-1">Token</p>
                      <h3 className="text-4xl font-bold text-green-700 tracking-tight mb-2">{entry.tokenLabel}</h3>
                      <p className="font-medium text-gray-900">{entry.farmerName}</p>
                      
                      <button 
                        onClick={() => handleStartProcessing(entry.id!)}
                        disabled={isActionLoading}
                        className="w-full mt-4 px-4 py-2 bg-white border border-green-300 text-green-700 hover:bg-green-100 font-medium rounded-lg transition-colors flex items-center justify-center shadow-sm disabled:opacity-50"
                      >
                        {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Settings className="w-4 h-4 mr-2" />}
                        Start Processing
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-6 border-2 border-dashed border-gray-100 rounded-lg text-gray-400">
                  Queue is empty or waiting
                </div>
              )}
              
              {actionError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg flex items-start">
                   <AlertCircle className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
                   {actionError}
                </div>
              )}
              
              <button 
                onClick={handleCallNext}
                disabled={waiting.length === 0 || serving.length > 0 || isActionLoading}
                className="w-full mt-4 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center shadow-sm"
              >
                {isActionLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Starting...</>
                ) : (
                  <>Start Next Farmer <ArrowRight className="w-4 h-4 ml-2" /></>
                )}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-orange-200 overflow-hidden relative">
            <div className="absolute top-0 inset-x-0 h-1 bg-orange-500"></div>
            <div className="p-5">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center">
                <Settings className="w-4 h-4 mr-2" /> Processing
              </h2>
              
              {processing.length > 0 ? (
                <div className="space-y-4">
                  {processing.map(entry => (
                    <div key={entry.id} className="bg-orange-50 border border-orange-100 rounded-lg p-4 text-center">
                      <p className="text-xs font-medium text-orange-600 uppercase tracking-wide mb-1">Token</p>
                      <h3 className="text-3xl font-bold text-orange-700 tracking-tight mb-2">{entry.tokenLabel}</h3>
                      <p className="font-medium text-gray-900">{entry.farmerName}</p>
                      
                      <button 
                        onClick={() => handleCompleteProcessing(entry.id!)}
                        disabled={isActionLoading}
                        className="w-full mt-4 px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium rounded-lg transition-colors flex items-center justify-center shadow-sm disabled:opacity-50"
                      >
                        {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                        Complete Procurement
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-6 border-2 border-dashed border-gray-100 rounded-lg text-gray-400 text-sm">
                  No farmers currently being processed
                </div>
              )}
            </div>
          </div>
          
        </div>

      </div>
    </div>
  );
}
