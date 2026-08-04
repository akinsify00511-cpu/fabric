import { Bell } from 'lucide-react'

// Notifications disabled - returns a simple bell with no functionality
export default function NotificationBell() {
  return (
    <button className="p-2 rounded-xl hover:bg-black/5 transition-colors">
      <Bell size={20} className="text-black/60" />
    </button>
  )
}
