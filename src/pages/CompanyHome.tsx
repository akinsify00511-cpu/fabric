// ============================================
// COMPANY HOME - Human Activities Hub
// Birthdays, Awards, Polls, Team Recognition
// ============================================

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useBranding } from '../lib/BrandingContext'
import {
  Cake, Award, Trophy, Users, Vote,
  Calendar, Star, Heart, CheckCircle, Gift,
  Crown, ThumbsUp, Check
} from 'lucide-react'

// Current month name
const getCurrentMonth = () => {
  return new Date().toLocaleString('default', { month: 'long' })
}

// Get upcoming birthdays this month
const getBirthdaysThisMonth = () => {
  const birthdays = [
    { name: 'Chioma Adebayo', date: '2026-08-15', department: 'Sales', avatar: 'CA' },
    { name: 'Emmanuel Okonkwo', date: '2026-08-22', department: 'Marketing', avatar: 'EO' },
    { name: 'Fatima Bello', date: '2026-08-28', department: 'Finance', avatar: 'FB' },
  ]
  return birthdays
}

// Get best staff this month
const getBestStaff = () => {
  return {
    name: 'Adebayo Johnson',
    role: 'Sales Manager',
    department: 'Sales',
    achievement: 'Highest sales this month - ₦2.5M target achieved',
    avatar: 'AJ',
    stats: { sales: '₦2.5M', deals: 12, tasks: 28 }
  }
}

// Get recent poll results
const getPollResults = () => {
  return [
    {
      id: '1',
      question: 'Best Team Building Activity for Q3?',
      options: [
        { text: 'Beach Party', votes: 24, percentage: 45 },
        { text: 'Game Night', votes: 18, percentage: 34 },
        { text: 'Cooking Class', votes: 11, percentage: 21 },
      ],
      totalVotes: 53,
      endsAt: '2026-08-20',
      status: 'active'
    },
    {
      id: '2',
      question: 'Favorite Remote Work Day?',
      options: [
        { text: 'Friday', votes: 31, percentage: 52 },
        { text: 'Monday', votes: 15, percentage: 25 },
        { text: 'Wednesday', votes: 14, percentage: 23 },
      ],
      totalVotes: 60,
      endsAt: '2026-08-10',
      status: 'closed'
    }
  ]
}

// Get team awards/recognitions
const getRecentAwards = () => {
  return [
    { id: '1', type: 'star', recipient: 'Ngozi Okafor', award: 'Star Performer', reason: 'Closed 3 major deals this week', icon: Star, color: '#F59E0B' },
    { id: '2', type: 'trophy', recipient: 'Ibrahim Musa', award: 'Rising Star', reason: 'Exceeded quarterly targets by 150%', icon: Trophy, color: '#8B5CF6' },
    { id: '3', type: 'heart', recipient: 'Grace Eze', award: 'Team Player', reason: 'Helped onboard 3 new clients', icon: Heart, color: '#EC4899' },
  ]
}

export default function CompanyHome() {
  const { staff, isDemo } = useAuth()
  const { branding } = useBranding()
  const [loading, setLoading] = useState(true)
  const [selectedPoll, setSelectedPoll] = useState<string | null>(null)
  const [hasVoted, setHasVoted] = useState<string[]>([])

  // Data
  const birthdaysThisMonth = getBirthdaysThisMonth()
  const bestStaff = getBestStaff()
  const pollResults = getPollResults()
  const recentAwards = getRecentAwards()
  const currentMonth = getCurrentMonth()

  // Get branding colors
  const bgColor = branding.background_color || '#F9FAFB'
  const primaryColor = branding.primary_color || '#3B82F6'

  useEffect(() => {
    // Load user's voted polls from localStorage
    const voted = localStorage.getItem('avenize_voted_polls')
    if (voted) {
      setHasVoted(JSON.parse(voted))
    }
    setLoading(false)
  }, [])

  // Handle poll vote
  const handleVote = (pollId: string, optionIndex: number) => {
    if (hasVoted.includes(pollId)) return
    
    const newVoted = [...hasVoted, pollId]
    setHasVoted(newVoted)
    localStorage.setItem('avenize_voted_polls', JSON.stringify(newVoted))
    setSelectedPoll(`${pollId}-${optionIndex}`)
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: bgColor }}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900">Company Hub</h1>
          <p className="text-gray-500 mt-1">Celebrate your team • {currentMonth} {new Date().getFullYear()}</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        
        {/* ===== BIRTHDAYS THIS MONTH ===== */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-pink-100 rounded-xl flex items-center justify-center">
                <Cake size={20} className="text-pink-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Birthdays This Month</h2>
                <p className="text-sm text-gray-500">{currentMonth}</p>
              </div>
            </div>
            <span className="text-sm text-pink-600 font-medium">{birthdaysThisMonth.length} team members</span>
          </div>
          
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            {birthdaysThisMonth.map((birthday, index) => (
              <div key={index} className="flex items-center gap-4 p-4 bg-gradient-to-r from-pink-50 to-purple-50 rounded-xl border border-pink-100">
                <div className="w-14 h-14 bg-gradient-to-br from-pink-400 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                  {birthday.avatar}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{birthday.name}</p>
                  <p className="text-sm text-gray-500">{birthday.department}</p>
                  <p className="text-sm text-pink-600 font-medium mt-1">
                    {new Date(birthday.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>
            ))}
            
            {birthdaysThisMonth.length === 0 && (
              <div className="col-span-3 text-center py-8 text-gray-500">
                <Cake size={40} className="mx-auto mb-2 text-gray-300" />
                <p>No birthdays this month</p>
              </div>
            )}
          </div>
        </div>

        {/* ===== BEST STAFF OF THE MONTH ===== */}
        <div className="bg-gradient-to-br from-amber-500 via-yellow-500 to-orange-500 rounded-2xl shadow-lg overflow-hidden text-white">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Crown size={24} />
              <span className="text-sm font-medium opacity-90">Best Staff of the Month</span>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center text-3xl font-bold">
                {bestStaff.avatar}
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold mb-1">{bestStaff.name}</h3>
                <p className="text-white/80">{bestStaff.role} - {bestStaff.department}</p>
                <p className="text-white/90 mt-2">{bestStaff.achievement}</p>
                
                <div className="flex gap-6 mt-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{bestStaff.stats.sales}</p>
                    <p className="text-xs opacity-80">Sales</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{bestStaff.stats.deals}</p>
                    <p className="text-xs opacity-80">Deals</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{bestStaff.stats.tasks}</p>
                    <p className="text-xs opacity-80">Tasks</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-black/10 px-6 py-3 flex items-center justify-between text-sm">
            <span>Congratulations, {bestStaff.name.split(' ')[0]}!</span>
            <span>{currentMonth} {new Date().getFullYear()}</span>
          </div>
        </div>

        {/* ===== TWO COLUMN: AWARDS + POLLS ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* RECENT AWARDS & RECOGNITION */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <Award size={20} className="text-amber-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Recent Awards & Recognition</h2>
                <p className="text-sm text-gray-500">Team shoutouts</p>
              </div>
            </div>
            
            <div className="p-4 space-y-3">
              {recentAwards.map((award) => {
                const IconComponent = award.icon
                return (
                  <div key={award.id} className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
                    <div 
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: award.color + '20' }}
                    >
                      <IconComponent size={24} style={{ color: award.color }} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">{award.recipient}</p>
                        <span 
                          className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: award.color + '20', color: award.color }}
                        >
                          {award.award}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{award.reason}</p>
                    </div>
                    <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
                      <ThumbsUp size={16} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* POLLS */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Vote size={20} className="text-blue-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Team Polls</h2>
                <p className="text-sm text-gray-500">Vote & see results</p>
              </div>
            </div>
            
            <div className="p-4 space-y-4">
              {pollResults.map((poll) => {
                const isVoted = hasVoted.includes(poll.id)
                const isActive = poll.status === 'active'
                
                return (
                  <div key={poll.id} className="p-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-medium text-gray-900">{poll.question}</p>
                      {isActive && !isVoted && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                          Active
                        </span>
                      )}
                      {!isActive && (
                        <span className="px-2 py-1 bg-gray-200 text-gray-600 text-xs rounded-full">
                          Closed
                        </span>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      {poll.options.map((option, idx) => {
                        const isSelected = selectedPoll === poll.id + '-' + idx
                        return (
                          <button
                            key={idx}
                            onClick={() => isActive && !isVoted && handleVote(poll.id, idx)}
                            disabled={!isActive || isVoted}
                            className={'w-full text-left p-3 rounded-lg border transition ' + (
                              isSelected 
                                ? 'border-blue-500 bg-blue-50' 
                                : 'border-gray-200 bg-white hover:border-gray-300'
                            ) + ((!isActive || isVoted) ? ' cursor-default' : ' cursor-pointer')}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {isVoted && (
                                  <div className={'w-4 h-4 rounded-full border-2 flex items-center justify-center ' + (
                                    isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                                  )}>
                                    {isSelected && <Check size={12} className="text-white" />}
                                  </div>
                                )}
                                <span className="text-sm font-medium text-gray-700">{option.text}</span>
                              </div>
                              {isVoted && (
                                <span className="text-sm font-medium text-gray-500">
                                  {option.percentage}%
                                </span>
                              )}
                            </div>
                            {isVoted && (
                              <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-blue-500 rounded-full transition-all"
                                  style={{ width: option.percentage + '%' }}
                                />
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                    
                    <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                      <span>{poll.totalVotes} votes</span>
                      <span>Ends {new Date(poll.endsAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ===== QUICK ACTIONS ===== */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link 
            to="/app/people"
            className="bg-white rounded-xl p-4 border border-gray-200 hover:border-blue-300 hover:shadow-md transition flex flex-col items-center text-center"
          >
            <Users size={24} className="text-blue-600 mb-2" />
            <span className="text-sm font-medium text-gray-700">Team Directory</span>
          </Link>
          <Link 
            to="/app/kudos"
            className="bg-white rounded-xl p-4 border border-gray-200 hover:border-pink-300 hover:shadow-md transition flex flex-col items-center text-center"
          >
            <Heart size={24} className="text-pink-600 mb-2" />
            <span className="text-sm font-medium text-gray-700">Send Kudos</span>
          </Link>
          <Link 
            to="/app/polls"
            className="bg-white rounded-xl p-4 border border-gray-200 hover:border-purple-300 hover:shadow-md transition flex flex-col items-center text-center"
          >
            <Vote size={24} className="text-purple-600 mb-2" />
            <span className="text-sm font-medium text-gray-700">Create Poll</span>
          </Link>
          <Link 
            to="/app/awards"
            className="bg-white rounded-xl p-4 border border-gray-200 hover:border-amber-300 hover:shadow-md transition flex flex-col items-center text-center"
          >
            <Trophy size={24} className="text-amber-600 mb-2" />
            <span className="text-sm font-medium text-gray-700">Nominate</span>
          </Link>
        </div>

      </div>
    </div>
  )
}
