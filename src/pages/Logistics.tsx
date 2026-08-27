import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  Truck, MapPin, Phone, Clock, Loader2
} from 'lucide-react'

export default function Logistics() {
  const { staff } = useAuth()
  const businessId = staff?.business_id
  const [deliveries, setDeliveries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  

  useEffect(() => {
    loadDeliveries()
  }, [])

  async function loadDeliveries() {
    setLoading(true)
    const { data } = await supabase
      .from('delivery_orders')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
    setDeliveries(data || [])
    setLoading(false)
  }

  const pendingCount = deliveries.filter(d => d.status === 'pending' || d.status === 'assigned').length
  const inTransitCount = deliveries.filter(d => d.status === 'in_transit').length
  const deliveredCount = deliveries.filter(d => d.status === 'delivered').length

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--av-text)]">Delivery & Logistics</h1>
          <p className="text-sm text-[var(--av-text)]">Track orders and deliveries</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06] p-4 text-center">
          <div className="text-2xl font-bold text-[var(--av-warning)]">{pendingCount}</div>
          <div className="text-sm text-[var(--av-text)]">Pending</div>
        </div>
        <div className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06] p-4 text-center">
          <div className="text-2xl font-bold text-[var(--av-primary)]">{inTransitCount}</div>
          <div className="text-sm text-[var(--av-text)]">In Transit</div>
        </div>
        <div className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06] p-4 text-center">
          <div className="text-2xl font-bold text-[var(--av-success)]">{deliveredCount}</div>
          <div className="text-sm text-[var(--av-text)]">Delivered</div>
        </div>
      </div>

      {/* Deliveries List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[var(--av-text)]" /></div>
      ) : deliveries.length === 0 ? (
        <div className="text-center py-12 bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06]">
          <Truck size={48} className="mx-auto text-[var(--av-text)]/50 mb-3" />
          <p className="text-[var(--av-text)]">No deliveries yet</p>
          <p className="text-sm text-[var(--av-text)] mt-1">Track orders and delivery status</p>
        </div>
      ) : (
        <div className="space-y-3">
          {deliveries.map((delivery) => (
            <div key={delivery.id} className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06] p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    delivery.status === 'delivered' ? 'bg-[var(--av-success)]/10' :
                    delivery.status === 'in_transit' ? 'bg-[var(--av-primary-soft)]/10' :
                    'bg-[var(--av-warning-soft)]0/10'
                  }`}>
                    <Truck size={20} className={
                      delivery.status === 'delivered' ? 'text-[var(--av-success)]' :
                      delivery.status === 'in_transit' ? 'text-[var(--av-primary)]' :
                      'text-[var(--av-warning)]'
                    } />
                  </div>
                  <div>
                    <h3 className="font-medium">{delivery.order_reference || 'Delivery'}</h3>
                    <p className="text-sm text-[var(--av-text)]">{delivery.client_name}</p>
                  </div>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full ${
                  delivery.status === 'delivered' ? 'bg-[var(--av-success-soft)] text-[var(--av-success)]' :
                  delivery.status === 'in_transit' ? 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]' :
                  delivery.status === 'assigned' ? 'bg-purple-100 text-purple-700' :
                  'bg-[var(--av-warning-soft)] text-[var(--av-warning)]'
                }`}>
                  {delivery.status?.replace('_', ' ')}
                </span>
              </div>
              
              <div className="flex items-start gap-2 text-sm text-[var(--av-text)]/60 mb-3">
                <MapPin size={16} className="mt-0.5" />
                <span>{delivery.client_address}</span>
              </div>
              
              {delivery.client_phone && (
                <div className="flex items-center gap-2 text-sm text-[var(--av-text)]/60 mb-3">
                  <Phone size={16} />
                  <span>{delivery.client_phone}</span>
                </div>
              )}
              
              <div className="flex items-center justify-between pt-3 border-t border-[var(--av-border)]">
                <div className="flex items-center gap-2 text-xs text-[var(--av-text)]">
                  <Clock size={14} />
                  <span>{delivery.scheduled_date ? new Date(delivery.scheduled_date).toLocaleDateString() : 'No date'}</span>
                </div>
                {delivery.delivery_type && (
                  <span className="text-xs bg-[var(--av-surface-3)] px-2 py-1 rounded capitalize">{delivery.delivery_type}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
