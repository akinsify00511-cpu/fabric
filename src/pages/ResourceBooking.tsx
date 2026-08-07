import { useState, useEffect } from 'react'
import {
  Calendar, MapPin, Users, Clock, Plus, RefreshCw,
  ChevronLeft, ChevronRight, Search, Filter,
  CheckCircle, XCircle, Monitor, Car, Building
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

interface Resource {
  id: string
  name: string
  type: string
  category: string
  capacity: number
  location: string
  amenities: string[]
  is_active: boolean
  requires_approval: boolean
  hourly_rate: number
}

interface Booking {
  id: string
  resource: Resource
  resource_id: string
  booked_by: any
  title: string
  start_time: string
  end_time: string
  status: string
  attendees: string[]
  description: string
}

const typeIcons: Record<string, any> = {
  room: Building,
  equipment: Monitor,
  vehicle: Car,
}

export default function ResourceBookingPage() {
  const { staff } = useAuth()
  const isAdmin = staff?.role === 'owner' || staff?.role === 'admin'
  const [resources, setResources] = useState<Resource[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedResource, setSelectedResource] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [filterType, setFilterType] = useState<string>('all')

  useEffect(() => {
    loadData()
  }, [staff?.business_id])

  async function loadData() {
    if (!staff?.business_id) return
    setLoading(true)

    try {
      const { data: res } = await supabase
        .from('resources')
        .select('*')
        .eq('business_id', staff.business_id)
        .eq('is_active', true)

      // Get bookings for selected date range
      const startOfDay = new Date(selectedDate)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(selectedDate)
      endOfDay.setHours(23, 59, 59, 999)

      const { data: bks } = await supabase
        .from('resource_bookings')
        .select('*, resource:resources(*), booked_by:staff(full_name, email)')
        .eq('resource.business_id', staff.business_id)
        .eq('status', 'confirmed')
        .gte('start_time', startOfDay.toISOString())
        .lte('end_time', endOfDay.toISOString())

      setResources(res || [])
      setBookings(bks || [])
    } catch (e) {
      console.error('Failed to load data:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedDate])

  const filteredResources = resources.filter(r => {
    const matchesType = filterType === 'all' || r.type === filterType
    return matchesType
  })

  const filteredBookings = selectedResource
    ? bookings.filter(b => b.resource_id === selectedResource)
    : bookings

  // Group bookings by hour
  const hours = Array.from({ length: 12 }, (_, i) => i + 7) // 7 AM to 6 PM

  const resourceTypes = [...new Set(resources.map(r => r.type))]

  async function handleBook(resourceId: string, hour: number) {
    if (!staff?.id) return

    const startTime = new Date(selectedDate)
    startTime.setHours(hour, 0, 0, 0)
    const endTime = new Date(startTime)
    endTime.setHours(hour + 1, 0, 0, 0)

    try {
      await supabase.from('resource_bookings').insert({
        resource_id: resourceId,
        booked_by: staff.id,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status: 'confirmed',
        title: 'Booked',
      })
      loadData()
    } catch (e) {
      console.error('Failed to book:', e)
    }
  }

  async function handleCancelBooking(bookingId: string) {
    if (!confirm('Cancel this booking?')) return

    try {
      await supabase.from('resource_bookings').update({ status: 'cancelled' }).eq('id', bookingId)
      loadData()
    } catch (e) {
      console.error('Failed to cancel:', e)
    }
  }

  function getBookingForSlot(resourceId: string, hour: number) {
    return filteredBookings.find(b => {
      if (b.resource_id !== resourceId) return false
      const bookingHour = new Date(b.start_time).getHours()
      return bookingHour === hour
    })
  }

  function navigateDate(days: number) {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + days)
    setSelectedDate(newDate)
  }

  const today = new Date().toDateString() === selectedDate.toDateString()

  return (
    <div className="max-w-6xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <Calendar size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-black">Resource Booking</h1>
            <p className="text-sm text-black">Book rooms, equipment, and more</p>
          </div>
        </div>
      </div>

      {/* Date Navigation */}
      <div className="bg-white rounded-xl border border-black/[0.06] p-4 mb-6">
        <div className="flex items-center justify-between">
          <button onClick={() => navigateDate(-1)} className="p-2 rounded-lg hover:bg-black/10">
            <ChevronLeft size={20} />
          </button>
          <div className="text-center">
            <div className="text-lg font-semibold">
              {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
            {today && <span className="text-xs text-[var(--av-primary, #0891B2)]">Today</span>}
          </div>
          <button onClick={() => navigateDate(1)} className="p-2 rounded-lg hover:bg-black/10">
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="flex justify-center gap-2 mt-3">
          <button
            onClick={() => setSelectedDate(new Date())}
            className="px-3 py-1.5 rounded-lg text-sm bg-[var(--av-primary, #0891B2)] text-white"
          >
            Today
          </button>
          <button
            onClick={() => { const d = new Date(); d.setDate(d.getDate() + 1); setSelectedDate(d) }}
            className="px-3 py-1.5 rounded-lg text-sm border border-black/10"
          >
            Tomorrow
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        <button
          onClick={() => setFilterType('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
            filterType === 'all' ? 'bg-[var(--av-primary, #0891B2)] text-white' : 'bg-white border border-black/10'
          }`}
        >
          All
        </button>
        {resourceTypes.map(type => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap capitalize ${
              filterType === type ? 'bg-[var(--av-primary, #0891B2)] text-white' : 'bg-white border border-black/10'
            }`}
          >
            {type}s
          </button>
        ))}
      </div>

      {/* Resources Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {filteredResources.map(resource => {
          const Icon = typeIcons[resource.type] || Building
          const isSelected = selectedResource === resource.id

          return (
            <div
              key={resource.id}
              onClick={() => setSelectedResource(isSelected ? null : resource.id)}
              className={`bg-white rounded-xl border p-4 cursor-pointer transition ${
                isSelected 
                  ? 'border-[var(--av-primary, #0891B2)] ring-2 ring-[var(--av-primary, #0891B2)]/20' 
                  : 'border-black/[0.06] hover:border-[var(--av-primary, #0891B2)]'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-cyan-50 flex items-center justify-center shrink-0">
                  <Icon size={24} className="text-cyan-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{resource.name}</div>
                  <div className="text-sm text-black">
                    {resource.location || resource.category}
                  </div>
                  {resource.capacity && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-black">
                      <Users size={12} />
                      {resource.capacity} people
                    </div>
                  )}
                </div>
              </div>
              {resource.amenities && resource.amenities.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {resource.amenities.slice(0, 3).map((a, i) => (
                    <span key={i} className="px-2 py-0.5 bg-black/10 rounded text-xs text-black">
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Schedule View */}
      <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
        <div className="p-4 border-b border-black/[0.06]">
          <h2 className="font-semibold">
            {selectedResource 
              ? `${resources.find(r => r.id === selectedResource)?.name} - Schedule`
              : 'All Resources - Schedule'}
          </h2>
          <p className="text-sm text-black">Click on a slot to book</p>
        </div>

        {loading ? (
          <div className="p-12 text-center text-black">
            <RefreshCw size={24} className="mx-auto animate-spin mb-2" />
            Loading...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-black/[0.02]">
                  <th className="p-3 text-left text-xs font-medium text-black w-20">Time</th>
                  {(selectedResource ? filteredResources.filter(r => r.id === selectedResource) : filteredResources).map(resource => (
                    <th key={resource.id} className="p-3 text-center text-xs font-medium text-black min-w-[100px]">
                      {resource.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hours.map(hour => (
                  <tr key={hour} className="border-t border-black/[0.06]">
                    <td className="p-3 text-sm text-black">
                      {hour}:00
                    </td>
                    {(selectedResource ? filteredResources.filter(r => r.id === selectedResource) : filteredResources).map(resource => {
                      const booking = getBookingForSlot(resource.id, hour)

                      return (
                        <td key={resource.id} className="p-1">
                          {booking ? (
                            <div 
                              className={`p-2 rounded-lg text-center ${
                                booking.booked_by?.id === staff?.id 
                                  ? 'bg-cyan-100 text-cyan-700' 
                                  : 'bg-white text-black'
                              }`}
                            >
                              {booking.booked_by?.id === staff?.id ? (
                                <button
                                  onClick={() => handleCancelBooking(booking.id)}
                                  className="text-xs hover:underline"
                                >
                                  {booking.title || 'Booked'}
                                  <br />
                                  <span className="text-[10px]">Cancel</span>
                                </button>
                              ) : (
                                <span className="text-xs">
                                  {booking.booked_by?.full_name?.split(' ')[0] || 'Booked'}
                                </span>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => handleBook(resource.id, hour)}
                              className="w-full h-10 rounded-lg border-2 border-dashed border-black/10 hover:border-[var(--av-primary, #0891B2)] hover:bg-[var(--av-primary, #0891B2)]/5 text-xs text-black hover:text-[var(--av-primary, #0891B2)] transition"
                            >
                              +
                            </button>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* My Bookings */}
      <div className="mt-6 bg-white rounded-2xl border border-black/[0.06] p-4">
        <h3 className="font-semibold mb-4">My Bookings Today</h3>
        {bookings.filter(b => b.booked_by?.id === staff?.id).length === 0 ? (
          <p className="text-sm text-black">No bookings for today</p>
        ) : (
          <div className="space-y-2">
            {bookings.filter(b => b.booked_by?.id === staff?.id).map(booking => (
              <div key={booking.id} className="flex items-center justify-between p-3 bg-cyan-50 rounded-lg">
                <div>
                  <div className="font-medium">{booking.resource?.name}</div>
                  <div className="text-sm text-black">
                    {new Date(booking.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(booking.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <button
                  onClick={() => handleCancelBooking(booking.id)}
                  className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-sm"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
