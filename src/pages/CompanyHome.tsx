import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useBranding } from '../lib/BrandingContext'
import { useToast } from '../components/Toast'
import { 
  Home, Plus, GripVertical, Trash2, Edit3, Eye, EyeOff, 
  Save, X, ChevronUp, ChevronDown, Star, MessageCircle,
  Heart, Award, BarChart3, Image, Type, Quote, MousePointer, Send
} from 'lucide-react'

type BlockType = 'hero' | 'announcement' | 'team_spotlight' | 'metrics' | 'gallery' | 'quote' | 'cta' | 'text'

interface ContentHero {
  subtitle?: string
  cta_text?: string
  cta_link?: string
  background_image?: string
}

interface ContentAnnouncement {
  body: string
  author?: string
  priority?: 'normal' | 'important' | 'urgent'
}

interface ContentTeamSpotlight {
  staff_ids: string[]
  description?: string
}

interface ContentMetrics {
  items: Array<{ label: string; value: string; change?: string }>
}

interface ContentGallery {
  images: Array<{ url: string; caption?: string }>
  layout?: 'grid' | 'carousel'
}

interface ContentQuote {
  text: string
  author?: string
  role?: string
  avatar_url?: string
}

interface ContentCTA {
  text: string
  link: string
  style?: 'primary' | 'secondary'
}

interface ContentText {
  body: string
}

type BlockContent = ContentHero | ContentAnnouncement | ContentTeamSpotlight | ContentMetrics | ContentGallery | ContentQuote | ContentCTA | ContentText

interface HomeBlock {
  id: string
  business_id: string
  block_type: BlockType
  title?: string
  content: BlockContent
  order: number
  published: boolean
  created_by?: string
  created_at: string
  updated_at: string
  // Joined data
  comment_count?: number
  reaction_count?: number
  user_reaction?: string
}

interface Comment {
  id: string
  block_id: string
  staff_id: string
  content: string
  created_at: string
  staff_name?: string
}

const BLOCK_TYPES: Array<{ type: BlockType; label: string; icon: typeof Star; description: string }> = [
  { type: 'hero', label: 'Hero Banner', icon: Home, description: 'Large banner with title' },
  { type: 'announcement', label: 'Announcement', icon: Star, description: 'News or update' },
  { type: 'team_spotlight', label: 'Team Spotlight', icon: Award, description: 'Featured team member' },
  { type: 'metrics', label: 'Metrics', icon: BarChart3, description: 'Key statistics' },
  { type: 'gallery', label: 'Gallery', icon: Image, description: 'Image gallery' },
  { type: 'quote', label: 'Quote', icon: Quote, description: 'Testimonial or quote' },
  { type: 'cta', label: 'Call to Action', icon: MousePointer, description: 'Button or link' },
  { type: 'text', label: 'Text', icon: Type, description: 'Rich text section' },
]

const REACTION_TYPES = [
  { type: 'like', icon: Heart, label: 'Like' },
  { type: 'celebrate', icon: Star, label: 'Celebrate' },
  { type: 'insight', icon: MessageCircle, label: 'Insight' },
  { type: 'love', icon: Heart, label: 'Love' },
]

// Demo blocks for demo mode
const DEMO_BLOCKS: HomeBlock[] = [
  {
    id: 'demo-1',
    business_id: 'demo',
    block_type: 'hero',
    title: 'Welcome to Our Company',
    content: { 
      subtitle: 'Building the future together',
      cta_text: 'Learn More',
      cta_link: '/app/about'
    },
    order: 0,
    published: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-2',
    business_id: 'demo',
    block_type: 'announcement',
    title: 'Q4 All-Hands Meeting',
    content: {
      body: 'Join us next Friday at 2pm for our quarterly all-hands meeting. We will be discussing company milestones, upcoming projects, and celebrating team achievements.',
      author: 'Leadership Team',
      priority: 'important'
    },
    order: 1,
    published: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    comment_count: 3,
    reaction_count: 12,
  },
  {
    id: 'demo-3',
    business_id: 'demo',
    block_type: 'metrics',
    title: 'This Quarter',
    content: {
      items: [
        { label: 'Revenue', value: '₦2.5M', change: '+15%' },
        { label: 'Customers', value: '340', change: '+23' },
        { label: 'Team Size', value: '45', change: '+5' },
      ]
    },
    order: 2,
    published: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-4',
    business_id: 'demo',
    block_type: 'team_spotlight',
    title: 'Star Performer',
    content: {
      staff_ids: ['demo-staff-1'],
      description: 'Celebrating our top performer this month for exceeding targets by 150%!'
    },
    order: 3,
    published: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

export default function CompanyHome() {
  const { staff, isDemo } = useAuth()
  const { branding } = useBranding()
  const { showToast } = useToast()
  
  const [blocks, setBlocks] = useState<HomeBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editingBlock, setEditingBlock] = useState<HomeBlock | null>(null)
  const [saving, setSaving] = useState(false)
  const [showBlockPicker, setShowBlockPicker] = useState(false)
  const [comments, setComments] = useState<Record<string, Comment[]>>({})
  const [newComment, setNewComment] = useState('')
  const [showCommentModal, setShowCommentModal] = useState<string | null>(null)
  
  const canEdit = staff?.role === 'owner' || staff?.role === 'manager'
  
  // Load blocks
  useEffect(() => {
    if (isDemo) {
      setBlocks(DEMO_BLOCKS)
      setLoading(false)
    } else {
      loadBlocks()
    }
  }, [staff?.business_id, isDemo])
  
  const loadBlocks = async () => {
    if (!staff?.business_id) return
    
    setLoading(true)
    const { data, error } = await supabase
      .from('company_home_blocks')
      .select('*')
      .eq('business_id', staff.business_id)
      .order('order')
    
    if (error) {
      showToast('Failed to load page content', 'error')
    } else {
      setBlocks(data || [])
    }
    setLoading(false)
  }
  
  const addBlock = async (type: BlockType) => {
    const newBlock: Partial<HomeBlock> = {
      block_type: type,
      content: getDefaultContent(type),
      order: blocks.length,
      published: false,
    }
    
    if (isDemo) {
      const block: HomeBlock = {
        id: `demo-${Date.now()}`,
        business_id: 'demo',
        block_type: type,
        content: newBlock.content!,
        order: blocks.length,
        published: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setBlocks([...blocks, block])
      showToast('Block added', 'success')
    } else {
      const { data, error } = await supabase
        .from('company_home_blocks')
        .insert({ ...newBlock, business_id: staff?.business_id })
        .select()
        .single()
      
      if (error) {
        showToast('Failed to add block', 'error')
      } else {
        setBlocks([...blocks, data])
        showToast('Block added', 'success')
      }
    }
    
    setShowBlockPicker(false)
  }
  
  const updateBlock = async (updatedBlock: HomeBlock) => {
    if (isDemo) {
      setBlocks(blocks.map(b => b.id === updatedBlock.id ? updatedBlock : b))
      showToast('Block updated', 'success')
    } else {
      const { error } = await supabase
        .from('company_home_blocks')
        .update({
          title: updatedBlock.title,
          content: updatedBlock.content,
          published: updatedBlock.published,
          order: updatedBlock.order,
        })
        .eq('id', updatedBlock.id)
      
      if (error) {
        showToast('Failed to update block', 'error')
      } else {
        setBlocks(blocks.map(b => b.id === updatedBlock.id ? { ...updatedBlock, updated_at: new Date().toISOString() } : b))
        showToast('Block updated', 'success')
      }
    }
    setEditingBlock(null)
  }
  
  const deleteBlock = async (blockId: string) => {
    if (!confirm('Delete this block?')) return
    
    if (isDemo) {
      setBlocks(blocks.filter(b => b.id !== blockId))
    } else {
      const { error } = await supabase
        .from('company_home_blocks')
        .delete()
        .eq('id', blockId)
      
      if (error) {
        showToast('Failed to delete block', 'error')
      } else {
        setBlocks(blocks.filter(b => b.id !== blockId))
        showToast('Block deleted', 'success')
      }
    }
  }
  
  const togglePublish = async (block: HomeBlock) => {
    await updateBlock({ ...block, published: !block.published })
  }
  
  const moveBlock = async (blockId: string, direction: 'up' | 'down') => {
    const index = blocks.findIndex(b => b.id === blockId)
    if (index === -1) return
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === blocks.length - 1) return
    
    const newBlocks = [...blocks]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    ;[newBlocks[index], newBlocks[targetIndex]] = [newBlocks[targetIndex], newBlocks[index]]
    
    // Update orders
    const updatedBlocks = newBlocks.map((b, i) => ({ ...b, order: i }))
    setBlocks(updatedBlocks)
    
    // Save to DB
    if (!isDemo) {
      for (const block of updatedBlocks) {
        await supabase
          .from('company_home_blocks')
          .update({ order: block.order })
          .eq('id', block.id)
      }
    }
  }
  
  const addReaction = async (blockId: string, reactionType: string) => {
    if (isDemo) {
      setBlocks(blocks.map(b => 
        b.id === blockId 
          ? { ...b, reaction_count: (b.reaction_count || 0) + 1, user_reaction: reactionType }
          : b
      ))
      return
    }
    
    const { error } = await supabase
      .from('home_block_reactions')
      .upsert({
        block_id: blockId,
        staff_id: staff?.id,
        reaction_type: reactionType,
      }, { onConflict: 'block_id,staff_id' })
    
    if (!error) {
      loadBlocks()
    }
  }
  
  const loadComments = async (blockId: string) => {
    if (isDemo) {
      setComments({ ...comments, [blockId]: [] })
      return
    }
    
    const { data } = await supabase
      .from('home_block_comments')
      .select('*, staff:staff_id(name)')
      .eq('block_id', blockId)
      .order('created_at')
    
    setComments({ ...comments, [blockId]: data || [] })
  }
  
  const addComment = async (blockId: string) => {
    if (!newComment.trim()) return
    
    if (isDemo) {
      const comment: Comment = {
        id: `demo-comment-${Date.now()}`,
        block_id: blockId,
        staff_id: 'demo',
        content: newComment,
        created_at: new Date().toISOString(),
        staff_name: 'Demo User',
      }
      setComments({ ...comments, [blockId]: [...(comments[blockId] || []), comment] })
      setNewComment('')
      return
    }
    
    const { data, error } = await supabase
      .from('home_block_comments')
      .insert({ block_id: blockId, staff_id: staff?.id, content: newComment })
      .select('*, staff:staff_id(name)')
      .single()
    
    if (!error && data) {
      setComments({ ...comments, [blockId]: [...(comments[blockId] || []), data] })
      setNewComment('')
    }
  }
  
  return (
    <div className="min-h-screen bg-[var(--avenize-offwhite)]">
      {/* Header */}
      <div className="bg-white border-b border-black/5 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[var(--avenize-black)]">
              {branding.brand_name || branding.custom_name || staff?.business_name || 'Company Home'}
            </h1>
            <p className="text-sm text-black/50">Your company's internal homepage</p>
          </div>
          {canEdit && (
            <button
              onClick={() => setEditing(!editing)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
                editing 
                  ? 'bg-[var(--avenize-primary)] text-white' 
                  : 'bg-black/5 hover:bg-black/10 text-[var(--avenize-black)]'
              }`}
            >
              {editing ? <Eye size={18} /> : <Edit3 size={18} />}
              {editing ? 'Preview' : 'Edit Page'}
            </button>
          )}
        </div>
      </div>
      
      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl h-48 animate-pulse" />
            ))}
          </div>
        ) : blocks.length === 0 ? (
          <div className="text-center py-16">
            <Home size={48} className="mx-auto text-black/20 mb-4" />
            <h2 className="text-lg font-medium text-black/60">No content yet</h2>
            <p className="text-sm text-black/40 mt-1">
              {canEdit ? 'Click "Edit Page" to add your first block' : 'Check back later for updates'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {blocks.map((block, index) => (
              <div key={block.id} className="relative group">
                {/* Edit controls */}
                {editing && (
                  <div className="absolute -left-12 top-4 flex flex-col gap-1 z-20">
                    <button
                      onClick={() => togglePublish(block)}
                      className={`p-1.5 rounded ${block.published ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}
                      title={block.published ? 'Unpublish' : 'Publish'}
                    >
                      {block.published ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      onClick={() => moveBlock(block.id, 'up')}
                      disabled={index === 0}
                      className="p-1.5 rounded bg-black/5 hover:bg-black/10 disabled:opacity-30"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      onClick={() => moveBlock(block.id, 'down')}
                      disabled={index === blocks.length - 1}
                      className="p-1.5 rounded bg-black/5 hover:bg-black/10 disabled:opacity-30"
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      onClick={() => setEditingBlock(block)}
                      className="p-1.5 rounded bg-blue-100 text-blue-600"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => deleteBlock(block.id)}
                      className="p-1.5 rounded bg-red-100 text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
                
                {/* Block content */}
                <div className={!block.published && editing ? 'opacity-50 border-2 border-dashed border-yellow-400 rounded-xl p-4' : ''}>
                  <BlockRenderer 
                    block={block} 
                    onReact={(type) => addReaction(block.id, type)}
                    onComment={() => {
                      setShowCommentModal(block.id)
                      loadComments(block.id)
                    }}
                  />
                </div>
              </div>
            ))}
            
            {/* Add block button */}
            {editing && (
              <button
                onClick={() => setShowBlockPicker(true)}
                className="w-full py-8 border-2 border-dashed border-black/20 rounded-xl text-black/40 hover:border-black/40 hover:text-black/60 transition flex items-center justify-center gap-2"
              >
                <Plus size={20} />
                Add Block
              </button>
            )}
          </div>
        )}
      </div>
      
      {/* Block type picker modal */}
      {showBlockPicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Add Block</h2>
              <button onClick={() => setShowBlockPicker(false)} className="p-1 hover:bg-black/5 rounded">
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {BLOCK_TYPES.map(({ type, label, icon: Icon, description }) => (
                <button
                  key={type}
                  onClick={() => addBlock(type)}
                  className="p-4 text-left rounded-xl border border-black/10 hover:border-[var(--avenize-primary)] hover:bg-[var(--avenize-primary)]/5 transition"
                >
                  <Icon size={20} className="text-[var(--avenize-primary)] mb-2" />
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-black/50">{description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Block editor modal */}
      {editingBlock && (
        <BlockEditor
          block={editingBlock}
          onSave={updateBlock}
          onClose={() => setEditingBlock(null)}
        />
      )}
      
      {/* Comments modal */}
      {showCommentModal && (
        <CommentsModal
          blockId={showCommentModal}
          comments={comments[showCommentModal] || []}
          newComment={newComment}
          onNewCommentChange={setNewComment}
          onAddComment={() => addComment(showCommentModal)}
          onClose={() => setShowCommentModal(null)}
        />
      )}
    </div>
  )
}

// Block renderer component
function BlockRenderer({ block, onReact, onComment }: { block: HomeBlock; onReact: (type: string) => void; onComment: () => void }) {
  const content = block.content as Record<string, any>
  
  switch (block.block_type) {
    case 'hero':
      return (
        <div 
          className="rounded-2xl overflow-hidden relative h-64 md:h-80"
          style={{ 
            background: content.background_image 
              ? `url(${content.background_image}) center/cover` 
              : `linear-gradient(135deg, var(--avenize-primary), var(--avenize-accent))`
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-8 text-white">
            <h2 className="text-3xl font-bold mb-2">{block.title || 'Welcome'}</h2>
            {content.subtitle && <p className="text-lg opacity-90 mb-4">{content.subtitle}</p>}
            {content.cta_text && (
              <a 
                href={content.cta_link || '#'} 
                className="inline-block px-6 py-2 bg-white text-[var(--avenize-primary)] rounded-lg font-medium hover:bg-white/90 transition"
              >
                {content.cta_text}
              </a>
            )}
          </div>
        </div>
      )
      
    case 'announcement':
      const priorityColors: Record<string, string> = {
        normal: 'border-l-4 border-blue-500',
        important: 'border-l-4 border-yellow-500',
        urgent: 'border-l-4 border-red-500',
      }
      return (
        <div className={`bg-white rounded-xl p-6 shadow-sm ${priorityColors[content.priority || 'normal']}`}>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold mb-2">{block.title}</h3>
              <p className="text-black/70 whitespace-pre-wrap">{content.body}</p>
              {content.author && (
                <p className="text-sm text-black/50 mt-3">— {content.author}</p>
              )}
            </div>
            {content.priority === 'urgent' && (
              <span className="px-2 py-1 bg-red-100 text-red-600 text-xs font-medium rounded">
                Urgent
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-black/5">
            <div className="flex items-center gap-2">
              {REACTION_TYPES.slice(0, 3).map(({ type, icon: Icon, label }) => (
                <button
                  key={type}
                  onClick={() => onReact(type)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-sm transition ${
                    block.user_reaction === type 
                      ? 'bg-[var(--avenize-primary)] text-white' 
                      : 'bg-black/5 hover:bg-black/10'
                  }`}
                >
                  <Icon size={14} />
                  {block.reaction_count || 0}
                </button>
              ))}
            </div>
            <button
              onClick={onComment}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-sm bg-black/5 hover:bg-black/10 transition"
            >
              <MessageCircle size={14} />
              {block.comment_count || 0}
            </button>
          </div>
        </div>
      )
      
    case 'team_spotlight':
      return (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Award className="text-yellow-500" size={20} />
            <h3 className="text-lg font-semibold">{block.title || 'Team Spotlight'}</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[var(--avenize-primary)] flex items-center justify-center text-white text-xl font-bold">
              {content.description?.[0] || '?'}
            </div>
            <div>
              <p className="font-medium">{content.description || 'Featured team member'}</p>
              {content.staff_ids?.length > 0 && (
                <p className="text-sm text-black/50">{content.staff_ids.length} team member(s) featured</p>
              )}
            </div>
          </div>
        </div>
      )
      
    case 'metrics':
      return (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">{block.title || 'Key Metrics'}</h3>
          <div className="grid grid-cols-3 gap-4">
            {(content.items || []).map((item: any, i: number) => (
              <div key={i} className="text-center">
                <p className="text-2xl font-bold text-[var(--avenize-primary)]">{item.value}</p>
                <p className="text-sm text-black/60">{item.label}</p>
                {item.change && (
                  <span className={`text-xs ${item.change.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
                    {item.change}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )
      
    case 'quote':
      return (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <Quote size={32} className="mx-auto text-[var(--avenize-accent)] mb-4" />
          <p className="text-xl italic text-black/80 mb-4">"{content.text}"</p>
          {content.author && (
            <div>
              <p className="font-medium">— {content.author}</p>
              {content.role && <p className="text-sm text-black/50">{content.role}</p>}
            </div>
          )}
        </div>
      )
      
    case 'cta':
      return (
        <div className="bg-gradient-to-r from-[var(--avenize-primary)] to-[var(--avenize-accent)] rounded-xl p-8 text-center text-white">
          <h3 className="text-xl font-semibold mb-2">{block.title}</h3>
          <a 
            href={content.link || '#'}
            className={`inline-block px-6 py-3 rounded-lg font-medium transition ${
              content.style === 'secondary' 
                ? 'bg-white text-[var(--avenize-primary)] hover:bg-white/90' 
                : 'bg-white/20 hover:bg-white/30 backdrop-blur'
            }`}
          >
            {content.text || 'Learn More'}
          </a>
        </div>
      )
      
    case 'text':
      return (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-3">{block.title}</h3>
          <p className="text-black/70 whitespace-pre-wrap">{content.body}</p>
        </div>
      )
      
    case 'gallery':
      return (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">{block.title || 'Gallery'}</h3>
          <div className={`grid gap-4 ${content.layout === 'carousel' ? 'grid-cols-1' : 'grid-cols-3'}`}>
            {(content.images || []).map((img: any, i: number) => (
              <div key={i} className="aspect-square bg-black/5 rounded-lg flex items-center justify-center">
                {img.url ? (
                  <img src={img.url} alt={img.caption} className="w-full h-full object-cover rounded-lg" />
                ) : (
                  <Image size={32} className="text-black/20" />
                )}
              </div>
            ))}
          </div>
        </div>
      )
      
    default:
      return (
        <div className="bg-black/5 rounded-xl p-8 text-center text-black/40">
          Unknown block type: {block.block_type}
        </div>
      )
  }
}

// Block editor component
function BlockEditor({ block, onSave, onClose }: { block: HomeBlock; onSave: (b: HomeBlock) => void; onClose: () => void }) {
  const [title, setTitle] = useState(block.title || '')
  const [content, setContent] = useState(block.content as Record<string, any>)
  
  const handleSave = () => {
    onSave({ ...block, title, content })
  }
  
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Edit {BLOCK_TYPES.find(t => t.type === block.block_type)?.label}</h2>
          <button onClick={onClose} className="p-1 hover:bg-black/5 rounded">
            <X size={20} />
          </button>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-black/10 rounded-lg"
              placeholder="Block title..."
            />
          </div>
          
          {block.block_type === 'announcement' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Body</label>
                <textarea
                  value={content.body || ''}
                  onChange={(e) => setContent({ ...content, body: e.target.value })}
                  className="w-full px-3 py-2 border border-black/10 rounded-lg h-32"
                  placeholder="Announcement text..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Author</label>
                <input
                  type="text"
                  value={content.author || ''}
                  onChange={(e) => setContent({ ...content, author: e.target.value })}
                  className="w-full px-3 py-2 border border-black/10 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Priority</label>
                <select
                  value={content.priority || 'normal'}
                  onChange={(e) => setContent({ ...content, priority: e.target.value })}
                  className="w-full px-3 py-2 border border-black/10 rounded-lg"
                >
                  <option value="normal">Normal</option>
                  <option value="important">Important</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </>
          )}
          
          {block.block_type === 'hero' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Subtitle</label>
                <input
                  type="text"
                  value={content.subtitle || ''}
                  onChange={(e) => setContent({ ...content, subtitle: e.target.value })}
                  className="w-full px-3 py-2 border border-black/10 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Button Text</label>
                <input
                  type="text"
                  value={content.cta_text || ''}
                  onChange={(e) => setContent({ ...content, cta_text: e.target.value })}
                  className="w-full px-3 py-2 border border-black/10 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Button Link</label>
                <input
                  type="text"
                  value={content.cta_link || ''}
                  onChange={(e) => setContent({ ...content, cta_link: e.target.value })}
                  className="w-full px-3 py-2 border border-black/10 rounded-lg"
                  placeholder="/app/about"
                />
              </div>
            </>
          )}
          
          {block.block_type === 'metrics' && (
            <div>
              <label className="block text-sm font-medium mb-1">Metrics (JSON)</label>
              <textarea
                value={JSON.stringify(content.items || [], null, 2)}
                onChange={(e) => {
                  try {
                    setContent({ ...content, items: JSON.parse(e.target.value) })
                  } catch {}
                }}
                className="w-full px-3 py-2 border border-black/10 rounded-lg h-32 font-mono text-sm"
              />
            </div>
          )}
          
          {block.block_type === 'text' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Content</label>
                <textarea
                  value={content.body || ''}
                  onChange={(e) => setContent({ ...content, body: e.target.value })}
                  className="w-full px-3 py-2 border border-black/10 rounded-lg h-32"
                />
              </div>
            </>
          )}
          
          {block.block_type === 'quote' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Quote</label>
                <textarea
                  value={content.text || ''}
                  onChange={(e) => setContent({ ...content, text: e.target.value })}
                  className="w-full px-3 py-2 border border-black/10 rounded-lg h-24"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Author</label>
                <input
                  type="text"
                  value={content.author || ''}
                  onChange={(e) => setContent({ ...content, author: e.target.value })}
                  className="w-full px-3 py-2 border border-black/10 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Role</label>
                <input
                  type="text"
                  value={content.role || ''}
                  onChange={(e) => setContent({ ...content, role: e.target.value })}
                  className="w-full px-3 py-2 border border-black/10 rounded-lg"
                />
              </div>
            </>
          )}
          
          {block.block_type === 'cta' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Button Text</label>
                <input
                  type="text"
                  value={content.text || ''}
                  onChange={(e) => setContent({ ...content, text: e.target.value })}
                  className="w-full px-3 py-2 border border-black/10 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Link</label>
                <input
                  type="text"
                  value={content.link || ''}
                  onChange={(e) => setContent({ ...content, link: e.target.value })}
                  className="w-full px-3 py-2 border border-black/10 rounded-lg"
                  placeholder="/app/..."
                />
              </div>
            </>
          )}
        </div>
        
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-black/10 rounded-lg hover:bg-black/5 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-[var(--avenize-primary)] text-white rounded-lg hover:opacity-90 transition flex items-center justify-center gap-2"
          >
            <Save size={18} />
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// Comments modal
function CommentsModal({ 
  blockId, 
  comments, 
  newComment, 
  onNewCommentChange, 
  onAddComment, 
  onClose 
}: { 
  blockId: string
  comments: Comment[]
  newComment: string
  onNewCommentChange: (v: string) => void
  onAddComment: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-w-md w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-black/5">
          <h2 className="font-semibold">Comments</h2>
          <button onClick={onClose} className="p-1 hover:bg-black/5 rounded">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {comments.length === 0 ? (
            <p className="text-center text-black/40 py-8">No comments yet</p>
          ) : (
            comments.map(comment => (
              <div key={comment.id} className="bg-black/5 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">{(comment as any).staff?.name || comment.staff_name || 'User'}</span>
                  <span className="text-xs text-black/40">
                    {new Date(comment.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm">{comment.content}</p>
              </div>
            ))
          )}
        </div>
        
        <div className="p-4 border-t border-black/5">
          <div className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => onNewCommentChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onAddComment()}
              placeholder="Add a comment..."
              className="flex-1 px-3 py-2 border border-black/10 rounded-lg text-sm"
            />
            <button
              onClick={onAddComment}
              disabled={!newComment.trim()}
              className="px-4 py-2 bg-[var(--avenize-primary)] text-white rounded-lg disabled:opacity-50"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function getDefaultContent(type: BlockType): Record<string, any> {
  switch (type) {
    case 'hero':
      return { subtitle: '', cta_text: '', cta_link: '' }
    case 'announcement':
      return { body: '', author: '', priority: 'normal' }
    case 'team_spotlight':
      return { staff_ids: [], description: '' }
    case 'metrics':
      return { items: [{ label: '', value: '', change: '' }] }
    case 'gallery':
      return { images: [], layout: 'grid' }
    case 'quote':
      return { text: '', author: '', role: '' }
    case 'cta':
      return { text: 'Learn More', link: '', style: 'primary' }
    case 'text':
      return { body: '' }
    default:
      return {}
  }
}
