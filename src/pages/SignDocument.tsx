import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FileSignature, Pen, Type, Upload, Check, X, Clock, Shield } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface SignerInfo {
  id: string
  name: string
  email: string
  order_index: number
  status: string
  viewed_at: string | null
  signed_at: string | null
  signature_image_url: string | null
}

interface RequestInfo {
  id: string
  title: string
  description: string | null
  document_name: string
  document_url: string
  status: string
  message: string | null
  expires_at: string | null
  created_at: string
}

interface AllSigner {
  id: string
  name: string
  email: string
  order_index: number
  status: string
  signed_at: string | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Awaiting your signature', color: 'text-[#FBBC05]' },
  viewed: { label: 'Awaiting your signature', color: 'text-[#FBBC05]' },
  signed: { label: 'Signed', color: 'text-[#34A853]' },
  declined: { label: 'Declined', color: 'text-[#EA4335]' },
  completed: { label: 'Completed', color: 'text-[#34A853]' },
}

type SignatureMode = 'draw' | 'type' | 'upload'

export default function SignDocument() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [signer, setSigner] = useState<SignerInfo | null>(null)
  const [request, setRequest] = useState<RequestInfo | null>(null)
  const [allSigners, setAllSigners] = useState<AllSigner[]>([])
  const [error, setError] = useState<string | null>(null)

  const [mode, setMode] = useState<SignatureMode>('draw')
  const [typedName, setTypedName] = useState('')
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const hasDrawnRef = useRef(false)

  const loadData = useCallback(async () => {
    if (!token) return
    try {
      const { data, error: rpcErr } = await supabase.rpc('get_signature_request_by_token', {
        p_token: token,
      })
      if (rpcErr) throw rpcErr

      if (data?.error === 'not_found' || !data) {
        setError('This signing link is invalid or has expired.')
        setLoading(false)
        return
      }

      setSigner(data.signer)
      setRequest(data.request)
      setAllSigners(data.all_signers || [])

      const s = data.signer as SignerInfo
      const r = data.request as RequestInfo
      if (r.status === 'expired' || (r.expires_at && new Date(r.expires_at) < new Date())) {
        setError('This document has expired and can no longer be signed.')
      } else if (s.status === 'signed') {
        setDone(true)
      } else if (s.status === 'declined') {
        setError('You have declined to sign this document.')
      } else if (s.status === 'pending' || s.status === 'viewed') {
        if (s.status === 'pending') {
          supabase.rpc('mark_signature_viewed', { p_token: token }).then(() => {
            setSigner(prev => prev ? { ...prev, status: 'viewed', viewed_at: new Date().toISOString() } : prev)
          })
        }
      }
    } catch (err) {
      console.error('Failed to load signing request:', err)
      setError('Could not load the document. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ----- Draw -----
  const getCanvasPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    drawingRef.current = true
    lastPointRef.current = getCanvasPos(e)
  }

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    e.preventDefault()
    const ctx = canvasRef.current!.getContext('2d')!
    const pos = getCanvasPos(e)
    ctx.strokeStyle = '#202124'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(lastPointRef.current!.x, lastPointRef.current!.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPointRef.current = pos
    hasDrawnRef.current = true
  }

  const endDraw = () => {
    drawingRef.current = false
    lastPointRef.current = null
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    hasDrawnRef.current = false
  }

  // ----- Upload -----
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !signer) return
    setSubmitting(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `signatures/${signer.id}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('signatures').upload(path, file, {
        cacheControl: '3600',
        upsert: true,
      })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('signatures').getPublicUrl(path)
      setUploadedUrl(urlData.publicUrl)
    } catch (err) {
      console.error('Upload failed:', err)
      setError('Could not upload the signature image.')
    } finally {
      setSubmitting(false)
    }
  }

  // ----- Submit -----
  const getSignatureUrl = async (): Promise<string | null> => {
    if (mode === 'draw') {
      if (!hasDrawnRef.current) return null
      return canvasRef.current!.toDataURL('image/png')
    }
    if (mode === 'type') {
      if (!typedName.trim()) return null
      return makeTypedSignature(typedName)
    }
    return uploadedUrl
  }

  const makeTypedSignature = (name: string): string => {
    const canvas = document.createElement('canvas')
    canvas.width = 400
    canvas.height = 160
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#202124'
    ctx.font = 'italic 48px "Segoe Script", "Bradley Hand", cursive'
    ctx.textBaseline = 'middle'
    ctx.fillText(name, 40, canvas.height / 2)
    return canvas.toDataURL('image/png')
  }

  const uploadDataUrl = async (dataUrl: string): Promise<string> => {
    if (!signer) return dataUrl
    // For drawn/typed signatures stored as data URLs, upload to Storage so
    // the record has a persistent, fetchable URL.
    const blob = await (await fetch(dataUrl)).blob()
    const path = `signatures/${signer.id}-${Date.now()}.png`
    const { error: upErr } = await supabase.storage.from('signatures').upload(path, blob, {
      cacheControl: '3600',
      upsert: true,
    })
    if (upErr) {
      console.warn('Storage upload failed, falling back to data URL', upErr)
      return dataUrl
    }
    const { data: urlData } = supabase.storage.from('signatures').getPublicUrl(path)
    return urlData.publicUrl
  }

  const handleSign = async () => {
    if (!token) return
    const sigUrl = await getSignatureUrl()
    if (!sigUrl) {
      setError('Please add your signature before signing.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const storedUrl = sigUrl.startsWith('data:')
        ? await uploadDataUrl(sigUrl)
        : sigUrl

      const { data, error: rpcErr } = await supabase.rpc('record_signature', {
        p_token: token,
        p_signature_image_url: storedUrl,
        p_user_agent: navigator.userAgent,
      })
      if (rpcErr) throw rpcErr
      if (data?.error) {
        setError('This document may have already been signed or is no longer available.')
        return
      }
      setDone(true)
    } catch (err) {
      console.error('Signing failed:', err)
      setError('Could not complete signing. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDecline = async () => {
    if (!token) return
    if (!confirm('Are you sure you want to decline to sign this document?')) return
    setSubmitting(true)
    try {
      const { error: rpcErr } = await supabase.rpc('decline_signature', { p_token: token })
      if (rpcErr) throw rpcErr
      setError('You have declined to sign this document.')
      setSigner(prev => prev ? { ...prev, status: 'declined' } : prev)
    } catch (err) {
      console.error('Decline failed:', err)
      setError('Could not record your decline.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="w-8 h-8 border-2 border-[#4285F4] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error && !signer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] px-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 shadow-sm text-center">
          <FileSignature size={48} className="mx-auto text-[#9AA0A6] mb-4" />
          <h1 className="text-xl font-bold text-[#202124] mb-2">Unable to sign</h1>
          <p className="text-[#5F6368] mb-6">{error}</p>
        </div>
      </div>
    )
  }

  if (!signer || !request) return null

  const isExpired = request.status === 'expired' || (request.expires_at && new Date(request.expires_at) < new Date())
  const signerState = signer.status === 'signed' ? 'signed' : signer.status === 'declined' ? 'declined' : 'pending'

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <header className="bg-white border-b border-[#E8EAED]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <FileSignature size={24} className="text-[#4285F4]" />
          <span className="font-semibold text-[#202124]">Avenize Sign</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {done ? (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <div className="w-16 h-16 rounded-full bg-[#34A853]/10 flex items-center justify-center mx-auto mb-4">
              <Check size={32} className="text-[#34A853]" />
            </div>
            <h1 className="text-2xl font-bold text-[#202124] mb-2">Signature recorded</h1>
            <p className="text-[#5F6368] mb-6">
              Thank you, {signer.name}. Your signature has been recorded for
              "{request.title}".
            </p>
            <div className="bg-[#F8F9FA] rounded-xl p-4 text-left text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-[#5F6368]">Signed at</span>
                <span className="font-medium text-[#202124]">
                  {new Date().toLocaleString('en-NG')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5F6368]">Signer</span>
                <span className="font-medium text-[#202124]">{signer.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5F6368]">Status</span>
                <span className="font-medium text-[#34A853]">Completed</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              {/* Document */}
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="p-6 border-b border-[#E8EAED]">
                  <h1 className="text-xl font-bold text-[#202124]">{request.title}</h1>
                  {request.description && (
                    <p className="text-sm text-[#5F6368] mt-1">{request.description}</p>
                  )}
                  {request.message && (
                    <div className="mt-3 bg-[#F8F9FA] rounded-xl p-3 text-sm text-[#202124]">
                      {request.message}
                    </div>
                  )}
                </div>
                <div className="p-6">
                  <p className="text-sm font-medium text-[#5F6368] mb-2">Document</p>
                  {request.document_url.endsWith('.pdf') ? (
                    <iframe
                      src={request.document_url}
                      title={request.document_name}
                      className="w-full h-[600px] rounded-xl border border-[#E8EAED]"
                    />
                  ) : (
                    <a
                      href={request.document_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-[#F8F9FA] rounded-xl text-[#4285F4] hover:bg-[#F1F3F4] transition"
                    >
                      <FileSignature size={16} />
                      {request.document_name}
                    </a>
                  )}
                </div>
              </div>

              {/* Signature pad */}
              {isExpired ? (
                <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
                  <Clock size={32} className="mx-auto text-[#9AA0A6] mb-2" />
                  <p className="text-[#5F6368]">This document has expired and can no longer be signed.</p>
                </div>
              ) : signerState !== 'pending' ? (
                <div className="bg-white rounded-2xl p-6 shadow-sm">
                  <p className="text-[#5F6368]">
                    Your status: <span className={`font-medium ${STATUS_CONFIG[signerState]?.color}`}>{STATUS_CONFIG[signerState]?.label}</span>
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <Pen size={18} className="text-[#4285F4]" />
                    <h2 className="font-semibold text-[#202124]">Add your signature</h2>
                  </div>

                  <div className="flex gap-2 mb-4">
                    <ModeButton active={mode === 'draw'} onClick={() => setMode('draw')} icon={<Pen size={14} />} label="Draw" />
                    <ModeButton active={mode === 'type'} onClick={() => setMode('type')} icon={<Type size={14} />} label="Type" />
                    <ModeButton active={mode === 'upload'} onClick={() => setMode('upload')} icon={<Upload size={14} />} label="Upload" />
                  </div>

                  {mode === 'draw' && (
                    <div>
                      <canvas
                        ref={canvasRef}
                        width={600}
                        height={200}
                        onPointerDown={startDraw}
                        onPointerMove={draw}
                        onPointerUp={endDraw}
                        onPointerLeave={endDraw}
                        className="w-full bg-white rounded-xl border-2 border-[#DADCE0] touch-none cursor-crosshair"
                      />
                      <button
                        onClick={clearCanvas}
                        className="mt-2 text-sm text-[#5F6368] hover:text-[#202124] transition"
                      >
                        Clear
                      </button>
                    </div>
                  )}

                  {mode === 'type' && (
                    <div>
                      <input
                        type="text"
                        value={typedName}
                        onChange={(e) => setTypedName(e.target.value)}
                        placeholder="Type your full name"
                        className="w-full px-4 py-3 rounded-xl border border-[#DADCE0] focus:ring-2 focus:ring-[#4285F4] transition"
                        style={{ fontFamily: '"Segoe Script", "Bradley Hand", cursive', fontSize: '24px' }}
                      />
                      <p className="text-xs text-[#9AA0A6] mt-2">
                        By typing your name, you confirm this is your legal signature.
                      </p>
                    </div>
                  )}

                  {mode === 'upload' && (
                    <div>
                      <label className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-[#DADCE0] rounded-xl cursor-pointer hover:bg-[#F8F9FA] transition">
                        <Upload size={24} className="text-[#9AA0A6]" />
                        <span className="text-sm text-[#5F6368]">
                          {uploadedUrl ? 'Signature uploaded ✓' : 'Click to upload an image of your signature'}
                        </span>
                        <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
                      </label>
                    </div>
                  )}

                  {error && <p className="mt-3 text-sm text-[#EA4335]">{error}</p>}

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={handleDecline}
                      disabled={submitting}
                      className="px-4 py-2 border border-[#DADCE0] rounded-xl text-[#5F6368] hover:bg-[#F8F9FA] transition disabled:opacity-50"
                    >
                      Decline
                    </button>
                    <button
                      onClick={handleSign}
                      disabled={submitting}
                      className="flex-1 px-4 py-2 bg-[#4285F4] text-white rounded-xl font-medium hover:bg-[#3367D6] transition disabled:opacity-50"
                    >
                      {submitting ? 'Signing…' : 'Sign & Complete'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <aside className="space-y-4">
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <h3 className="font-semibold text-[#202124] mb-3">Signer progress</h3>
                <ol className="space-y-3">
                  {allSigners.map((s) => (
                    <li key={s.id} className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${
                        s.status === 'signed' ? 'bg-[#34A853]/10 text-[#34A853]'
                        : s.status === 'declined' ? 'bg-[#EA4335]/10 text-[#EA4335]'
                        : 'bg-[#F8F9FA] text-[#9AA0A6]'
                      }`}>
                        {s.status === 'signed' ? <Check size={14} /> : s.order_index}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#202124] truncate">{s.name}</p>
                        <p className="text-xs text-[#9AA0A6] capitalize">{s.status}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <div className="flex items-start gap-2">
                  <Shield size={16} className="text-[#34A853] mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-[#5F6368] space-y-1">
                    <p className="font-medium text-[#202124]">Audit trail</p>
                    <p>Your signature, IP address, and timestamp are recorded for legal verification.</p>
                  </div>
                </div>
              </div>

              {request.expires_at && (
                <div className="bg-white rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock size={16} className="text-[#FBBC05]" />
                    <span className="text-[#5F6368]">
                      Expires {new Date(request.expires_at).toLocaleDateString('en-NG')}
                    </span>
                  </div>
                </div>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}

function ModeButton({ active, onClick, icon, label }: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition ${
        active
          ? 'bg-[#4285F4] text-white'
          : 'bg-[#F8F9FA] text-[#5F6368] hover:bg-[#F1F3F4]'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
