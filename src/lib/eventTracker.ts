/**
 * Event Tracker & Analytics
 * Captures all user interactions for insights and personalization
 */

import { supabase } from './supabase'

// ============================================
// Types
// ============================================

type EventCategory = 
  | 'page_view' 
  | 'user_action' 
  | 'feature_usage' 
  | 'search' 
  | 'filter' 
  | 'export' 
  | 'import' 
  | 'notification' 
  | 'payment' 
  | 'auth' 
  | 'error'
  | 'performance'
  | 'engagement'

interface AnalyticsEvent {
  eventName: string
  category: EventCategory
  page?: string
  component?: string
  action?: string
  metadata?: Record<string, any>
  durationMs?: number
}

interface UserEngagement {
  sessionId: string
  pagesVisited: number
  actionsPerformed: number
  featuresUsed: string[]
  startTime: Date
}

interface Achievement {
  key: string
  name: string
  description: string
  progress: number
  target: number
  unlocked: boolean
  points?: number
}

// ============================================
// Session Management
// ============================================

class SessionManager {
  private sessionId: string | null = null
  private engagement: UserEngagement | null = null
  private startTime: Date | null = null

  startSession(): string {
    this.sessionId = this.generateSessionId()
    this.startTime = new Date()
    this.engagement = {
      sessionId: this.sessionId,
      pagesVisited: 0,
      actionsPerformed: 0,
      featuresUsed: [],
      startTime: this.startTime,
    }
    
    // Store in sessionStorage for cross-tab sync
    try {
      sessionStorage.setItem('avenize_session_id', this.sessionId)
    } catch (e) { console.warn('[eventTracker]', e) }
    
    return this.sessionId
  }

  getSessionId(): string {
    if (!this.sessionId) {
      // Try to get from sessionStorage
      try {
        const stored = sessionStorage.getItem('avenize_session_id')
        if (stored) {
          this.sessionId = stored
          return this.sessionId
        }
      } catch (e) { console.warn('[eventTracker]', e) }
      return this.startSession()
    }
    return this.sessionId
  }

  getEngagement(): UserEngagement | null {
    return this.engagement
  }

  trackPageView(_page: string) {
    if (this.engagement) {
      this.engagement.pagesVisited++
    }
  }

  trackAction(feature?: string) {
    if (this.engagement) {
      this.engagement.actionsPerformed++
      if (feature) {
        this.engagement.featuresUsed.push(feature)
      }
    }
  }

  async endSession(userId: string, _businessId?: string) {
    if (!this.engagement || !this.sessionId) return

    const duration = Math.floor((Date.now() - this.startTime!.getTime()) / 1000)

    try {
      await supabase.rpc('update_user_engagement', {
        p_user_id: userId,
        p_session_id: this.sessionId,
        p_event_type: 'session_end',
        p_duration_seconds: duration,
      })
    } catch (e) {
      console.warn('Session tracking not available:', (e as any)?.message)
    }

    this.sessionId = null
    this.engagement = null
    this.startTime = null
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

export const sessionManager = new SessionManager()

// ============================================
// Event Tracker
// ============================================

class EventTracker {
  private queue: AnalyticsEvent[] = []
  private flushTimeout: ReturnType<typeof setTimeout> | null = null
  private readonly BATCH_SIZE = 10
  private readonly FLUSH_INTERVAL = 5000
  private cachedUserId: string | null = null
  private cachedBusinessId: string | null = null
  private identityResolved = false
  // Auth lifecycle: the RPC record_analytics_event requires an authenticated
  // session (auth.uid()). Without these gates the batch processor fires the
  // RPC before a JWT is available → 401. We queue until auth is ready,
  // discard when there is no session, and flush on SIGNED_IN.
  private authReady = false
  private hasSession = false
  private authListenerSetup = false

  constructor() {
    // Start batch processor
    this.startBatchProcessor()
    
    // Track page visibility changes
    this.setupVisibilityTracking()
    
    // Track before unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flush())
    }

    // Wire auth lifecycle so analytics only fires with a valid session
    this.setupAuthListener()
  }

  /**
   * Single onAuthStateChange subscription (guarded against duplicates).
   * - INITIAL_SESSION / SIGNED_IN / TOKEN_REFRESHED with a session:
   *   mark auth ready + has session, flush the queue.
   * - SIGNED_OUT / no session: mark auth ready, clear session, drop the
   *   queue so no authenticated analytics RPC fires after logout.
   */
  private setupAuthListener(): void {
    if (this.authListenerSetup) return
    this.authListenerSetup = true

    supabase.auth.onAuthStateChange((event, session) => {
      if (session && event !== 'SIGNED_OUT') {
        this.hasSession = true
        this.authReady = true
        if (this.cachedUserId !== session.user.id) {
          this.cachedUserId = session.user.id
          this.identityResolved = false // re-resolve business_id for new user
        }
        // Flush any events queued while auth was initializing
        if (this.queue.length > 0) {
          this.flush()
        }
      } else {
        // SIGNED_OUT or no session
        this.hasSession = false
        this.authReady = true
        this.cachedUserId = null
        this.cachedBusinessId = null
        this.identityResolved = false
        this.queue = [] // clear authenticated analytics queue
      }
    })
  }

  // Lazily resolve the business_id for the current user (user id comes from
  // the auth listener; no auth.getUser() call needed).
  private async resolveIdentity(): Promise<void> {
    if (this.identityResolved) return
    if (!this.cachedUserId) {
      this.identityResolved = true
      return
    }
    try {
      const { data: staff } = await supabase
        .from('staff')
        .select('business_id')
        .eq('user_id', this.cachedUserId)
        .maybeSingle()
      this.cachedBusinessId = staff?.business_id ?? null
    } catch {
      // leave null — analytics recorded without business attribution
    }
    this.identityResolved = true
  }

  async track(event: AnalyticsEvent) {
    // Add session info
    const enrichedEvent = {
      ...event,
      sessionId: sessionManager.getSessionId(),
    }

    this.queue.push(enrichedEvent)

    // Process based on category
    switch (event.category) {
      case 'page_view':
        sessionManager.trackPageView(event.page || window.location.pathname)
        break
      case 'user_action':
      case 'feature_usage':
        sessionManager.trackAction(event.action)
        break
    }

    // Flush if batch size reached
    if (this.queue.length >= this.BATCH_SIZE) {
      await this.flush()
    }
  }

  // Convenience methods
  pageView(page: string, metadata?: Record<string, any>) {
    this.track({
      eventName: `page_view:${page}`,
      category: 'page_view',
      page,
      metadata,
    })
  }

  click(component: string, action: string, metadata?: Record<string, any>) {
    this.track({
      eventName: `click:${component}`,
      category: 'user_action',
      component,
      action,
      metadata,
    })
  }

  featureUse(feature: string, metadata?: Record<string, any>) {
    this.track({
      eventName: `feature:${feature}`,
      category: 'feature_usage',
      action: feature,
      metadata,
    })
  }

  search(query: string, resultsCount?: number) {
    this.track({
      eventName: 'search',
      category: 'search',
      action: 'search',
      metadata: { query, resultsCount },
    })
  }

  error(error: Error | string, context?: Record<string, any>) {
    const errorMessage = typeof error === 'string' ? error : error.message
    const errorStack = typeof error === 'string' ? undefined : error.stack
    
    this.track({
      eventName: 'error',
      category: 'error',
      action: 'error',
      metadata: { message: errorMessage, stack: errorStack, ...context },
    })
  }

  performance(name: string, durationMs: number, metadata?: Record<string, any>) {
    this.track({
      eventName: `perf:${name}`,
      category: 'performance',
      durationMs,
      metadata: { ...metadata, duration: durationMs },
    })
  }

  engagement(type: string, metadata?: Record<string, any>) {
    this.track({
      eventName: `engagement:${type}`,
      category: 'engagement',
      action: type,
      metadata,
    })
  }

  async flush() {
    if (this.queue.length === 0) return

    // Auth not initialized yet → keep events queued, don't fire the RPC
    // (which would 401 without a valid JWT).
    if (!this.authReady) return

    // Auth initialized but no session → not authenticated. Discard events
    // instead of sending an RPC that will be rejected.
    if (!this.hasSession) {
      this.queue = []
      return
    }

    await this.resolveIdentity()

    const events = [...this.queue]
    this.queue = []

    try {
      const sessionId = sessionManager.getSessionId()
      
      for (const event of events) {
        await supabase.rpc('record_analytics_event', {
          p_business_id: this.cachedBusinessId,
          p_user_id: this.cachedUserId,
          p_event_name: event.eventName,
          p_category: event.category,
          p_page: event.page || window.location.pathname,
          p_component: event.component,
          p_action: event.action,
          p_metadata: event.metadata || {},
          p_duration_ms: event.durationMs,
          p_session_id: sessionId,
        })
      }
    } catch (e: any) {
      // Analytics is non-essential. If the RPC/table is missing or not
      // permitted on this deployment (function not found, no schema-cache
      // match, permission denied, undefined object), DROP the batch — do
      // NOT re-queue. Re-queueing a permanently-unavailable RPC grows the
      // queue unboundedly and retries forever (the original 401 symptom).
      const code = e?.code as string | undefined
      const msg = (e?.message || '') as string
      const unavailable =
        (code && ['PGRST116', 'PGRST202', '404', '406', '42501', '38000', '42883', '42P01', '42804'].includes(code)) ||
        /no matches found in the schema cache/i.test(msg) ||
        /could not find the function/i.test(msg) ||
        /does not exist/i.test(msg) ||
        /permission denied/i.test(msg)
      if (unavailable) {
        return // drop the batch; analytics is optional
      }
      // Transient error (network/timeout) — keep the events for next flush.
      console.warn('Analytics flush failed (will retry):', msg)
      this.queue.unshift(...events)
    }
  }

  private startBatchProcessor() {
    this.flushTimeout = setInterval(() => {
      this.flush()
    }, this.FLUSH_INTERVAL)
  }

  private setupVisibilityTracking() {
    if (typeof document === 'undefined') return

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flush()
      }
    })
  }
}

export const eventTracker = new EventTracker()

// ============================================
// Learning Loop System
// ============================================

class LearningLoop {
  private userId: string | null = null
  private interactions: Map<string, number> = new Map()
  private lastUpdate: number = 0
  private readonly UPDATE_INTERVAL = 60000 // 1 minute

  setUser(userId: string) {
    this.userId = userId
    this.loadUserData()
  }

  private async loadUserData() {
    if (!this.userId) return

    try {
      const { data } = await supabase
        .from('user_learning')
        .select('*')
        .eq('user_id', this.userId)
        .maybeSingle()

      if (data) {
        // Load interaction patterns
        if (data.learning_data?.interactions) {
          Object.entries(data.learning_data.interactions).forEach(([key, value]) => {
            this.interactions.set(key, value as number)
          })
        }
      }
    } catch (e) { console.warn('[eventTracker]', e) }
  }

  recordInteraction(type: string, value: number = 1) {
    const current = this.interactions.get(type) || 0
    this.interactions.set(type, current + value)
    this.lastUpdate = Date.now()

    // Throttle updates
    if (Date.now() - this.lastUpdate > this.UPDATE_INTERVAL) {
      this.persist()
    }
  }

  getInsights(): {
    preferredTime: string
    mostUsedFeatures: string[]
    workStyle: string
    suggestions: string[]
  } {
    // Analyze patterns
    const insights = {
      preferredTime: this.analyzeTimePreference(),
      mostUsedFeatures: this.getTopFeatures(5),
      workStyle: this.analyzeWorkStyle(),
      suggestions: this.generateSuggestions(),
    }

    return insights
  }

  private analyzeTimePreference(): string {
    const hour = new Date().getHours()
    if (hour >= 6 && hour < 12) return 'morning'
    if (hour >= 12 && hour < 17) return 'afternoon'
    if (hour >= 17 && hour < 21) return 'evening'
    return 'night'
  }

  private getTopFeatures(count: number): string[] {
    const sorted = Array.from(this.interactions.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([key]) => key)
    return sorted
  }

  private analyzeWorkStyle(): string {
    const featureCount = this.interactions.size
    const totalInteractions = Array.from(this.interactions.values()).reduce((a, b) => a + b, 0)
    
    if (featureCount > 10 && totalInteractions > 100) return 'power_user'
    if (featureCount < 5) return 'focused'
    return 'balanced'
  }

  private generateSuggestions(): string[] {
    const suggestions: string[] = []
    const features = this.getTopFeatures(3)

    // Check for unused features based on usage patterns
    const tasksCount = this.interactions.get('tasks') || 0
    if (!features.includes('calendar') && tasksCount > 10) {
      suggestions.push('Try the Calendar feature to schedule your tasks')
    }
    
    if (!features.includes('reports') && tasksCount > 20) {
      suggestions.push('Generate a report to see your productivity trends')
    }

    if (!features.includes('team') && tasksCount > 5) {
      suggestions.push('Invite team members to collaborate on tasks')
    }

    return suggestions.slice(0, 3)
  }

  private async persist() {
    if (!this.userId) return

    const learningData = {
      interactions: Object.fromEntries(this.interactions),
      lastUpdated: new Date().toISOString(),
    }

    try {
      await supabase.from('user_learning').upsert({
        user_id: this.userId,
        learning_data: learningData,
        top_features: this.getTopFeatures(10),
        last_learning_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      })
    } catch (e) {
      console.warn('Learning tracking not available:', (e as any)?.message)
    }
  }

  // Feedback mechanisms
  async recordFeedback(type: 'positive' | 'negative', _context: string) {
    if (!this.userId) return

    try {
      await supabase.from('user_learning').update({
        positive_signals: type === 'positive' ? 1 : 0,
        negative_signals: type === 'negative' ? 1 : 0,
        updated_at: new Date().toISOString(),
      }).eq('user_id', this.userId)
    } catch (e) { console.warn('[eventTracker]', e) }
  }

  async recordSuggestionAccepted() {
    if (!this.userId) return

    try {
      await supabase.rpc('increment_user_learning', {
        p_user_id: this.userId,
        p_field: 'suggestions_accepted',
      })
    } catch (e) { console.warn('[eventTracker]', e) }
  }
}

export const learningLoop = new LearningLoop()

// ============================================
// Engagement & Gamification
// ============================================

class EngagementSystem {
  private achievements: Achievement[] = []

  async loadAchievements(userId: string) {
    try {
      const { data } = await supabase
        .from('user_achievements')
        .select('*')
        .eq('user_id', userId)

      if (data) {
        this.achievements = data.map(a => ({
          key: a.achievement_key,
          name: a.achievement_name,
          description: a.achievement_description,
          progress: a.progress_current,
          target: a.progress_target,
          unlocked: a.unlocked,
        }))
      }
    } catch (e) { console.warn('[eventTracker]', e) }

    return this.achievements
  }

  async checkAndUnlock(trigger: string, userId: string, _metadata?: Record<string, any>) {
    const achievementMap: Record<string, { key: string; target: number; points: number }> = {
      first_login: { key: 'first_login', target: 1, points: 10 },
      tasks_completed: { key: 'first_task', target: 1, points: 25 },
      pages_visited: { key: 'explorer', target: 10, points: 50 },
      streak_3: { key: 'consistent', target: 3, points: 100 },
      features_used: { key: 'power_user', target: 5, points: 150 },
      streak_7: { key: 'week_streak', target: 7, points: 500 },
      tasks_10_day: { key: 'speed_demon', target: 10, points: 75 },
      first_invite: { key: 'social_butterfly', target: 1, points: 100 },
    }

    const config = achievementMap[trigger]
    if (!config) return null

    try {
      const { data } = await supabase
        .from('user_achievements')
        .select('*')
        .eq('user_id', userId)
        .eq('achievement_key', config.key)
        .maybeSingle()

      if (data?.unlocked) return null // Already unlocked

      // Update progress
      const newProgress = (data?.progress_current || 0) + 1
      const unlocked = newProgress >= config.target

      await supabase.from('user_achievements').upsert({
        user_id: userId,
        achievement_key: config.key,
        progress_current: newProgress,
        progress_target: config.target,
        progress_percent: Math.min(100, Math.floor((newProgress / config.target) * 100)),
        unlocked,
        unlocked_at: unlocked ? new Date().toISOString() : null,
        points: unlocked ? config.points : 0,
      }, {
        onConflict: 'user_id,achievement_key',
      })

      if (unlocked) {
        eventTracker.engagement('achievement_unlocked', { achievement: config.key })
        return {
          key: config.key,
          points: config.points,
        }
      }
    } catch (e) {
      console.warn('Achievement check not available:', (e as any)?.message)
    }

    return null
  }

  getUnlockedAchievements(): Achievement[] {
    return this.achievements.filter(a => a.unlocked)
  }

  getProgress(): { points: number; level: number; nextLevelAt: number } {
    const points = this.achievements
      .filter(a => a.unlocked)
      .reduce((sum, a) => sum + (a.points || 0), 0)
    
    const level = Math.floor(points / 100)
    const nextLevelAt = (level + 1) * 100

    return { points, level, nextLevelAt }
  }
}

export const engagementSystem = new EngagementSystem()

// ============================================
// Admin Analytics Helpers
// ============================================

export async function getAdminAnalytics(businessId: string, days: number = 30) {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  try {
    // Get all events for the period (we'll group in JS)
    const { data: allEvents } = await supabase
      .from('analytics_events')
      .select('category, action, created_at')
      .eq('business_id', businessId)
      .gte('created_at', startDate.toISOString())

    // Group by category
    const categoryCounts: Record<string, number> = {}
    const actionCounts: Record<string, number> = {}
    let errorCount = 0
    

    allEvents?.forEach(event => {
      // Count categories
      categoryCounts[event.category] = (categoryCounts[event.category] || 0) + 1
      
      // Count actions for feature usage
      if (event.category === 'feature_usage' && event.action) {
        actionCounts[event.action] = (actionCounts[event.action] || 0) + 1
      }
      
      // Count errors
      if (event.category === 'error') {
        errorCount++
      }
    })

    // Convert to array format
    const eventsByCategory = Object.entries(categoryCounts).map(([category, count]) => ({
      category,
      count,
    }))

    const topFeatures = Object.entries(actionCounts)
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const totalEvents = allEvents?.length || 0
    

    // Get user activity
    const { data: userActivity } = await supabase
      .from('user_activity_daily')
      .select('*')
      .eq('business_id', businessId)
      .gte('activity_date', startDate.toISOString().split('T')[0])
      .order('activity_date', { ascending: false })

    return {
      eventsByCategory,
      userActivity: userActivity || [],
      topFeatures,
      errorCount,
      totalEvents,
    }
  } catch (e) {
    console.warn('Admin analytics not available:', (e as any)?.message)
    return null
  }
}

export async function getRecentEvents(businessId: string, limit: number = 50) {
  try {
    const { data } = await supabase
      .from('analytics_events')
      .select(`
        *,
        user:staff(full_name, email)
      `)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit)

    return data || []
  } catch (e) {
    console.warn('Recent events not available:', (e as any)?.message)
    return []
  }
}

// ============================================
// React Hooks
// ============================================

import { useState, useEffect } from 'react'

export function useAnalytics() {
  const [loading] = useState(false)

  useEffect(() => {
    // Initialize session
    sessionManager.startSession()

    // Track initial page view
    eventTracker.pageView(window.location.pathname)

    // Cleanup on unmount
    return () => {
      eventTracker.flush()
    }
  }, [])

  return {
    track: eventTracker.track.bind(eventTracker),
    pageView: eventTracker.pageView.bind(eventTracker),
    click: eventTracker.click.bind(eventTracker),
    featureUse: eventTracker.featureUse.bind(eventTracker),
    search: eventTracker.search.bind(eventTracker),
    error: eventTracker.error.bind(eventTracker),
    performance: eventTracker.performance.bind(eventTracker),
    engagement: eventTracker.engagement.bind(eventTracker),
    loading,
  }
}

export function useEngagement(userId: string) {
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (userId) {
      engagementSystem.loadAchievements(userId).then(data => {
        setAchievements(data)
        setLoading(false)
      })
    }
  }, [userId])

  const checkAchievement = async (trigger: string) => {
    const result = await engagementSystem.checkAndUnlock(trigger, userId)
    if (result) {
      setAchievements(prev => [...prev, {
        key: result.key,
        name: result.key,
        description: '',
        progress: 100,
        target: 100,
        unlocked: true,
      }])
    }
    return result
  }

  return {
    achievements,
    progress: engagementSystem.getProgress(),
    checkAchievement,
    loading,
  }
}

export function useLearningInsights(userId: string) {
  const [insights, setInsights] = useState<ReturnType<typeof learningLoop.getInsights>>({
    preferredTime: 'morning',
    mostUsedFeatures: [],
    workStyle: 'balanced',
    suggestions: [],
  })

  useEffect(() => {
    if (userId) {
      learningLoop.setUser(userId)
    }
  }, [userId])

  useEffect(() => {
    // Refresh insights periodically
    const interval = setInterval(() => {
      setInsights(learningLoop.getInsights())
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  return {
    ...insights,
    recordInteraction: learningLoop.recordInteraction.bind(learningLoop),
    recordFeedback: learningLoop.recordFeedback.bind(learningLoop),
    suggestionAccepted: learningLoop.recordSuggestionAccepted.bind(learningLoop),
  }
}

export default {
  eventTracker,
  sessionManager,
  learningLoop,
  engagementSystem,
  getAdminAnalytics,
  getRecentEvents,
}
