import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import { ListSkeleton } from '../components/Skeleton'
import EntitlementGate from '../components/EntitlementGate'
import { Globe, Camera, Calendar, BarChart3, Palette, Send, Image, Eye, Heart, MessageCircle, Share2 } from 'lucide-react'

type SocialPost = {
  id: string
  platform: 'instagram' | 'linkedin' | 'facebook' | 'twitter' | 'tiktok'
  content: string
  image_url: string | null
  scheduled_at: string | null
  published_at: string | null
  status: 'draft' | 'scheduled' | 'published' | 'failed'
  likes_count: number
  comments_count: number
  shares_count: number
  impressions_count: number
  reach_count: number
  created_at: string
}

type SocialMetrics = {
  platform: string
  followers_count: number
  engagement_count: number
  posts_count: number
  impressions_count: number
  reach_count: number
}

type BrandAsset = {
  id: string
  name: string
  asset_type: string
  file_url: string | null
  color_hex: string | null
}

const PLATFORMS = [
  { id: 'instagram', name: 'Instagram', icon: Camera, color: 'bg-pink-500' },
  { id: 'linkedin', name: 'LinkedIn', icon: Globe, color: 'bg-blue-600' },
  { id: 'facebook', name: 'Facebook', icon: Globe, color: 'bg-blue-500' },
  { id: 'twitter', name: 'X/Twitter', icon: Globe, color: 'bg-black' },
  { id: 'tiktok', name: 'TikTok', icon: () => <span className="text-lg">🎵</span>, color: 'bg-pink-600' },
]

// Demo data
const DEMO_POSTS: SocialPost[] = [
  { id: '1', content: 'Excited to announce our new product launch! 🚀 #innovation #startup', platform: 'linkedin', status: 'published', scheduled_at: null, published_at: new Date(Date.now() - 86400000).toISOString(), image_url: null, likes_count: 124, comments_count: 18, shares_count: 12, impressions_count: 1500, reach_count: 1200, created_at: new Date().toISOString() },
  { id: '2', content: 'Behind the scenes of our team building day! 💪', platform: 'instagram', status: 'published', scheduled_at: null, published_at: new Date(Date.now() - 2 * 86400000).toISOString(), image_url: null, likes_count: 256, comments_count: 32, shares_count: 8, impressions_count: 2000, reach_count: 1800, created_at: new Date().toISOString() },
  { id: '3', content: 'Join us for our upcoming webinar on digital marketing strategies 📊', platform: 'facebook', status: 'scheduled', scheduled_at: new Date(Date.now() + 3 * 86400000).toISOString(), published_at: null, image_url: null, likes_count: 0, comments_count: 0, shares_count: 0, impressions_count: 0, reach_count: 0, created_at: new Date().toISOString() },
]

const DEMO_METRICS: SocialMetrics[] = [
  { platform: 'instagram', followers_count: 4521, engagement_count: 190, posts_count: 45, impressions_count: 25000, reach_count: 18000 },
  { platform: 'linkedin', followers_count: 2134, engagement_count: 124, posts_count: 23, impressions_count: 12000, reach_count: 8500 },
  { platform: 'facebook', followers_count: 892, engagement_count: 19, posts_count: 18, impressions_count: 4500, reach_count: 3200 },
]

export default function Social() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<'posts' | 'metrics' | 'branding'>('posts')
  const [loading, setLoading] = useState(true)
  
  // Posts state
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [content, setContent] = useState('')
  const [platform, setPlatform] = useState<SocialPost['platform']>('instagram')
  const [scheduledAt, setScheduledAt] = useState('')
  const [isScheduled, setIsScheduled] = useState(false)
  
  // Metrics state
  const [metrics, setMetrics] = useState<SocialMetrics[]>([])
  
  // Branding state
  const [brandName, setBrandName] = useState('')
  const [brandTagline, setBrandTagline] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#FF7A59')
  const [secondaryColor, setSecondaryColor] = useState('#4285F4')
  const [brandAssets, setBrandAssets] = useState<BrandAsset[]>([])

  const load = async () => {
    setLoading(true)
    
    try {
      const [{ data: postsData }, { data: metricsData }, { data: assetsData }] = await Promise.all([
        supabase.from('social_posts').select('*').order('created_at', { ascending: false }),
        supabase.from('social_metrics').select('*').order('date', { ascending: false }).limit(30),
        supabase.from('brand_assets').select('*').order('created_at'),
      ])
      
      if (postsData && postsData.length > 0) {
        setPosts(postsData as SocialPost[])
      } else {
        setPosts([])
      }
      if (metricsData && metricsData.length > 0) {
        setMetrics(metricsData as SocialMetrics[])
      } else {
        setMetrics([])
      }
      setBrandAssets((assetsData as BrandAsset[]) ?? [])
    } catch {
      setPosts([])
      setMetrics([])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const createPost = async () => {
    if (!content.trim()) {
      showToast('Write something first', 'error')
      return
    }
    const { error } = await supabase.from('social_posts').insert({
      platform,
      content,
      scheduled_at: isScheduled && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      status: isScheduled ? 'scheduled' : 'draft',
      created_by: staff?.id,
    })
    if (error) {
      showToast('Failed to create post', 'error')
    } else {
      showToast(isScheduled ? 'Post scheduled!' : 'Draft saved!', 'success')
      setContent('')
      setScheduledAt('')
      setIsScheduled(false)
      load()
    }
  }

  const publishPost = async (id: string) => {
    const { error } = await supabase.from('social_posts').update({
      status: 'published',
      published_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) {
      showToast('Failed to publish', 'error')
    } else {
      showToast('Post published! 🚀', 'success')
      load()
    }
  }

  const deletePost = async (id: string) => {
    await supabase.from('social_posts').delete().eq('id', id)
    showToast('Post deleted', 'info')
    load()
  }

  const saveBranding = async () => {
    const { error } = await supabase
      .from('businesses')
      .update({
        brand_name: brandName,
        brand_tagline: brandTagline,
        brand_colors: JSON.stringify([primaryColor, secondaryColor]),
      })
      .eq('id', staff?.business_id)
    if (error) {
      showToast('Failed to save branding', 'error')
    } else {
      showToast('Branding saved!', 'success')
    }
  }

  const addBrandAsset = async (type: BrandAsset['asset_type']) => {
    const name = prompt(`Enter ${type} name:`)
    if (!name) return
    const url = prompt(`Enter file URL (or leave empty):`)
    const { error } = await supabase.from('brand_assets').insert({
      name,
      asset_type: type,
      file_url: url || null,
    })
    if (error) {
      showToast('Failed to add asset', 'error')
    } else {
      showToast('Asset added!', 'success')
      load()
    }
  }

  const PlatformIcon = ({ platform }: { platform: string }) => {
    const p = PLATFORMS.find((x) => x.id === platform)
    if (!p) return null
    return <p.icon className="w-4 h-4" />
  }

  const tabs = [
    { id: 'posts', label: 'Posts', icon: Send },
    { id: 'metrics', label: 'Metrics', icon: BarChart3 },
    { id: 'branding', label: 'Branding', icon: Palette },
  ]

  return (
    <EntitlementGate feature="social_media" modal={true}>
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-black">Social Media</h1>
          <p className="text-sm text-black mt-0.5">Manage posts, track metrics, and build your brand</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-black/[0.06] mb-6 w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'avenize-gradient text-white'
                  : 'text-black hover:text-black'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* POSTS TAB */}
      {activeTab === 'posts' && (
        <div className="space-y-6">
          {/* Compose */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
            <div className="flex flex-wrap gap-2 mb-3">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPlatform(p.id as SocialPost['platform'])}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                    platform === p.id
                      ? `${p.color} text-white`
                      : 'bg-black/[0.04] text-black/60 hover:bg-black/[0.08]'
                  }`}
                >
                  <p.icon size={12} />
                  {p.name}
                </button>
              ))}
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's on your mind? Write your post here..."
              className="w-full h-28 resize-none rounded-lg border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4285F4]/30"
            />
            <div className="flex items-center justify-between mt-3">
              <label className="flex items-center gap-2 text-xs text-black cursor-pointer">
                <Calendar size={14} />
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => {
                    setScheduledAt(e.target.value)
                    setIsScheduled(true)
                  }}
                  className="border border-black/10 rounded px-2 py-1"
                />
              </label>
              <div className="flex gap-2">
                <button
                  onClick={createPost}
                  className="rounded-lg bg-[var(--av-text)] text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition"
                >
                  {isScheduled ? 'Schedule' : 'Save Draft'}
                </button>
                {content.trim() && (
                  <button
                    onClick={async () => {
                      await createPost()
                      if (posts.length > 0) {
                        await publishPost(posts[0].id)
                      }
                    }}
                    className="rounded-lg avenize-gradient text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition"
                  >
                    Post Now
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Posts Feed */}
          {loading ? (
            <ListSkeleton items={4} />
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <div key={post.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-8 h-8 rounded-full ${PLATFORMS.find(p => p.id === post.platform)?.color} flex items-center justify-center text-white`}>
                        <PlatformIcon platform={post.platform} />
                      </span>
                      <span className="text-sm font-medium text-black capitalize">{post.platform}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        post.status === 'published' ? 'bg-green-100 text-green-700' :
                        post.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                        'bg-white text-black'
                      }`}>
                        {post.status}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {post.status === 'draft' && (
                        <button
                          onClick={() => publishPost(post.id)}
                          className="text-xs text-[#4285F4] hover:underline"
                        >
                          Publish
                        </button>
                      )}
                      <button
                        onClick={() => deletePost(post.id)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-black mb-3">{post.content}</p>
                  {post.status === 'published' && (
                    <div className="flex items-center gap-4 text-xs text-black">
                      <span className="flex items-center gap-1"><Heart size={12} /> {post.likes_count}</span>
                      <span className="flex items-center gap-1"><MessageCircle size={12} /> {post.comments_count}</span>
                      <span className="flex items-center gap-1"><Share2 size={12} /> {post.shares_count}</span>
                      <span className="flex items-center gap-1"><Eye size={12} /> {post.impressions_count} views</span>
                    </div>
                  )}
                  {post.status === 'scheduled' && post.scheduled_at && (
                    <p className="text-xs text-black">
                      Scheduled for {new Date(post.scheduled_at).toLocaleString()}
                    </p>
                  )}
                </div>
              ))}
              {posts.length === 0 && (
                <div className="text-center py-12 text-black">
                  <Send size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No posts yet. Create your first post above!</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* METRICS TAB */}
      {activeTab === 'metrics' && (
        <div className="space-y-6">
          {loading ? (
            <ListSkeleton items={5} />
          ) : (
            <>
              {/* Platform Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {PLATFORMS.map((p) => {
                  const platformMetrics = metrics.filter(m => m.platform === p.id)
                  const totalFollowers = platformMetrics.reduce((sum, m) => sum + m.followers_count, 0)
                  const totalEngagement = platformMetrics.reduce((sum, m) => sum + m.engagement_count, 0)
                  return (
                    <div key={p.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`w-8 h-8 rounded-full ${p.color} flex items-center justify-center text-white`}>
                          <p.icon size={14} />
                        </span>
                        <span className="text-sm font-medium">{p.name}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-black">Followers</span>
                          <span className="font-medium">{totalFollowers.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-black">Engagement</span>
                          <span className="font-medium">{totalEngagement.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Quick Stats */}
              <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
                <p className="text-sm font-medium text-black mb-3">Total Performance</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-black/[0.02] rounded-xl">
                    <p className="text-2xl font-semibold text-black">
                      {metrics.reduce((sum, m) => sum + m.followers_count, 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-black mt-1">Total Followers</p>
                  </div>
                  <div className="text-center p-3 bg-black/[0.02] rounded-xl">
                    <p className="text-2xl font-semibold text-black">
                      {metrics.reduce((sum, m) => sum + m.engagement_count, 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-black mt-1">Engagements</p>
                  </div>
                  <div className="text-center p-3 bg-black/[0.02] rounded-xl">
                    <p className="text-2xl font-semibold text-black">
                      {metrics.reduce((sum, m) => sum + m.impressions_count, 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-black mt-1">Impressions</p>
                  </div>
                  <div className="text-center p-3 bg-black/[0.02] rounded-xl">
                    <p className="text-2xl font-semibold text-black">
                      {metrics.reduce((sum, m) => sum + m.reach_count, 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-black mt-1">Reach</p>
                  </div>
                </div>
              </div>

              {/* Note about manual metrics entry */}
              <p className="text-xs text-black text-center">
                Metrics are synced manually or via integrations. Full analytics connections come in a later phase.
              </p>
            </>
          )}
        </div>
      )}

      {/* BRANDING TAB */}
      {activeTab === 'branding' && (
        <div className="space-y-6">
          {/* Brand Identity */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
            <p className="text-sm font-medium text-black mb-4">Brand Identity</p>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-black block mb-1">Brand Name</label>
                <input
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Your brand name"
                  className="w-full max-w-sm rounded-lg border border-black/10 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-black block mb-1">Tagline</label>
                <input
                  value={brandTagline}
                  onChange={(e) => setBrandTagline(e.target.value)}
                  placeholder="Your brand tagline"
                  className="w-full max-w-sm rounded-lg border border-black/10 px-3 py-2 text-sm"
                />
              </div>
              <button
                onClick={saveBranding}
                className="rounded-lg avenize-gradient text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition"
              >
                Save Branding
              </button>
            </div>
          </div>

          {/* Brand Colors */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
            <p className="text-sm font-medium text-black mb-4">Brand Colors</p>
            <div className="flex items-center gap-4">
              <div>
                <label className="text-xs text-black block mb-1">Primary</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-black/10 cursor-pointer"
                  />
                  <input
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="rounded-lg border border-black/10 px-2 py-1 text-xs w-20"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-black block mb-1">Secondary</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-black/10 cursor-pointer"
                  />
                  <input
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="rounded-lg border border-black/10 px-2 py-1 text-xs w-20"
                  />
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <div
                className="w-20 h-20 rounded-xl"
                style={{ backgroundColor: primaryColor }}
              />
              <div
                className="w-20 h-20 rounded-xl"
                style={{ backgroundColor: secondaryColor }}
              />
              <div
                className="w-20 h-20 rounded-xl avenize-gradient"
              />
            </div>
          </div>

          {/* Brand Assets */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
            <p className="text-sm font-medium text-black mb-4">Brand Assets</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {['logo', 'banner', 'avatar', 'template'].map((type) => (
                <button
                  key={type}
                  onClick={() => addBrandAsset(type as BrandAsset['asset_type'])}
                  className="aspect-square rounded-xl border-2 border-dashed border-black/10 flex flex-col items-center justify-center gap-2 text-black hover:border-[#4285F4] hover:text-[#4285F4] transition"
                >
                  <Image size={20} />
                  <span className="text-xs capitalize">{type}</span>
                </button>
              ))}
            </div>
            {brandAssets.length > 0 && (
              <div className="mt-4 space-y-2">
                {brandAssets.map((asset) => (
                  <div key={asset.id} className="flex items-center justify-between py-2 border-b border-black/5">
                    <div className="flex items-center gap-2">
                      {asset.color_hex && (
                        <div
                          className="w-6 h-6 rounded"
                          style={{ backgroundColor: asset.color_hex }}
                        />
                      )}
                      <span className="text-sm">{asset.name}</span>
                      <span className="text-xs text-black capitalize">({asset.asset_type})</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </EntitlementGate>
  )
}
