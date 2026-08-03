import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useToast } from '../../components/Toast'
import { 
  Camera, Video, Image, Plus, Heart, MessageSquare, 
  Share2, Bookmark, Calendar, MapPin, X, Play,
  ChevronLeft, ChevronRight, Download, Trash2, Tag, Globe
} from 'lucide-react'

type MediaItem = {
  id: string
  type: 'photo' | 'video' | 'social_post'
  url: string
  thumbnail?: string
  caption?: string
  tags?: string[]
  location?: string
  event_date?: string
  likes: number
  comments: number
  is_liked: boolean
  is_saved: boolean
  created_by: string
  created_at: string
  platform?: 'instagram' | 'twitter' | 'facebook' | 'other'
}

type Event = {
  id: string
  name: string
  date: string
  cover_image?: string
  media_count: number
}

export default function MediaWall() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [items, setItems] = useState<MediaItem[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [activeEvent, setActiveEvent] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | 'photos' | 'videos' | 'social'>('all')
  const [showUpload, setShowUpload] = useState(false)
  const [showLightbox, setShowLightbox] = useState<MediaItem | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadMedia = async () => {
    if (!staff?.business_id) return
    const { data } = await supabase
      .from('media_wall')
      .select('*')
      .eq('business_id', staff.business_id)
      .order('created_at', { ascending: false })
    
    setItems((data as MediaItem[]) ?? [])
    
    // Group by events
    const eventGroups = (data as MediaItem[])?.reduce((acc: Record<string, Event>, item) => {
      const eventName = item.tags?.[0] || 'General'
      if (!acc[eventName]) {
        acc[eventName] = { id: eventName, name: eventName, date: item.event_date || '', media_count: 0 }
      }
      acc[eventName].media_count++
      return acc
    }, {})
    setEvents(Object.values(eventGroups || []))
  }

  useEffect(() => { loadMedia() }, [staff?.business_id])

  const handleUpload = async (files: FileList | null) => {
    if (!files || !staff?.business_id) return
    
    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith('video/')
      const storagePath = `${staff.business_id}/${isVideo ? 'videos' : 'photos'}/${Date.now()}_${file.name}`
      
      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(storagePath, file)
      
      if (uploadError) {
        showToast(`Failed to upload ${file.name}`, 'error')
        continue
      }
      
      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(storagePath)
      
      await supabase.from('media_wall').insert({
        type: isVideo ? 'video' : 'photo',
        url: publicUrl,
        thumbnail: isVideo ? '/video-thumbnail.png' : undefined,
        business_id: staff.business_id,
        created_by: staff.id,
      })
    }
    
    showToast('Media uploaded!', 'success')
    setShowUpload(false)
    loadMedia()
  }

  const toggleLike = async (item: MediaItem) => {
    await supabase.from('media_wall').update({ 
      is_liked: !item.is_liked,
      likes: item.is_liked ? item.likes - 1 : item.likes + 1
    }).eq('id', item.id)
    loadMedia()
  }

  const toggleSave = async (item: MediaItem) => {
    await supabase.from('media_wall').update({ is_saved: !item.is_saved }).eq('id', item.id)
    loadMedia()
  }

  const filteredItems = items.filter(item => {
    if (activeEvent && !item.tags?.includes(activeEvent)) return false
    if (activeTab === 'photos' && item.type !== 'photo') return false
    if (activeTab === 'videos' && item.type !== 'video') return false
    if (activeTab === 'social' && item.type !== 'social_post') return false
    return true
  })

  const getSocialIcon = (platform?: string) => {
    switch (platform) {
      case 'instagram': return <Globe size={14} className="text-pink-500" />
      case 'twitter': return <Globe size={14} className="text-blue-400" />
      case 'facebook': return <Globe size={14} className="text-blue-600" />
      default: return <Globe size={14} />
    }
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Media Wall</h1>
          <p className="text-sm text-black/50">Celebrate moments, share memories</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium"
        >
          <Plus size={16} />
          Upload
        </button>
      </div>

      {/* Events Filter */}
      <div className="mb-6 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          <button
            onClick={() => setActiveEvent(null)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              !activeEvent ? 'avenize-gradient text-white' : 'bg-black/[0.03] hover:bg-black/[0.06]'
            }`}
          >
            All Events
          </button>
          {events.map(event => (
            <button
              key={event.id}
              onClick={() => setActiveEvent(event.name)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                activeEvent === event.name 
                  ? 'avenize-gradient text-white' 
                  : 'bg-black/[0.03] hover:bg-black/[0.06]'
              }`}
            >
              <Image size={14} />
              {event.name}
              <span className="text-xs opacity-70">({event.media_count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Type Tabs */}
      <div className="flex gap-1 bg-black/[0.03] rounded-xl p-1 mb-6">
        {(['all', 'photos', 'videos', 'social'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              activeTab === tab ? 'bg-white shadow-sm' : 'hover:bg-black/[0.02]'
            }`}
          >
            {tab === 'all' && <Image size={16} />}
            {tab === 'photos' && <Camera size={16} />}
            {tab === 'videos' && <Video size={16} />}
            {tab === 'social' && <Globe size={16} />}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Media Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {filteredItems.map((item, index) => (
          <div
            key={item.id}
            className={`relative group cursor-pointer rounded-xl overflow-hidden ${
              item.type === 'video' ? 'aspect-video' : 'aspect-square'
            }`}
            onClick={() => { setShowLightbox(item); setLightboxIndex(index) }}
          >
            {item.type === 'photo' || item.type === 'social_post' ? (
              <img src={item.url} alt={item.caption || ''} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-black/80 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                  <Play size={32} className="text-white" />
                </div>
              </div>
            )}
            
            {item.type === 'social_post' && item.platform && (
              <div className="absolute top-2 left-2 p-1.5 bg-white rounded-lg shadow">
                {getSocialIcon(item.platform)}
              </div>
            )}
            
            {item.type === 'video' && (
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            )}
            
            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
              <button
                onClick={(e) => { e.stopPropagation(); toggleLike(item) }}
                className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
              >
                <Heart size={20} className={item.is_liked ? 'text-red-500 fill-red-500' : 'text-white'} />
              </button>
              <span className="text-white text-sm font-medium">{item.likes}</span>
              <button
                onClick={(e) => { e.stopPropagation(); toggleSave(item) }}
                className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
              >
                <Bookmark size={20} className={item.is_saved ? 'text-yellow-400 fill-yellow-400' : 'text-white'} />
              </button>
            </div>
            
            {item.location && (
              <div className="absolute bottom-2 left-2 flex items-center gap-1 text-white text-xs">
                <MapPin size={12} />
                {item.location}
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredItems.length === 0 && (
        <div className="text-center py-16">
          <Image size={64} className="mx-auto text-black/10 mb-4" />
          <h3 className="font-bold text-lg mb-2">No media yet</h3>
          <p className="text-black/50 text-sm mb-4">Start capturing your team's memorable moments</p>
          <button
            onClick={() => setShowUpload(true)}
            className="px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium"
          >
            Upload First Photo
          </button>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-black/5">
              <h2 className="font-bold text-lg">Upload Media</h2>
              <button onClick={() => setShowUpload(false)} className="p-2 hover:bg-black/5 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="p-5">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={(e) => handleUpload(e.target.files)}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-12 border-2 border-dashed border-black/20 rounded-xl flex flex-col items-center justify-center gap-3 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all"
              >
                <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center">
                  <Plus size={32} className="text-indigo-600" />
                </div>
                <div className="text-center">
                  <p className="font-medium">Click to upload photos or videos</p>
                  <p className="text-sm text-black/50">PNG, JPG, GIF, MP4 up to 50MB</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {showLightbox && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center">
          <button
            onClick={() => setShowLightbox(null)}
            className="absolute top-4 right-4 p-2 text-white/60 hover:text-white"
          >
            <X size={32} />
          </button>
          
          <button
            onClick={() => setLightboxIndex(Math.max(0, lightboxIndex - 1))}
            className="absolute left-4 p-2 text-white/60 hover:text-white"
          >
            <ChevronLeft size={32} />
          </button>
          
          <button
            onClick={() => setLightboxIndex(Math.min(filteredItems.length - 1, lightboxIndex + 1))}
            className="absolute right-4 p-2 text-white/60 hover:text-white"
          >
            <ChevronRight size={32} />
          </button>
          
          <div className="max-w-4xl max-h-[80vh]">
            {filteredItems[lightboxIndex].type === 'video' ? (
              <video src={filteredItems[lightboxIndex].url} controls className="max-h-[80vh] rounded-lg" />
            ) : (
              <img
                src={filteredItems[lightboxIndex].url}
                alt=""
                className="max-h-[80vh] rounded-lg object-contain"
              />
            )}
          </div>
          
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4">
            <button
              onClick={() => toggleLike(filteredItems[lightboxIndex])}
              className={`px-4 py-2 rounded-full flex items-center gap-2 ${
                filteredItems[lightboxIndex].is_liked
                  ? 'bg-red-500 text-white'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <Heart size={18} className={filteredItems[lightboxIndex].is_liked ? 'fill-white' : ''} />
              {filteredItems[lightboxIndex].likes}
            </button>
            <button
              onClick={() => toggleSave(filteredItems[lightboxIndex])}
              className={`px-4 py-2 rounded-full flex items-center gap-2 ${
                filteredItems[lightboxIndex].is_saved
                  ? 'bg-yellow-500 text-white'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <Bookmark size={18} className={filteredItems[lightboxIndex].is_saved ? 'fill-white' : ''} />
              Save
            </button>
            <button className="px-4 py-2 rounded-full bg-white/20 text-white hover:bg-white/30 flex items-center gap-2">
              <Share2 size={18} />
              Share
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
