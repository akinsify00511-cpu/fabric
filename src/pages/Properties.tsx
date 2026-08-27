// Properties Page
// Real estate property listings and management

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { hasPermission } from '../lib/permissions'
import {
  Building2, Plus, Search, Grid, List, Bed, Bath, Car,
  MapPin as MapPinIcon, Eye, Edit2, Trash2, X,
  Home, DollarSign, CheckCircle2
} from 'lucide-react'

interface Property {
  id: string
  business_id: string
  title: string
  description?: string
  property_type: 'residential' | 'commercial' | 'land' | 'industrial' | 'mixed_use'
  listing_type: 'sale' | 'rent' | 'both'
  address: string
  city: string
  state?: string
  bedrooms?: number
  bathrooms?: number
  parking_spaces?: number
  total_area_sqm?: number
  furnished: boolean
  price?: number
  rent_amount?: number
  status: 'available' | 'under_offer' | 'sold' | 'rented' | 'withdrawn' | 'pending'
  images: string[]
  listed_at: string
  created_at: string
}

const STATUS_COLORS = {
  available: 'bg-[var(--av-success-soft)] text-[var(--av-success)]',
  under_offer: 'bg-[var(--av-warning-soft)] text-[var(--av-warning)]',
  sold: 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]',
  rented: 'bg-purple-100 text-purple-700',
  withdrawn: 'bg-[var(--av-surface-2)] text-[var(--av-text-muted)]',
  pending: 'bg-orange-100 text-orange-700',
}

const PROPERTY_TYPES = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'land', label: 'Land' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'mixed_use', label: 'Mixed Use' },
]

const LISTING_TYPES = [
  { value: 'sale', label: 'For Sale' },
  { value: 'rent', label: 'For Rent' },
  { value: 'both', label: 'Sale/Rent' },
]

export default function PropertiesPage() {
  const { staff } = useAuth()
  const { showToast } = useToast()

  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [listingFilter, setListingFilter] = useState<string>('all')
  const [statusFilter] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [editingProperty, setEditingProperty] = useState<Property | null>(null)
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)

  const canManage = staff ? hasPermission(staff.role || 'staff', 'projects', 'manage') : false

  useEffect(() => {
    if (staff?.business_id) {
      fetchProperties()
    }
  }, [staff?.business_id])

  async function fetchProperties() {
    if (!staff?.business_id) return

    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setProperties(data || [])
    } catch (error) {
      console.error('Error fetching properties:', error)
      showToast('Failed to load properties', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Filtered properties
  const filteredProperties = useMemo(() => {
    return properties.filter(property => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        if (!property.title.toLowerCase().includes(query) &&
            !property.address.toLowerCase().includes(query) &&
            !property.city.toLowerCase().includes(query)) {
          return false
        }
      }
      if (typeFilter !== 'all' && property.property_type !== typeFilter) return false
      if (listingFilter !== 'all' && property.listing_type !== listingFilter) return false
      if (statusFilter !== 'all' && property.status !== statusFilter) return false
      return true
    })
  }, [properties, searchQuery, typeFilter, listingFilter, statusFilter])

  // Stats
  const stats = useMemo(() => {
    const total = properties.length
    const forSale = properties.filter(p => p.listing_type === 'sale' || p.listing_type === 'both').length
    const forRent = properties.filter(p => p.listing_type === 'rent' || p.listing_type === 'both').length
    const available = properties.filter(p => p.status === 'available').length
    return { total, forSale, forRent, available }
  }, [properties])

  // Form state
  const [formData, setFormData] = useState<{
    title: string
    description: string
    property_type: 'residential' | 'commercial' | 'land' | 'industrial' | 'mixed_use'
    listing_type: 'sale' | 'rent' | 'both'
    address: string
    city: string
    state: string
    bedrooms: string
    bathrooms: string
    parking_spaces: string
    total_area_sqm: string
    furnished: boolean
    price: string
    rent_amount: string
    status: 'available' | 'under_offer' | 'sold' | 'rented' | 'withdrawn' | 'pending'
  }>({
    title: '',
    description: '',
    property_type: 'residential',
    listing_type: 'sale',
    address: '',
    city: '',
    state: '',
    bedrooms: '',
    bathrooms: '',
    parking_spaces: '',
    total_area_sqm: '',
    furnished: false,
    price: '',
    rent_amount: '',
    status: 'available',
  })

  function openModal(property?: Property) {
    if (property) {
      setEditingProperty(property)
      setFormData({
        title: property.title,
        description: property.description || '',
        property_type: property.property_type,
        listing_type: property.listing_type,
        address: property.address,
        city: property.city,
        state: property.state || '',
        bedrooms: property.bedrooms?.toString() || '',
        bathrooms: property.bathrooms?.toString() || '',
        parking_spaces: property.parking_spaces?.toString() || '',
        total_area_sqm: property.total_area_sqm?.toString() || '',
        furnished: property.furnished,
        price: property.price?.toString() || '',
        rent_amount: property.rent_amount?.toString() || '',
        status: property.status,
      })
    } else {
      setEditingProperty(null)
      setFormData({
        title: '',
        description: '',
        property_type: 'residential',
        listing_type: 'sale',
        address: '',
        city: '',
        state: '',
        bedrooms: '',
        bathrooms: '',
        parking_spaces: '',
        total_area_sqm: '',
        furnished: false,
        price: '',
        rent_amount: '',
        status: 'available',
      })
    }
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!staff?.business_id) return

    try {
      const propertyData = {
        business_id: staff.business_id,
        title: formData.title,
        description: formData.description || null,
        property_type: formData.property_type,
        listing_type: formData.listing_type,
        address: formData.address,
        city: formData.city,
        state: formData.state || null,
        bedrooms: formData.bedrooms ? parseInt(formData.bedrooms) : null,
        bathrooms: formData.bathrooms ? parseInt(formData.bathrooms) : null,
        parking_spaces: formData.parking_spaces ? parseInt(formData.parking_spaces) : null,
        total_area_sqm: formData.total_area_sqm ? parseFloat(formData.total_area_sqm) : null,
        furnished: formData.furnished,
        price: formData.price ? parseFloat(formData.price) : null,
        rent_amount: formData.rent_amount ? parseFloat(formData.rent_amount) : null,
        status: formData.status,
        images: editingProperty?.images || [],
      }

      if (editingProperty) {
        const { error } = await supabase
          .from('properties')
          .update(propertyData)
          .eq('id', editingProperty.id)

        if (error) throw error
        showToast('Property updated', 'success')
      } else {
        const { error } = await supabase
          .from('properties')
          .insert(propertyData)

        if (error) throw error
        showToast('Property created', 'success')
      }

      setShowModal(false)
      fetchProperties()
    } catch (error) {
      console.error('Error saving property:', error)
      showToast('Failed to save property', 'error')
    }
  }

  async function deleteProperty(id: string) {
    if (!confirm('Are you sure you want to delete this property?')) return

    try {
      const { error } = await supabase
        .from('properties')
        .delete()
        .eq('id', id)

      if (error) throw error
      showToast('Property deleted', 'success')
      fetchProperties()
    } catch (error) {
      console.error('Error deleting property:', error)
      showToast('Failed to delete property', 'error')
    }
  }

  function formatCurrency(amount?: number): string {
    if (!amount) return '-'
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[var(--av-surface)] border-b border-[var(--av-border)] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[var(--av-text)]">Properties</h1>
            <p className="text-sm text-[var(--av-text-muted)] mt-0.5">
              Manage your real estate listings
            </p>
          </div>
          {canManage && (
            <button
              onClick={() => openModal()}
              className="px-4 py-2 bg-[var(--av-primary)] text-white rounded-lg text-sm font-medium hover:bg-[var(--av-primary-hover)] flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Property
            </button>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-[var(--av-surface-elevated)] rounded-xl p-4 border border-[var(--av-border)]">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[var(--av-primary-soft)]">
                <Building2 className="w-5 h-5 text-[var(--av-primary)]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--av-text)]">{stats.total}</p>
                <p className="text-sm text-[var(--av-text-muted)]">Total Properties</p>
              </div>
            </div>
          </div>
          <div className="bg-[var(--av-surface-elevated)] rounded-xl p-4 border border-[var(--av-border)]">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[var(--av-success-soft)]">
                <DollarSign className="w-5 h-5 text-[var(--av-success)]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--av-text)]">{stats.forSale}</p>
                <p className="text-sm text-[var(--av-text-muted)]">For Sale</p>
              </div>
            </div>
          </div>
          <div className="bg-[var(--av-surface-elevated)] rounded-xl p-4 border border-[var(--av-border)]">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <Home className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--av-text)]">{stats.forRent}</p>
                <p className="text-sm text-[var(--av-text-muted)]">For Rent</p>
              </div>
            </div>
          </div>
          <div className="bg-[var(--av-surface-elevated)] rounded-xl p-4 border border-[var(--av-border)]">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <CheckCircle2 className="w-5 h-5 text-[var(--av-warning)]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--av-text)]">{stats.available}</p>
                <p className="text-sm text-[var(--av-text-muted)]">Available</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-[var(--av-surface-elevated)] rounded-xl border border-[var(--av-border)] mb-6">
          <div className="p-4 flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--av-text-disabled)]" />
                <input
                  type="text"
                  placeholder="Search properties..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              {PROPERTY_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>

            <select
              value={listingFilter}
              onChange={(e) => setListingFilter(e.target.value)}
              className="px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Listings</option>
              {LISTING_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>

            <div className="flex border border-[var(--av-border)] rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-2 ${viewMode === 'grid' ? 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]' : 'text-[var(--av-text-muted)] hover:bg-gray-50'}`}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-2 ${viewMode === 'list' ? 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]' : 'text-[var(--av-text-muted)] hover:bg-gray-50'}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Properties Grid/List */}
        {loading ? (
          <div className="bg-[var(--av-surface-elevated)] rounded-xl border border-[var(--av-border)] p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-[var(--av-primary)] border-t-transparent rounded-full mx-auto"></div>
          </div>
        ) : filteredProperties.length === 0 ? (
          <div className="bg-[var(--av-surface-elevated)] rounded-xl border border-[var(--av-border)] p-8 text-center">
            <Building2 className="w-12 h-12 text-[var(--av-text-disabled)] mx-auto" />
            <p className="text-[var(--av-text-muted)] mt-2">No properties found</p>
            <p className="text-sm text-[var(--av-text-disabled)] mt-1">Add your first property listing</p>
            {canManage && (
              <button
                onClick={() => openModal()}
                className="mt-4 px-4 py-2 bg-[var(--av-primary)] text-white rounded-lg text-sm hover:bg-[var(--av-primary-hover)]"
              >
                Add Property
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProperties.map((property) => (
              <div key={property.id} className="bg-[var(--av-surface-elevated)] rounded-xl border border-[var(--av-border)] overflow-hidden hover:shadow-md transition-shadow">
                {/* Image */}
                <div className="aspect-[4/3] bg-[var(--av-surface-2)] relative">
                  {property.images && property.images.length > 0 ? (
                    <img
                      src={property.images[0]}
                      alt={property.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Building2 className="w-12 h-12 text-[var(--av-text-disabled)]" />
                    </div>
                  )}
                  <div className="absolute top-3 left-3 flex gap-2">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      property.listing_type === 'sale' ? 'bg-[var(--av-success)]' :
                      property.listing_type === 'rent' ? 'bg-purple-600' : 'bg-[var(--av-primary)]'
                    } text-white`}>
                      {property.listing_type === 'sale' ? 'Sale' :
                       property.listing_type === 'rent' ? 'Rent' : 'Sale/Rent'}
                    </span>
                  </div>
                  <span className={`absolute top-3 right-3 px-2 py-1 text-xs rounded-full ${STATUS_COLORS[property.status]}`}>
                    {property.status}
                  </span>
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="font-medium text-[var(--av-text)] line-clamp-1">{property.title}</h3>
                  <p className="text-sm text-[var(--av-text-muted)] mt-1 flex items-center gap-1">
                    <MapPinIcon className="w-3 h-3" />
                    {property.city}{property.state ? `, ${property.state}` : ''}
                  </p>

                  {/* Specs */}
                  <div className="flex items-center gap-4 mt-3 text-sm text-[var(--av-text-muted)]">
                    {property.bedrooms && (
                      <span className="flex items-center gap-1">
                        <Bed className="w-4 h-4" /> {property.bedrooms}
                      </span>
                    )}
                    {property.bathrooms && (
                      <span className="flex items-center gap-1">
                        <Bath className="w-4 h-4" /> {property.bathrooms}
                      </span>
                    )}
                    {property.parking_spaces && (
                      <span className="flex items-center gap-1">
                        <Car className="w-4 h-4" /> {property.parking_spaces}
                      </span>
                    )}
                    {property.total_area_sqm && (
                      <span>{property.total_area_sqm}m²</span>
                    )}
                  </div>

                  {/* Price */}
                  <div className="mt-3 flex items-baseline gap-2">
                    {property.listing_type !== 'rent' && property.price && (
                      <span className="text-lg font-bold text-[var(--av-text)]">{formatCurrency(property.price)}</span>
                    )}
                    {property.listing_type !== 'sale' && property.rent_amount && (
                      <span className="text-lg font-bold text-[var(--av-text)]">
                        {formatCurrency(property.rent_amount)}
                        <span className="text-sm font-normal text-[var(--av-text-muted)]">/mo</span>
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[var(--av-border)]">
                    <button
                      onClick={() => setSelectedProperty(property)}
                      className="flex-1 px-3 py-2 text-sm text-[var(--av-text-muted)] hover:bg-gray-50 rounded-lg"
                    >
                      View
                    </button>
                    {canManage && (
                      <>
                        <button
                          onClick={() => openModal(property)}
                          className="p-2 text-[var(--av-text-disabled)] hover:text-[var(--av-primary)] hover:bg-[var(--av-primary-soft)] rounded-lg"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteProperty(property.id)}
                          className="p-2 text-[var(--av-text-disabled)] hover:text-[var(--av-danger)] hover:bg-[var(--av-danger-soft)] rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-[var(--av-surface-elevated)] rounded-xl border border-[var(--av-border)] overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-[var(--av-border)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--av-text-muted)] uppercase">Property</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--av-text-muted)] uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--av-text-muted)] uppercase">Listing</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--av-text-muted)] uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--av-text-muted)] uppercase">Price</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--av-text-muted)] uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredProperties.map((property) => (
                  <tr key={property.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded bg-[var(--av-surface-2)] flex items-center justify-center">
                          <Building2 className="w-6 h-6 text-[var(--av-text-disabled)]" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[var(--av-text)]">{property.title}</p>
                          <p className="text-xs text-[var(--av-text-muted)]">{property.city}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--av-text-muted)]">
                      {PROPERTY_TYPES.find(t => t.value === property.property_type)?.label}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        property.listing_type === 'sale' ? 'bg-[var(--av-success-soft)] text-[var(--av-success)]' :
                        property.listing_type === 'rent' ? 'bg-purple-100 text-purple-700' :
                        'bg-[var(--av-primary-soft)] text-[var(--av-primary)]'
                      }`}>
                        {LISTING_TYPES.find(t => t.value === property.listing_type)?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${STATUS_COLORS[property.status]}`}>
                        {property.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-[var(--av-text)]">
                      {property.listing_type !== 'rent' && property.price ? formatCurrency(property.price) : ''}
                      {property.listing_type !== 'sale' && property.rent_amount ? formatCurrency(property.rent_amount) + '/mo' : ''}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedProperty(property)}
                          className="p-1.5 text-[var(--av-text-disabled)] hover:text-[var(--av-primary)] hover:bg-[var(--av-primary-soft)] rounded"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {canManage && (
                          <>
                            <button
                              onClick={() => openModal(property)}
                              className="p-1.5 text-[var(--av-text-disabled)] hover:text-[var(--av-primary)] hover:bg-[var(--av-primary-soft)] rounded"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteProperty(property.id)}
                              className="p-1.5 text-[var(--av-text-disabled)] hover:text-[var(--av-danger)] hover:bg-[var(--av-danger-soft)] rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Property Detail Modal */}
      {selectedProperty && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--av-surface-elevated)] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[var(--av-border)] flex items-center justify-between">
              <h2 className="text-lg font-semibold">{selectedProperty.title}</h2>
              <button
                onClick={() => setSelectedProperty(null)}
                className="p-2 hover:bg-[var(--av-surface-2)] rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {/* Image */}
              <div className="aspect-video bg-[var(--av-surface-2)] rounded-lg mb-6 flex items-center justify-center">
                {selectedProperty.images && selectedProperty.images.length > 0 ? (
                  <img
                    src={selectedProperty.images[0]}
                    alt={selectedProperty.title}
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <Building2 className="w-16 h-16 text-[var(--av-text-disabled)]" />
                )}
              </div>

              {/* Details */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    selectedProperty.listing_type === 'sale' ? 'bg-[var(--av-success-soft)] text-[var(--av-success)]' :
                    selectedProperty.listing_type === 'rent' ? 'bg-purple-100 text-purple-700' :
                    'bg-[var(--av-primary-soft)] text-[var(--av-primary)]'
                  }`}>
                    {LISTING_TYPES.find(t => t.value === selectedProperty.listing_type)?.label}
                  </span>
                  <span className={`px-2 py-1 text-xs rounded-full ${STATUS_COLORS[selectedProperty.status]}`}>
                    {selectedProperty.status}
                  </span>
                </div>

                <div className="flex items-start gap-2 text-[var(--av-text-muted)]">
                  <MapPinIcon className="w-5 h-5 mt-0.5" />
                  <span>{selectedProperty.address}, {selectedProperty.city}{selectedProperty.state ? `, ${selectedProperty.state}` : ''}</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {selectedProperty.bedrooms && (
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <Bed className="w-6 h-6 text-[var(--av-text-disabled)] mx-auto" />
                      <p className="text-lg font-bold text-[var(--av-text)]">{selectedProperty.bedrooms}</p>
                      <p className="text-xs text-[var(--av-text-muted)]">Bedrooms</p>
                    </div>
                  )}
                  {selectedProperty.bathrooms && (
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <Bath className="w-6 h-6 text-[var(--av-text-disabled)] mx-auto" />
                      <p className="text-lg font-bold text-[var(--av-text)]">{selectedProperty.bathrooms}</p>
                      <p className="text-xs text-[var(--av-text-muted)]">Bathrooms</p>
                    </div>
                  )}
                  {selectedProperty.total_area_sqm && (
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <Home className="w-6 h-6 text-[var(--av-text-disabled)] mx-auto" />
                      <p className="text-lg font-bold text-[var(--av-text)]">{selectedProperty.total_area_sqm}m²</p>
                      <p className="text-xs text-[var(--av-text-muted)]">Area</p>
                    </div>
                  )}
                  {selectedProperty.furnished && (
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <CheckCircle2 className="w-6 h-6 text-[var(--av-success)] mx-auto" />
                      <p className="text-sm font-medium text-[var(--av-text)]">Furnished</p>
                    </div>
                  )}
                </div>

                {selectedProperty.description && (
                  <div>
                    <h4 className="text-sm font-medium text-[var(--av-text-secondary)] mb-1">Description</h4>
                    <p className="text-sm text-[var(--av-text-muted)]">{selectedProperty.description}</p>
                  </div>
                )}

                <div className="border-t border-[var(--av-border)] pt-4">
                  {selectedProperty.listing_type !== 'rent' && selectedProperty.price && (
                    <div>
                      <p className="text-xs text-[var(--av-text-muted)]">Sale Price</p>
                      <p className="text-2xl font-bold text-[var(--av-text)]">{formatCurrency(selectedProperty.price)}</p>
                    </div>
                  )}
                  {selectedProperty.listing_type !== 'sale' && selectedProperty.rent_amount && (
                    <div>
                      <p className="text-xs text-[var(--av-text-muted)]">Monthly Rent</p>
                      <p className="text-2xl font-bold text-[var(--av-text)]">
                        {formatCurrency(selectedProperty.rent_amount)}
                        <span className="text-sm font-normal text-[var(--av-text-muted)]">/month</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--av-surface-elevated)] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[var(--av-border)]">
              <h2 className="text-lg font-semibold">
                {editingProperty ? 'Edit Property' : 'Add Property'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">Title *</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 3 Bedroom Flat in Lekki"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">Property Type *</label>
                  <select
                    required
                    value={formData.property_type}
                    onChange={(e) => setFormData({ ...formData, property_type: e.target.value as any })}
                    className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {PROPERTY_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">Listing Type *</label>
                  <select
                    required
                    value={formData.listing_type}
                    onChange={(e) => setFormData({ ...formData, listing_type: e.target.value as any })}
                    className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {LISTING_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">Address *</label>
                  <input
                    type="text"
                    required
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Street address"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">City *</label>
                  <input
                    type="text"
                    required
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Lagos"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">State</label>
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Lagos State"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">Bedrooms</label>
                  <input
                    type="number"
                    value={formData.bedrooms}
                    onChange={(e) => setFormData({ ...formData, bedrooms: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">Bathrooms</label>
                  <input
                    type="number"
                    value={formData.bathrooms}
                    onChange={(e) => setFormData({ ...formData, bathrooms: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">Parking Spaces</label>
                  <input
                    type="number"
                    value={formData.parking_spaces}
                    onChange={(e) => setFormData({ ...formData, parking_spaces: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">Area (m²)</label>
                  <input
                    type="number"
                    value={formData.total_area_sqm}
                    onChange={(e) => setFormData({ ...formData, total_area_sqm: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {formData.listing_type !== 'rent' && (
                  <div>
                    <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">Sale Price (₦)</label>
                    <input
                      type="number"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                {formData.listing_type !== 'sale' && (
                  <div>
                    <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">Monthly Rent (₦)</label>
                    <input
                      type="number"
                      value={formData.rent_amount}
                      onChange={(e) => setFormData({ ...formData, rent_amount: e.target.value })}
                      className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-[var(--av-text-secondary)] mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--av-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Property description..."
                  />
                </div>

                <div className="col-span-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.furnished}
                      onChange={(e) => setFormData({ ...formData, furnished: e.target.checked })}
                      className="w-4 h-4 text-[var(--av-primary)] border-[var(--av-border-strong)] rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-[var(--av-text-secondary)]">Furnished</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-[var(--av-border)] rounded-lg text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[var(--av-primary)] text-white rounded-lg text-sm hover:bg-[var(--av-primary-hover)]"
                >
                  {editingProperty ? 'Save Changes' : 'Add Property'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
