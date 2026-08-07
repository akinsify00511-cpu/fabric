// Appraisals Page
// Employee performance reviews and evaluations

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { hasPermission } from '../lib/permissions'
import {
  Award, Users, Plus, Search, Filter, ChevronDown, ChevronUp,
  Star, TrendingUp, Calendar, FileText, Edit2, Trash2,
  Eye, MoreHorizontal, Send, CheckCircle2, Clock, ChevronRight
} from 'lucide-react'

interface PerformanceReview {
  id: string
  staff_id: string
  reviewer_id?: string
  review_period?: string
  rating_overall?: number
  rating_quality?: number
  rating_productivity?: number
  rating_communication?: number
  rating_teamwork?: number
  goals_achieved?: string
  goals_next_period?: string
  strengths?: string
  improvements?: string
  created_at: string
  staff_name?: string
  reviewer_name?: string
}

interface Staff {
  id: string
  full_name: string
  email: string
}

export default function AppraisalsPage() {
  const { staff } = useAuth()
  const { showToast } = useToast()

  const [activeTab, setActiveTab] = useState<'reviews' | 'overview'>('reviews')
  const [reviews, setReviews] = useState<PerformanceReview[]>([])
  const [allStaff, setAllStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [periodFilter, setPeriodFilter] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [editingReview, setEditingReview] = useState<PerformanceReview | null>(null)
  const [expandedReview, setExpandedReview] = useState<string | null>(null)

  const canManage = staff ? hasPermission(staff.role || 'staff', 'staff', 'manage') : false

  // Form state
  const [formData, setFormData] = useState({
    staff_id: '',
    reviewer_id: '',
    review_period: '',
    rating_overall: 3,
    rating_quality: 3,
    rating_productivity: 3,
    rating_communication: 3,
    rating_teamwork: 3,
    goals_achieved: '',
    goals_next_period: '',
    strengths: '',
    improvements: '',
  })

  useEffect(() => {
    if (staff?.business_id) {
      fetchReviews()
      fetchStaff()
    }
  }, [staff?.business_id])

  async function fetchReviews() {
    if (!staff?.business_id) return

    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('performance_reviews')
        .select(`
          *,
          staff:staff_id(full_name),
          reviewer:reviewer_id(full_name)
        `)
        .in('staff_id', await getStaffIds())
        .order('created_at', { ascending: false })

      if (error) throw error

      const reviewsWithNames = (data || []).map(review => ({
        ...review,
        staff_name: review.staff?.full_name,
        reviewer_name: review.reviewer?.full_name,
      }))

      setReviews(reviewsWithNames)
    } catch (error) {
      console.error('Error fetching reviews:', error)
      showToast('Failed to load performance reviews', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function getStaffIds(): Promise<string[]> {
    if (!staff?.business_id) return []
    
    const { data } = await supabase
      .from('staff')
      .select('id')
      .eq('business_id', staff.business_id)
    
    return (data || []).map(s => s.id)
  }

  async function fetchStaff() {
    if (!staff?.business_id) return

    try {
      const { data } = await supabase
        .from('staff')
        .select('id, full_name, email')
        .eq('business_id', staff.business_id)
        .order('full_name')

      if (data) setAllStaff(data)
    } catch (error) {
      console.error('Error fetching staff:', error)
    }
  }

  // Filter reviews
  const filteredReviews = useMemo(() => {
    return reviews.filter(review => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        if (!review.staff_name?.toLowerCase().includes(query) &&
            !review.review_period?.toLowerCase().includes(query)) {
          return false
        }
      }
      if (periodFilter !== 'all' && review.review_period !== periodFilter) return false
      return true
    })
  }, [reviews, searchQuery, periodFilter])

  // Get unique periods for filter
  const uniquePeriods = useMemo(() => {
    const periods = new Set(reviews.map(r => r.review_period).filter(Boolean))
    return Array.from(periods).sort()
  }, [reviews])

  // Stats
  const stats = useMemo(() => {
    const totalReviews = reviews.length
    const avgRating = reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + (r.rating_overall || 0), 0) / reviews.filter(r => r.rating_overall).length).toFixed(1)
      : '0.0'
    const thisQuarter = reviews.filter(r => r.review_period?.includes(new Date().getFullYear().toString())).length
    
    return { totalReviews, avgRating, thisQuarter }
  }, [reviews])

  function openModal(review?: PerformanceReview) {
    if (review) {
      setEditingReview(review)
      setFormData({
        staff_id: review.staff_id,
        reviewer_id: review.reviewer_id || staff?.id || '',
        review_period: review.review_period || '',
        rating_overall: review.rating_overall || 3,
        rating_quality: review.rating_quality || 3,
        rating_productivity: review.rating_productivity || 3,
        rating_communication: review.rating_communication || 3,
        rating_teamwork: review.rating_teamwork || 3,
        goals_achieved: review.goals_achieved || '',
        goals_next_period: review.goals_next_period || '',
        strengths: review.strengths || '',
        improvements: review.improvements || '',
      })
    } else {
      setEditingReview(null)
      setFormData({
        staff_id: '',
        reviewer_id: staff?.id || '',
        review_period: '',
        rating_overall: 3,
        rating_quality: 3,
        rating_productivity: 3,
        rating_communication: 3,
        rating_teamwork: 3,
        goals_achieved: '',
        goals_next_period: '',
        strengths: '',
        improvements: '',
      })
    }
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!staff?.business_id) return

    try {
      const reviewData = {
        staff_id: formData.staff_id,
        reviewer_id: formData.reviewer_id || null,
        review_period: formData.review_period || null,
        rating_overall: formData.rating_overall,
        rating_quality: formData.rating_quality,
        rating_productivity: formData.rating_productivity,
        rating_communication: formData.rating_communication,
        rating_teamwork: formData.rating_teamwork,
        goals_achieved: formData.goals_achieved || null,
        goals_next_period: formData.goals_next_period || null,
        strengths: formData.strengths || null,
        improvements: formData.improvements || null,
      }

      if (editingReview) {
        const { error } = await supabase
          .from('performance_reviews')
          .update(reviewData)
          .eq('id', editingReview.id)

        if (error) throw error
        showToast('Review updated', 'success')
      } else {
        const { error } = await supabase
          .from('performance_reviews')
          .insert(reviewData)

        if (error) throw error
        showToast('Review created', 'success')
      }

      setShowModal(false)
      fetchReviews()
    } catch (error) {
      console.error('Error saving review:', error)
      showToast('Failed to save review', 'error')
    }
  }

  async function deleteReview(id: string) {
    if (!confirm('Are you sure you want to delete this review?')) return

    try {
      const { error } = await supabase
        .from('performance_reviews')
        .delete()
        .eq('id', id)

      if (error) throw error
      showToast('Review deleted', 'success')
      fetchReviews()
    } catch (error) {
      console.error('Error deleting review:', error)
      showToast('Failed to delete review', 'error')
    }
  }

  function renderStars(rating: number) {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-4 h-4 ${star <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`}
          />
        ))}
      </div>
    )
  }

  function RatingInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={5}
            step={0.5}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="flex-1"
          />
          <span className="w-12 text-center font-medium">{value.toFixed(1)}</span>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => onChange(star)}
                className="focus:outline-none"
              >
                <Star className={`w-5 h-5 ${star <= value ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} />
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Performance Appraisals</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Track and manage employee performance reviews
            </p>
          </div>
          {canManage && (
            <button
              onClick={() => openModal()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Review
            </button>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.totalReviews}</p>
                <p className="text-sm text-gray-500">Total Reviews</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <Star className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.avgRating}</p>
                <p className="text-sm text-gray-500">Avg. Rating</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.thisQuarter}</p>
                <p className="text-sm text-gray-500">This Year</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 mb-6">
          <div className="p-4 flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search reviews..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Periods</option>
              {uniquePeriods.map(period => (
                <option key={period} value={period}>{period}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
            </div>
          ) : filteredReviews.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <Award className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="text-gray-500 mt-2">No performance reviews found</p>
              <p className="text-sm text-gray-400 mt-1">Start tracking employee performance</p>
              {canManage && (
                <button
                  onClick={() => openModal()}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  Create First Review
                </button>
              )}
            </div>
          ) : (
            filteredReviews.map((review) => (
              <div key={review.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div
                  className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedReview(expandedReview === review.id ? null : review.id)}
                >
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium">
                    {review.staff_name?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{review.staff_name}</h3>
                      {review.rating_overall && (
                        <span className="flex items-center gap-1 text-sm">
                          {renderStars(Math.round(review.rating_overall))}
                          <span className="text-gray-500">{review.rating_overall.toFixed(1)}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                      {review.review_period && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{review.review_period}</span>}
                      {review.reviewer_name && <span>Reviewed by {review.reviewer_name}</span>}
                      <span className="text-gray-400">{new Date(review.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${expandedReview === review.id ? 'rotate-90' : ''}`} />
                </div>

                {expandedReview === review.id && (
                  <div className="border-t border-gray-100 p-4 bg-gray-50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Ratings */}
                      <div>
                        <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">Ratings</h4>
                        <div className="space-y-3">
                          {[
                            { label: 'Overall', value: review.rating_overall },
                            { label: 'Quality', value: review.rating_quality },
                            { label: 'Productivity', value: review.rating_productivity },
                            { label: 'Communication', value: review.rating_communication },
                            { label: 'Teamwork', value: review.rating_teamwork },
                          ].filter(r => r.value).map(({ label, value }) => (
                            <div key={label} className="flex items-center justify-between">
                              <span className="text-sm text-gray-600">{label}</span>
                              <div className="flex items-center gap-2">
                                {renderStars(Math.round(value || 0))}
                                <span className="text-sm font-medium text-gray-700 w-8">{value?.toFixed(1)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Feedback */}
                      <div className="space-y-4">
                        {review.strengths && (
                          <div>
                            <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">Strengths</h4>
                            <p className="text-sm text-gray-700">{review.strengths}</p>
                          </div>
                        )}
                        {review.improvements && (
                          <div>
                            <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">Areas for Improvement</h4>
                            <p className="text-sm text-gray-700">{review.improvements}</p>
                          </div>
                        )}
                        {review.goals_achieved && (
                          <div>
                            <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">Goals Achieved</h4>
                            <p className="text-sm text-gray-700">{review.goals_achieved}</p>
                          </div>
                        )}
                        {review.goals_next_period && (
                          <div>
                            <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">Goals for Next Period</h4>
                            <p className="text-sm text-gray-700">{review.goals_next_period}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {canManage && (
                      <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
                        <button
                          onClick={() => openModal(review)}
                          className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
                        >
                          <Edit2 className="w-4 h-4" /> Edit
                        </button>
                        <button
                          onClick={() => deleteReview(review.id)}
                          className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm hover:bg-red-100"
                        >
                          <Trash2 className="w-4 h-4" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold">
                {editingReview ? 'Edit Performance Review' : 'New Performance Review'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employee *</label>
                  <select
                    required
                    value={formData.staff_id}
                    onChange={(e) => setFormData({ ...formData, staff_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select employee</option>
                    {allStaff.map(s => (
                      <option key={s.id} value={s.id}>{s.full_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Review Period</label>
                  <input
                    type="text"
                    value={formData.review_period}
                    onChange={(e) => setFormData({ ...formData, review_period: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Q1 2024"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reviewer</label>
                <select
                  value={formData.reviewer_id}
                  onChange={(e) => setFormData({ ...formData, reviewer_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select reviewer</option>
                  {allStaff.map(s => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
                </select>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h4 className="text-sm font-medium text-gray-900 mb-4">Performance Ratings</h4>
                <div className="space-y-4">
                  <RatingInput
                    label="Overall Performance"
                    value={formData.rating_overall}
                    onChange={(v) => setFormData({ ...formData, rating_overall: v })}
                  />
                  <RatingInput
                    label="Quality of Work"
                    value={formData.rating_quality}
                    onChange={(v) => setFormData({ ...formData, rating_quality: v })}
                  />
                  <RatingInput
                    label="Productivity"
                    value={formData.rating_productivity}
                    onChange={(v) => setFormData({ ...formData, rating_productivity: v })}
                  />
                  <RatingInput
                    label="Communication"
                    value={formData.rating_communication}
                    onChange={(v) => setFormData({ ...formData, rating_communication: v })}
                  />
                  <RatingInput
                    label="Teamwork"
                    value={formData.rating_teamwork}
                    onChange={(v) => setFormData({ ...formData, rating_teamwork: v })}
                  />
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Strengths</label>
                  <textarea
                    rows={2}
                    value={formData.strengths}
                    onChange={(e) => setFormData({ ...formData, strengths: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Key strengths and accomplishments..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Areas for Improvement</label>
                  <textarea
                    rows={2}
                    value={formData.improvements}
                    onChange={(e) => setFormData({ ...formData, improvements: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Areas where the employee can improve..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Goals Achieved</label>
                  <textarea
                    rows={2}
                    value={formData.goals_achieved}
                    onChange={(e) => setFormData({ ...formData, goals_achieved: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Goals accomplished during this period..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Goals for Next Period</label>
                  <textarea
                    rows={2}
                    value={formData.goals_next_period}
                    onChange={(e) => setFormData({ ...formData, goals_next_period: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Goals for the upcoming period..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  {editingReview ? 'Save Changes' : 'Create Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
