import { Clock, CheckCircle2, ListTodo, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

const stats = [
  { name: "Today's Bookings", value: '142', icon: ListTodo, trend: '+12%', color: 'text-blue-600', bg: 'bg-blue-50' },
  { name: 'Active Bookings', value: '38', icon: Activity, trend: 'Current', color: 'text-orange-600', bg: 'bg-orange-50' },
  { name: 'Completed', value: '84', icon: CheckCircle2, trend: '+4%', color: 'text-green-600', bg: 'bg-green-50' },
  { name: 'Pending', value: '20', icon: Clock, trend: '-2%', color: 'text-gray-600', bg: 'bg-gray-50' },
];

const mockBookings = [
  { id: 'KS-1042', farmer: 'Ramesh Kumar', centre: 'Mandi A', time: '09:30 AM', crop: 'Wheat', quantity: '45 Qtl', status: 'Completed' },
  { id: 'KS-1043', farmer: 'Suresh Singh', centre: 'Mandi A', time: '10:00 AM', crop: 'Paddy', quantity: '30 Qtl', status: 'Active' },
  { id: 'KS-1044', farmer: 'Amit Patel', centre: 'Mandi B', time: '10:15 AM', crop: 'Wheat', quantity: '50 Qtl', status: 'Pending' },
  { id: 'KS-1045', farmer: 'Vikram Sharma', centre: 'Mandi A', time: '11:00 AM', crop: 'Soybean', quantity: '25 Qtl', status: 'Pending' },
  { id: 'KS-1046', farmer: 'Rajesh Verma', centre: 'Mandi C', time: '11:30 AM', crop: 'Wheat', quantity: '60 Qtl', status: 'Pending' },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">{stat.name}</p>
              <h3 className="text-2xl font-semibold text-gray-900">{stat.value}</h3>
              <span className="text-xs font-medium text-gray-400 mt-2 block">{stat.trend}</span>
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
          <button className="text-sm font-medium text-green-600 hover:text-green-700">View All</button>
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
              {mockBookings.map((booking) => (
                <tr key={booking.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">{booking.id}</td>
                  <td className="px-6 py-4 text-gray-600">{booking.farmer}</td>
                  <td className="px-6 py-4 text-gray-600">{booking.centre}</td>
                  <td className="px-6 py-4 text-gray-600">{booking.time}</td>
                  <td className="px-6 py-4 text-gray-600">{booking.crop}</td>
                  <td className="px-6 py-4 text-gray-600">{booking.quantity}</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                      booking.status === 'Completed' ? "bg-green-100 text-green-700" :
                      booking.status === 'Active' ? "bg-orange-100 text-orange-700" :
                      "bg-gray-100 text-gray-700"
                    )}>
                      {booking.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Placeholder for empty state or pagination if needed */}
        {mockBookings.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No bookings scheduled for today.
          </div>
        )}
      </div>
    </div>
  );
}
