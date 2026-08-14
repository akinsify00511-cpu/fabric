// Company Wall — culture & engagement hub (Master Build Guide §10).
// Events, birthdays, recognition, staff-of-month, announcements, polls.
// Unifies Announcements.tsx + Merit.tsx + Events.tsx into one wall a
// person actually opens to feel the company.

import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useDbState, DbStateBanner } from '../lib/useDbState'
import { useToast } from '../components/Toast'
import {
  Cake, Award, Megaphone, CalendarDays, Vote, ThumbsUp, Plus,
  Loader2, Sparkles, MessageSquare,
} from 'lucide-react'

function monthDay(d: string) {
  const dt = new Date(d)
  return `${dt.toLocaleString('en', { month: 'short' })} ${dt.getDate()}`
}
function isBirthdayToday(dob: string) {
  if (!dob) return false
  const dt = new Date(dob); const today = new Date()
  return dt.getMonth() === today.getMonth() && dt.getDate() === today.getDate()
}
function isUpcoming(dob: string, days = 14) {
  if (!dob) return false
  const dt = new Date(dob); const today = new Date()
  dt.setFullYear(today.getFullYear())
  if (dt < today) dt.setFullYear(today.getFullYear() + 1)
  const diff = (dt.getTime() - today.getTime()) / 86400000
  return diff >= 0 && diff <= days
}

export default function CompanyWall() {
  const { staff } = useAuth()
  const bid = staff?.business_id
  const dbState = useDbState()
  const { showToast } = useToast()
  const [searchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as 'recognition' | 'polls' | null) || 'all'
  const [tab, setTab] = useState<'all' | 'recognition' | 'announcements' | 'events' | 'polls'>(initialTab)
  const [feed, setFeed] = useState<any[]>([])
  const [polls, setPolls] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [newPollQ, setNewPollQ] = useState('')
  const [newPollOpts, setNewPollOpts] = useState('Yes\nNo')

  useEffect(() => { loadFeed(); loadPolls() }, [bid])

  async function loadFeed() {
    if (!bid) return
    setLoading(true)
    const [rec, ann, ev, people] = await Promise.allSettled([
      supabase.from('recognition').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('events').select('*').order('start_date', { ascending: true }).limit(20),
      supabase.from('staff').select('id, full_name, date_of_birth, avatar_url, department'),
    ])
    const pick = (r: any) => r.status === 'fulfilled' ? (r.value.data || []) : []
    const items: any[] = []
    pick(rec).forEach((r: any) => items.push({ kind: 'recognition', date: r.created_at, data: r }))
    pick(ann).forEach((a: any) => items.push({ kind: 'announcement', date: a.created_at, data: a }))
    pick(ev).forEach((e: any) => items.push({ kind: 'event', date: e.start_date || e.created_at, data: e }))
    // Birthdays derived from staff (not a separate table)
    const staffList = pick(people)
    const todayBdays = staffList.filter((s: any) => isBirthdayToday(s.date_of_birth))
    const upcoming = staffList.filter((s: any) => !isBirthdayToday(s.date_of_birth) && isUpcoming(s.date_of_birth))
      .sort((a: any, b: any) => +new Date(a.date_of_birth) - +new Date(b.date_of_birth))
    todayBdays.forEach((s: any) => items.push({ kind: 'birthday', date: new Date().toISOString(), data: s, today: true }))
    upcoming.slice(0, 6).forEach((s: any) => items.push({ kind: 'birthday', date: s.date_of_birth, data: s, today: false }))
    items.sort((a, b) => +new Date(b.date) - +new Date(a.date))
    setFeed(items); setLoading(false)
  }

  async function loadPolls() {
    if (!bid) return
    const { data } = await supabase.from('polls').select('*').order('created_at', { ascending: false }).limit(10)
    setPolls(data || [])
  }

  async function vote(pollId: string, option: string) {
    const { error } = await supabase.from('poll_votes').upsert({
      poll_id: pollId, option, voter_id: staff?.id, business_id: bid,
    })
    if (error) { showToast('Could not record vote', 'error'); return }
    showToast('Vote recorded', 'success'); loadPolls()
  }

  async function createPoll() {
    if (!newPollQ.trim() || !bid) return
    const options = newPollOpts.split('\n').map(o => o.trim()).filter(Boolean)
    if (options.length < 2) { showToast('Add at least two options', 'error'); return }
    const { error } = await supabase.from('polls').insert({
      question: newPollQ.trim(), options, created_by: staff?.id, business_id: bid, status: 'open',
    })
    if (error) { showToast('Could not create poll', 'error'); return }
    setNewPollQ(''); showToast('Poll posted', 'success'); loadPolls()
  }

  const filtered = tab === 'all' ? feed : feed.filter(f => f.kind === tab.slice(0, -1) || (tab === 'polls' && false))

  const TABS = [
    { k: 'all', label: 'All', icon: Sparkles },
    { k: 'recognition', label: 'Recognition', icon: Award },
    { k: 'announcements', label: 'Announcements', icon: Megaphone },
    { k: 'events', label: 'Events', icon: CalendarDays },
    { k: 'polls', label: 'Polls', icon: Vote },
  ] as const

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <DbStateBanner state={dbState} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--av-text)] flex items-center gap-2">
          <Sparkles size={24} className="text-[var(--av-primary)]" /> Company Wall
        </h1>
        <p className="text-sm text-[var(--av-text-secondary)] mt-1">
          What's happening in the company — recognition, announcements, events and birthdays.
        </p>
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-[var(--av-surface-3)] mb-5 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.k} onClick={() => setTab(t.k as any)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                tab === t.k ? 'bg-white text-[var(--av-primary)] shadow-[var(--av-shadow-sm)]'
                : 'text-[var(--av-text-secondary)] hover:text-[var(--av-text)]'}`}>
              <Icon size={15} /> {t.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--av-primary)]" /></div>
      ) : (
        <div className="space-y-3">
          {filtered.length === 0 && (
            <div className="rounded-2xl bg-white p-8 text-center shadow-[var(--av-shadow-sm)]">
              <p className="text-sm text-[var(--av-text-muted)]">Nothing here yet. Recognise a teammate or post an announcement to get the wall started.</p>
              <div className="flex justify-center gap-2 mt-4">
                <Link to="/app/merit" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--av-primary)] text-white text-sm font-medium"><Award size={14} /> Recognise</Link>
                <Link to="/app/announcements" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-[var(--av-text)] text-sm font-medium shadow-[var(--av-shadow-sm)]"><Megaphone size={14} /> Announce</Link>
              </div>
            </div>
          )}
          {filtered.map((item, i) => <WallItem key={i} item={item} />)}
        </div>
      )}

      {tab === 'polls' && (
        <div className="mt-6 rounded-2xl bg-white p-5 shadow-[var(--av-shadow-sm)]">
          <h2 className="font-semibold text-[var(--av-text)] flex items-center gap-2 mb-3"><Vote size={18} className="text-[var(--av-primary)]" /> Post a poll</h2>
          <input value={newPollQ} onChange={e => setNewPollQ(e.target.value)} placeholder="Ask the company a question…"
            className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]" />
          <textarea value={newPollOpts} onChange={e => setNewPollOpts(e.target.value)} rows={3}
            placeholder="One option per line"
            className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]" />
          <button onClick={createPoll} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--av-primary)] text-white text-sm font-medium hover:bg-[var(--av-primary-hover)]">
            <Plus size={14} /> Post poll
          </button>

          <div className="mt-5 space-y-3">
            {polls.map(p => <PollCard key={p.id} poll={p} onVote={vote} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function WallItem({ item }: { item: any }) {
  if (item.kind === 'recognition') {
    return (
      <div className="rounded-2xl bg-white p-4 shadow-[var(--av-shadow-sm)]">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-[var(--av-warning-soft)] flex items-center justify-center shrink-0"><Award size={18} className="text-[var(--av-warning)]" /></div>
          <div className="flex-1">
            <div className="text-sm"><b className="text-[var(--av-text)]">{item.data.recognizer_name || 'Someone'}</b> recognised <b className="text-[var(--av-text)]">{item.data.recipient_name || 'a teammate'}</b></div>
            {item.data.reason && <p className="text-sm text-[var(--av-text-secondary)] mt-1">{item.data.reason}</p>}
            <div className="text-[11px] text-[var(--av-text-muted)] mt-1">{item.data.created_at && new Date(item.data.created_at).toLocaleDateString()}</div>
          </div>
        </div>
      </div>
    )
  }
  if (item.kind === 'announcement') {
    return (
      <div className="rounded-2xl bg-white p-4 shadow-[var(--av-shadow-sm)]">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-[var(--av-info-soft)] flex items-center justify-center shrink-0"><Megaphone size={18} className="text-[var(--av-info)]" /></div>
          <div className="flex-1">
            <div className="font-semibold text-[var(--av-text)]">{item.data.title}</div>
            {item.data.body && <p className="text-sm text-[var(--av-text-secondary)] mt-1">{item.data.body}</p>}
            <div className="text-[11px] text-[var(--av-text-muted)] mt-1">{item.data.created_at && new Date(item.data.created_at).toLocaleDateString()}</div>
          </div>
        </div>
      </div>
    )
  }
  if (item.kind === 'event') {
    return (
      <div className="rounded-2xl bg-white p-4 shadow-[var(--av-shadow-sm)]">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-[var(--av-accent-soft)] flex items-center justify-center shrink-0"><CalendarDays size={18} className="text-[var(--av-accent)]" /></div>
          <div className="flex-1">
            <div className="font-semibold text-[var(--av-text)]">{item.data.title || item.data.name}</div>
            {item.data.start_date && <div className="text-xs text-[var(--av-text-secondary)] mt-0.5">{new Date(item.data.start_date).toLocaleDateString()} {item.data.location && `· ${item.data.location}`}</div>}
            {item.data.description && <p className="text-sm text-[var(--av-text-secondary)] mt-1 line-clamp-2">{item.data.description}</p>}
          </div>
        </div>
      </div>
    )
  }
  if (item.kind === 'birthday') {
    return (
      <div className={`rounded-2xl p-4 shadow-[var(--av-shadow-sm)] ${item.today ? 'bg-[var(--av-warning-soft)]' : 'bg-white'}`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[var(--av-warning-soft)] flex items-center justify-center shrink-0"><Cake size={18} className="text-[var(--av-warning)]" /></div>
          <div className="flex-1">
            <div className="text-sm">
              {item.today
                ? <>🎉 <b className="text-[var(--av-text)]">{item.data.full_name}</b> has a birthday today!</>
                : <><b className="text-[var(--av-text)]">{item.data.full_name}</b> · birthday {monthDay(item.data.date_of_birth)}</>}
            </div>
            {item.data.department && <div className="text-[11px] text-[var(--av-text-muted)]">{item.data.department}</div>}
          </div>
        </div>
      </div>
    )
  }
  return null
}

function PollCard({ poll, onVote }: { poll: any; onVote: (id: string, option: string) => void }) {
  const [voted, setVoted] = useState(false)
  return (
    <div className="rounded-xl border border-[var(--av-border)] p-3">
      <div className="font-medium text-[var(--av-text)] text-sm mb-2">{poll.question}</div>
      <div className="space-y-1.5">
        {(poll.options || []).map((opt: string) => (
          <button key={opt} disabled={voted}
            onClick={() => { onVote(poll.id, opt); setVoted(true) }}
            className="w-full text-left px-3 py-1.5 rounded-lg bg-[var(--av-surface-3)] hover:bg-[var(--av-primary-soft)] text-sm text-[var(--av-text)] transition-colors disabled:opacity-60 flex items-center justify-between">
            <span>{opt}</span> <ThumbsUp size={13} className="text-[var(--av-text-muted)]" />
          </button>
        ))}
      </div>
      {voted && <div className="text-[11px] text-[var(--av-success)] mt-2 flex items-center gap-1"><MessageSquare size={11} /> Thanks for voting!</div>}
    </div>
  )
}
