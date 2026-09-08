import { useEffect, useState, useMemo } from 'react';
import { Loader2, AlertCircle, Search, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getFarmers } from '@/services/farmers';
import { Farmer } from '@/types';

export default function Farmers() {
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filtering & Search
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    async function fetchFarmers() {
      try {
        const data = await getFarmers();
        setFarmers(data);
      } catch (err: any) {
        console.error("Error fetching farmers:", err);
        if (err.code === 'permission-denied') {
          setError("Permission denied. Your admin account needs Firestore read access to the 'farmers' collection.");
        } else {
          setError("Unable to load farmers. Please check your network connection and permissions.");
        }
      } finally {
        setLoading(false);
      }
    }
    fetchFarmers();
  }, []);

  const filteredFarmers = useMemo(() => {
    return farmers.filter(f => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const searchString = `
          ${f.farmerId || ''} 
          ${f.fullName || ''} 
          ${f.phoneNumber || ''} 
          ${f.district || ''}
        `.toLowerCase();
        
        if (!searchString.includes(term)) return false;
      }
      return true;
    });
  }, [farmers, searchTerm]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-green-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Loading farmer directory...</p>
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
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Farmer Directory</h1>
        
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text"
            placeholder="Search Name, ID, Phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-green-500 focus:border-green-500 w-full sm:w-64 outline-none"
          />
        </div>
      </div>

      {/* Farmers Table */}
      <div className="bg-white border border-gray-100 shadow-sm rounded-xl overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 font-medium">Farmer ID</th>
                <th className="px-6 py-4 font-medium">Full Name</th>
                <th className="px-6 py-4 font-medium">Phone Number</th>
                <th className="px-6 py-4 font-medium">State</th>
                <th className="px-6 py-4 font-medium">District</th>
                <th className="px-6 py-4 font-medium">Locality</th>
                <th className="px-6 py-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredFarmers.map((farmer) => (
                <tr key={farmer.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">{farmer.farmerId || 'N/A'}</td>
                  <td className="px-6 py-4 text-gray-600">{farmer.fullName || 'N/A'}</td>
                  <td className="px-6 py-4 text-gray-600">{farmer.phoneNumber || 'N/A'}</td>
                  <td className="px-6 py-4 text-gray-600">{farmer.state || 'N/A'}</td>
                  <td className="px-6 py-4 text-gray-600">{farmer.district || 'N/A'}</td>
                  <td className="px-6 py-4 text-gray-600">{farmer.mandal || farmer.city || farmer.locality || 'N/A'}</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
                      (farmer.status || farmer.accountStatus || '').toUpperCase() === 'ACTIVE' ? "bg-green-50 text-green-700 border-green-200" :
                      "bg-gray-50 text-gray-700 border-gray-200"
                    )}>
                      {farmer.status || farmer.accountStatus || 'UNKNOWN'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredFarmers.length === 0 && (
          <div className="p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No farmers found</h3>
            <p className="text-gray-500">Try adjusting your search query.</p>
          </div>
        )}
      </div>
    </div>
  );
}
