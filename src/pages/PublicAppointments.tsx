// Public Appointments Page
// Unauthenticated customer booking

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  Calendar, Clock, User, MapPin, Phone, Mail, CheckCircle2,
  AlertCircle, ChevronLeft, ChevronRight, Loader2
} from 'lucide-react'

interface Service {
  id: string
  name: string
  description?: string
  duration_minutes: number
  price?: number
  color?: string
}

interface Staff {
  id: string
  full_name: string
  avatar_url?: string
  bio?: string
}

interface TimeSlot {
  time: string
  available: boolean
}

interface BookingForm {
  service_id: string
  staff_id?: string
  date: string
  time: string
  name: string
  email: string
  phone: string
  notes?: string
}

const TIME_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00'
]

export default function PublicAppointmentsPage() {
  const { slug } = useParams<{ slug?: string }>()
  const [searchParams] = useSearchParams()

  const [business, setBusiness] = useState<any>(null)
  const [services, setServices] = useState<Service[]>([])
  const [staffMembers, setStaffMembers] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(1)

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([])

  // Form state
  const [form, setForm] = useState<BookingForm>({
    service_id: '',
    staff_id: '',
    date: '',
    time: '',
    name: '',
    email: '',
    phone: '',
    notes: '',
  })

  // Submission state
  const [submitting, setSubmitting] = useState(false)
  const [bookingRef, setBookingRef] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadBusinessData()
  }, [slug])

  useEffect(() => {
    if (selectedDate) {
      loadAvailableSlots()
    }
  }, [selectedDate, form.service_id, form.staff_id])

  async function loadBusinessData() {
    try {
      setLoading(true)

      // Get business by slug or default
      let businessQuery = supabase
        .from('businesses')
        .select('*')
        .limit(1)

      if (slug) {
        const { data: biz } = await supabase
          .from('businesses')
          .select('*')
          .eq('slug', slug)
          .maybeSingle()
        
        if (biz) {
          setBusiness(biz)
          businessQuery = supabase
            .from('businesses')
            .select('*')
            .eq('id', biz.id)
        }
      } else {
        const { data: defaultBiz } = await businessQuery.maybeSingle()
        setBusiness(defaultBiz)
      }

      // Load services
      const { data: servicesData } = await supabase
        .from('services')
        .select('*')
        .order('name')

      if (servicesData) {
        setServices(servicesData)
      }

      // Load staff
      const { data: staffData } = await supabase
        .from('staff')
        .select('id, full_name, avatar_url, bio')
        .order('full_name')

      if (staffData) {
        setStaffMembers(staffData)
      }

      // Pre-select service from URL
      const serviceId = searchParams.get('service')
      if (serviceId) {
        setForm(prev => ({ ...prev, service_id: serviceId }))
      }
    } catch (err) {
      console.error('Error loading business data:', err)
      setError('Failed to load booking information')
    } finally {
      setLoading(false)
    }
  }

  async function loadAvailableSlots() {
    if (!selectedDate || !form.service_id || !business) return

    const dateStr = selectedDate.toISOString().split('T')[0]
    const service = services.find(s => s.id === form.service_id)

    // Real availability: query existing appointments for this business on the
    // selected date (+ optional staff filter) and mark any slot whose window
    // overlaps an existing appointment as taken. A booker never sees a slot
    // they can't actually have.
    const dayStart = new Date(dateStr + 'T00:00:00')
    const dayEnd = new Date(dateStr + 'T23:59:59')

    const query = supabase
      .from('appointments')
      .select('start_time, end_time, staff_id, status')
      .eq('business_id', business.id)
      .gte('start_time', dayStart.toISOString())
      .lte('start_time', dayEnd.toISOString())
      .in('status', ['confirmed', 'pending'])

    if (form.staff_id) query.eq('staff_id', form.staff_id)

    const { data: booked } = await query

    const overlaps = (slotStart: Date, slotEnd: Date) =>
      (booked || []).some(b => {
        if (b.status === 'cancelled') return false
        const bs = new Date(b.start_time)
        const be = new Date(b.end_time)
        return slotStart < be && bs < slotEnd
      })

    const duration = service?.duration_minutes || 60
    const slots: TimeSlot[] = TIME_SLOTS.map(time => {
      const [h, m] = time.split(':').map(Number)
      const slotStart = new Date(selectedDate)
      slotStart.setHours(h, m, 0, 0)
      const slotEnd = new Date(slotStart.getTime() + duration * 60000)
      return { time, available: !overlaps(slotStart, slotEnd) }
    })

    setAvailableSlots(slots)
    setForm(prev => ({ ...prev, date: dateStr, time: '', staff_id: prev.staff_id || '' }))
  }

  async function submitBooking() {
    if (!business || !form.service_id || !form.date || !form.time) {
      setError('Please fill in all required fields')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      // Create client (if not exists by email)
      let clientId: string | null = null

      // Upsert client by (business_id, email). Anonymous users cannot SELECT
      // existing client rows (RLS blocks it), so a check-then-insert pattern
      // would crash with a UNIQUE violation on the second booking by the same
      // person. upsert with onConflict resolves this atomically.
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .upsert({
          business_id: business.id,
          business_name: form.name,
          email: form.email,
          phone: form.phone,
        }, { onConflict: 'business_id,email' })
        .select('id')
        .single()

      if (clientError) throw clientError
      clientId = client.id

      // Create appointment
      const appointmentDate = new Date(`${form.date}T${form.time}`)
      const service = services.find(s => s.id === form.service_id)
      const endTime = new Date(appointmentDate.getTime() + (service?.duration_minutes || 60) * 60000)

      const { data: appointment, error: apptError } = await supabase
        .from('appointments')
        .insert({
          business_id: business.id,
          client_id: clientId,
          service_id: form.service_id,
          staff_id: form.staff_id || null,
          start_time: appointmentDate.toISOString(),
          end_time: endTime.toISOString(),
          status: 'confirmed',
          notes: form.notes,
          booking_reference: `APT-${Date.now().toString(36).toUpperCase()}`,
        })
        .select('booking_reference')
        .single()

      if (apptError) throw apptError

      setBookingRef(appointment.booking_reference)
      setStep(4) // Success step
    } catch (err) {
      console.error('Error creating booking:', err)
      setError('Failed to create booking. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Calendar helpers
  function getDaysInMonth(date: Date) {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const days: Date[] = []

    // Add padding days from previous month
    const startPadding = firstDay.getDay()
    for (let i = startPadding - 1; i >= 0; i--) {
      days.push(new Date(year, month, -i))
    }

    // Add days of current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i))
    }

    // Add padding days for next month
    const endPadding = 42 - days.length
    for (let i = 1; i <= endPadding; i++) {
      days.push(new Date(year, month + 1, i))
    }

    return days
  }

  function isDateSelectable(date: Date): boolean {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dayOfWeek = date.getDay()
    
    // Can't book in the past
    if (date < today) return false
    
    // Can't book on weekends (optional - remove if needed)
    if (dayOfWeek === 0 || dayOfWeek === 6) return false
    
    return true
  }

  function isToday(date: Date): boolean {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  function isSelected(date: Date): boolean {
    return selectedDate?.toDateString() === date.toDateString()
  }

  const days = getDaysInMonth(currentMonth)
  const selectedService = services.find(s => s.id === form.service_id)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-xl font-semibold text-gray-900">
            {business?.business_name || 'Book an Appointment'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Schedule your appointment online</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {[
              { num: 1, label: 'Service' },
              { num: 2, label: 'Date & Time' },
              { num: 3, label: 'Details' },
              { num: 4, label: 'Confirm' },
            ].map((s, i) => (
              <div key={s.num} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step >= s.num
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}>
                  {step > s.num ? <CheckCircle2 className="w-5 h-5" /> : s.num}
                </div>
                <span className={`ml-2 text-sm font-medium ${
                  step >= s.num ? 'text-gray-900' : 'text-gray-400'
                }`}>
                  {s.label}
                </span>
                {i < 3 && (
                  <div className={`w-12 h-0.5 mx-4 ${
                    step > s.num ? 'bg-blue-600' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Step 1: Service Selection */}
        {step === 1 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Select a Service</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {services.map(service => (
                <div
                  key={service.id}
                  onClick={() => setForm(prev => ({ ...prev, service_id: service.id }))}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    form.service_id === service.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">{service.name}</h3>
                      {service.description && (
                        <p className="text-sm text-gray-500 mt-1">{service.description}</p>
                      )}
                    </div>
                    <div className="text-right">
                      {service.price && (
                        <p className="font-semibold text-gray-900">
                          ₦{service.price.toLocaleString()}
                        </p>
                      )}
                      <p className="text-xs text-gray-500">
                        {service.duration_minutes} min
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {form.service_id && (
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setStep(2)}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2"
                >
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Date & Time Selection */}
        {step === 2 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Calendar */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">
                  {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const d = new Date(currentMonth)
                      d.setMonth(d.getMonth() - 1)
                      setCurrentMonth(d)
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => {
                      const d = new Date(currentMonth)
                      d.setMonth(d.getMonth() + 1)
                      setCurrentMonth(d)
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {days.map((date, i) => {
                  const selectable = isDateSelectable(date)
                  const isCurrentMonth = date.getMonth() === currentMonth.getMonth()
                  
                  return (
                    <button
                      key={i}
                      onClick={() => selectable && setSelectedDate(date)}
                      disabled={!selectable}
                      className={`aspect-square flex items-center justify-center rounded-lg text-sm ${
                        !isCurrentMonth
                          ? 'text-gray-300'
                          : !selectable
                          ? 'text-gray-300 cursor-not-allowed'
                          : isSelected(date)
                          ? 'bg-blue-600 text-white'
                          : isToday(date)
                          ? 'bg-blue-100 text-blue-600'
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      {date.getDate()}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Time Slots */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">
                {selectedDate
                  ? `Available Times - ${selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`
                  : 'Select a date first'}
              </h3>

              {selectedDate ? (
                <div className="grid grid-cols-3 gap-2">
                  {availableSlots.map(slot => (
                    <button
                      key={slot.time}
                      onClick={() => slot.available && setForm(prev => ({ ...prev, time: slot.time }))}
                      disabled={!slot.available}
                      className={`py-2 px-3 rounded-lg text-sm font-medium ${
                        !slot.available
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed line-through'
                          : form.time === slot.time
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 hover:bg-gray-200'
                      }`}
                    >
                      {slot.time}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Please select a date to see available times</p>
              )}

              {form.time && (
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setStep(3)}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2"
                  >
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Contact Details */}
        {step === 3 && (
          <div className="max-w-lg mx-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Details</h2>

            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+234..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Any special requests or notes..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-between">
              <button
                onClick={() => setStep(2)}
                className="px-6 py-2 border border-gray-200 rounded-lg font-medium hover:bg-gray-50 flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={submitBooking}
                disabled={submitting || !form.name || !form.email || !form.phone}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Booking...
                  </>
                ) : (
                  <>
                    Confirm Booking
                    <CheckCircle2 className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Confirmation */}
        {step === 4 && (
          <div className="max-w-lg mx-auto text-center">
            <div className="bg-white rounded-xl border border-gray-200 p-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>

              <h2 className="text-xl font-semibold text-gray-900 mb-2">Booking Confirmed!</h2>
              <p className="text-gray-500 mb-6">
                Your appointment has been scheduled successfully.
              </p>

              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-500">Booking Reference</p>
                <p className="text-2xl font-bold text-gray-900">{bookingRef}</p>
              </div>

              <div className="text-left bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{selectedService?.name}</p>
                    <p className="text-xs text-gray-500">
                      {selectedDate?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at {form.time}
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-sm text-gray-500 mt-6">
                A confirmation email has been sent to <strong>{form.email}</strong>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
