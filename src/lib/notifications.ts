/**
 * Notification Service
 * Helper functions for creating and managing notifications
 */

import { supabase } from './supabase'

type NotificationCategory = 'onboarding' | 'task' | 'payment' | 'reminder' | 'marketing' | 'social' | 'system'
type NotificationChannel = 'in_app' | 'email' | 'sms' | 'both'

interface CreateNotificationParams {
  userId: string
  businessId?: string
  title: string
  message: string
  category: NotificationCategory
  channel?: NotificationChannel
  entityType?: string
  entityId?: string
  data?: Record<string, any>
  actionUrl?: string
  actionText?: string
  scheduledFor?: Date
}

interface NotificationTemplate {
  slug: string
  variables: Record<string, string>
}

// Create a notification
export async function createNotification(params: CreateNotificationParams): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: params.userId,
        business_id: params.businessId,
        title: params.title,
        message: params.message,
        category: params.category,
        channel: params.channel || 'both',
        entity_type: params.entityType,
        entity_id: params.entityId,
        data: params.data || {},
        action_url: params.actionUrl,
        action_text: params.actionText,
        scheduled_for: params.scheduledFor?.toISOString(),
        sent: !params.scheduledFor, // If not scheduled, mark as sent immediately
      })
      .select('id')
      .single()

    if (error) {
      console.error('Failed to create notification:', error)
      return null
    }

    return data.id
  } catch (err) {
    console.error('Notification creation error:', err)
    return null
  }
}

// Send notification to multiple users (bulk)
export async function createBulkNotifications(
  userIds: string[],
  params: Omit<CreateNotificationParams, 'userId'>
): Promise<number> {
  try {
    const notifications = userIds.map(userId => ({
      user_id: userId,
      business_id: params.businessId,
      title: params.title,
      message: params.message,
      category: params.category,
      channel: params.channel || 'both',
      entity_type: params.entityType,
      entity_id: params.entityId,
      data: params.data || {},
      action_url: params.actionUrl,
      action_text: params.actionText,
      scheduled_for: params.scheduledFor?.toISOString(),
      sent: !params.scheduledFor,
    }))

    const { error } = await supabase
      .from('notifications')
      .insert(notifications)

    if (error) {
      console.error('Failed to create bulk notifications:', error)
      return 0
    }

    return userIds.length
  } catch (err) {
    console.error('Bulk notification error:', err)
    return 0
  }
}

// Get user's notification preferences
export async function getNotificationPreferences(userId: string) {
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error) return null
    return data
  } catch {
    return null
  }
}

// Update notification preferences
export async function updateNotificationPreferences(
  userId: string,
  preferences: Partial<{
    in_app_onboarding: boolean
    in_app_tasks: boolean
    in_app_payments: boolean
    in_app_reminders: boolean
    in_app_marketing: boolean
    in_app_social: boolean
    in_app_system: boolean
    email_onboarding: boolean
    email_tasks: boolean
    email_payments: boolean
    email_reminders: boolean
    email_marketing: boolean
    email_weekly_digest: boolean
    email_monthly_report: boolean
    email_feature_updates: boolean
    email_tips_tricks: boolean
    email_promotions: boolean
    // SMS preferences
    sms_onboarding: boolean
    sms_tasks: boolean
    sms_payments: boolean
    sms_reminders: boolean
    sms_marketing: boolean
    sms_security: boolean
  }>
) {
  try {
    const { error } = await supabase
      .from('notification_preferences')
      .update({ ...preferences, updated_at: new Date().toISOString() })
      .eq('user_id', userId)

    return !error
  } catch {
    return false
  }
}

// Mark notification as read
export async function markNotificationRead(notificationId: string, userId: string) {
  try {
    await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId)
    return true
  } catch {
    return false
  }
}

// Mark all notifications as read
export async function markAllNotificationsRead(userId: string) {
  try {
    await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('read', false)
    return true
  } catch {
    return false
  }
}

// Get unread count
export async function getUnreadCount(userId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)
      .eq('sent', true)

    return count || 0
  } catch {
    return 0
  }
}

// ============================================
// Pre-defined Notification Templates
// ============================================

export const NotificationTemplates = {
  // Onboarding
  welcome: (name: string) => ({
    title: `Welcome to Avenize, ${name}! 🎉`,
    message: 'Your business account is ready. Here\'s how to get started: 1) Add your team members, 2) Set up your first project, 3) Explore the CRM.',
    category: 'onboarding' as NotificationCategory,
    actionUrl: '/app/onboarding',
    actionText: 'Start Setup',
  }),

  firstStep: (action: string, time: string) => ({
    title: 'Ready to get started? Complete your first step!',
    message: `Take your first step with Avenize: ${action}. It only takes ${time} minutes.`,
    category: 'onboarding' as NotificationCategory,
  }),

  // Tasks
  taskAssigned: (assigner: string, taskName: string, dueDate: string) => ({
    title: `${assigner} assigned you a task`,
    message: `Task: "${taskName}" is now assigned to you. Due: ${dueDate}`,
    category: 'task' as NotificationCategory,
  }),

  taskCompleted: (assignee: string, taskName: string) => ({
    title: `Task "${taskName}" is complete! ✓`,
    message: `${assignee} has completed "${taskName}". Great work!`,
    category: 'task' as NotificationCategory,
  }),

  taskOverdue: (taskName: string, dueDate: string) => ({
    title: `Task "${taskName}" is overdue`,
    message: `The task "${taskName}" was due ${dueDate}. Please take action.`,
    category: 'task' as NotificationCategory,
  }),

  // Payments
  paymentSuccess: (amount: string, plan: string) => ({
    title: 'Payment Confirmed! ✓',
    message: `Your payment of ${amount} for ${plan} plan has been processed successfully.`,
    category: 'payment' as NotificationCategory,
  }),

  subscriptionActive: (plan: string, features: string) => ({
    title: `Your ${plan} subscription is now active!`,
    message: `Welcome to ${plan}! You now have access to ${features}. Enjoy!`,
    category: 'payment' as NotificationCategory,
  }),

  subscriptionExpiring: (days: string, plan: string, date: string) => ({
    title: `Your subscription renews in ${days} days`,
    message: `Your ${plan} plan will auto-renew on ${date}. No action needed unless you want to make changes.`,
    category: 'payment' as NotificationCategory,
  }),

  // Reminders
  trialExpiring: (days: string, plan: string, date: string) => ({
    title: `Your free trial ends in ${days} days! ⏰`,
    message: `Don\'t lose access to your data. Upgrade to ${plan} before ${date} to keep everything.`,
    category: 'reminder' as NotificationCategory,
    actionUrl: '/upgrade',
    actionText: 'Upgrade Now',
  }),

  trialExpired: () => ({
    title: 'Your free trial has ended',
    message: 'Your 7-day Avenize trial has ended. Upgrade now to keep your data and team access.',
    category: 'reminder' as NotificationCategory,
    actionUrl: '/upgrade',
    actionText: 'Upgrade',
  }),

  // Marketing
  featureHighlight: (feature: string, description: string) => ({
    title: `You haven\'t tried ${feature} yet!`,
    message: `${description}. Many businesses like yours find it useful. Click to learn more.`,
    category: 'marketing' as NotificationCategory,
  }),

  unusedFeature: (feature: string, time: string) => ({
    title: `You\'re missing out on ${feature}`,
    message: `Based on your activity, you might love ${feature}. Here\'s how to get started in ${time}.`,
    category: 'marketing' as NotificationCategory,
  }),

  usageTip: (tipTitle: string, tipDescription: string) => ({
    title: `💡 ${tipTitle}`,
    message: `${tipDescription}. Try it now!`,
    category: 'marketing' as NotificationCategory,
  }),

  // Social
  teamJoined: (name: string, email: string, business: string) => ({
    title: `${name} joined your team! 👋`,
    message: `${name} (${email}) has joined ${business}. Say hello!`,
    category: 'social' as NotificationCategory,
  }),

  // System
  welcomeBack: (name: string, days: string) => ({
    title: `Welcome back, ${name}!`,
    message: `It\'s been ${days} days since your last visit. Here\'s what\'s new.`,
    category: 'system' as NotificationCategory,
  }),
}

// ============================================
// Convenience functions for common notifications
// ============================================

export async function notifyWelcome(userId: string, businessId: string, name: string) {
  return createNotification({
    userId,
    businessId,
    ...NotificationTemplates.welcome(name),
    channel: 'both',
  })
}

export async function notifyTaskAssigned(
  userId: string,
  businessId: string,
  assigner: string,
  taskName: string,
  dueDate: string,
  taskId: string
) {
  return createNotification({
    userId,
    businessId,
    ...NotificationTemplates.taskAssigned(assigner, taskName, dueDate),
    channel: 'both',
    entityType: 'task',
    entityId: taskId,
    actionUrl: `/app/tasks`,
    actionText: 'View Task',
  })
}

export async function notifyTaskCompleted(
  userId: string,
  businessId: string,
  assignee: string,
  taskName: string,
  taskId: string
) {
  return createNotification({
    userId,
    businessId,
    ...NotificationTemplates.taskCompleted(assignee, taskName),
    channel: 'in_app',
    entityType: 'task',
    entityId: taskId,
  })
}

export async function notifyPaymentSuccess(
  userId: string,
  businessId: string,
  amount: string,
  plan: string
) {
  return createNotification({
    userId,
    businessId,
    ...NotificationTemplates.paymentSuccess(amount, plan),
    channel: 'both',
  })
}

export async function notifyTrialExpiring(
  userId: string,
  businessId: string,
  days: string,
  plan: string = 'Pro',
  date: string
) {
  return createNotification({
    userId,
    businessId,
    ...NotificationTemplates.trialExpiring(days, plan, date),
    channel: 'both',
  })
}

export async function notifyTrialExpired(userId: string, businessId: string) {
  return createNotification({
    userId,
    businessId,
    ...NotificationTemplates.trialExpired(),
    channel: 'both',
  })
}

export async function notifyTeamJoined(
  userId: string,
  businessId: string,
  memberName: string,
  memberEmail: string,
  businessName: string
) {
  return createNotification({
    userId,
    businessId,
    ...NotificationTemplates.teamJoined(memberName, memberEmail, businessName),
    channel: 'in_app',
  })
}

export async function notifyFeatureHighlight(
  userId: string,
  businessId: string,
  feature: string,
  description: string
) {
  return createNotification({
    userId,
    businessId,
    ...NotificationTemplates.featureHighlight(feature, description),
    channel: 'both',
  })
}

// ============================================
// Trial Reminder Scheduler
// Schedule trial expiring notifications
// ============================================

export async function scheduleTrialReminders(userId: string, businessId: string) {
  const now = new Date()
  const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days from now

  // Schedule notification 3 days before trial ends
  const threeDaysBefore = new Date(trialEnd.getTime() - 4 * 24 * 60 * 60 * 1000)
  if (threeDaysBefore > now) {
    await createNotification({
      userId,
      businessId,
      ...NotificationTemplates.trialExpiring('3', 'Pro', trialEnd.toLocaleDateString()),
      channel: 'both',
      scheduledFor: threeDaysBefore,
    })
  }

  // Schedule notification 1 day before trial ends
  const oneDayBefore = new Date(trialEnd.getTime() - 1 * 24 * 60 * 60 * 1000)
  if (oneDayBefore > now) {
    await createNotification({
      userId,
      businessId,
      ...NotificationTemplates.trialExpiring('1', 'Pro', trialEnd.toLocaleDateString()),
      channel: 'both',
      scheduledFor: oneDayBefore,
    })
  }
}
