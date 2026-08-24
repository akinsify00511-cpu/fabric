import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { joinMeeting, leaveMeeting, endMeeting as endMeetingRpc } from '../lib/businessOS'
import { useToast } from '../components/Toast'
import { ArrowLeft, Camera, CameraOff, Mic, MicOff, MonitorUp, PhoneOff, Paperclip, Send, Square, MessageSquare, Users, Loader2 } from 'lucide-react'

type Participant = { user_id:string; name:string; staff_id?:string }
type Capture = { id:string; capture_type:string; title:string|null; body:string|null; storage_path:string|null; mime_type:string|null; size_bytes:number|null; created_at:string }

type Signal = { to:string; from:string; kind:'offer'|'answer'|'candidate'; description?:RTCSessionDescriptionInit; candidate?:RTCIceCandidateInit }

const formatDuration=(seconds:number)=>{const m=Math.floor(seconds/60);const s=seconds%60;return `${m}:${s.toString().padStart(2,'0')}`}

export default function MeetingCapture(){
 const [params]=useSearchParams(); const meetingId=params.get('meeting'); const {staff,session}=useAuth(); const {showToast}=useToast()
 const [meeting,setMeeting]=useState<any|null>(null); const [captures,setCaptures]=useState<Capture[]>([]); const [participants,setParticipants]=useState<Participant[]>([]); const [loading,setLoading]=useState(true)
 const [micOn,setMicOn]=useState(true); const [cameraOn,setCameraOn]=useState(true); const [sharing,setSharing]=useState(false); const [recording,setRecording]=useState(false); const [recordingSeconds,setRecordingSeconds]=useState(0)
 const [note,setNote]=useState(''); const [voiceText,setVoiceText]=useState(''); const [voiceListening,setVoiceListening]=useState(false); const [remoteStreams,setRemoteStreams]=useState<Record<string,MediaStream>>({})
 const participantIdRef=useRef<string|null>(null)
 const localVideoRef=useRef<HTMLVideoElement|null>(null); const localStreamRef=useRef<MediaStream|null>(null); const screenStreamRef=useRef<MediaStream|null>(null); const channelRef=useRef<any>(null); const peersRef=useRef<Record<string,RTCPeerConnection>>({}); const candidateQueueRef=useRef<Record<string,RTCIceCandidateInit[]>>({}); const remoteVideoRefs=useRef<Record<string,HTMLVideoElement|null>>({}); const recorderRef=useRef<MediaRecorder|null>(null); const recordChunks=useRef<Blob[]>([]); const recognitionRef=useRef<any>(null); const recordTimerRef=useRef<ReturnType<typeof setInterval>|null>(null)

 const load=useCallback(async()=>{
  if(!meetingId||!staff?.business_id){setLoading(false);return}
  const [{data:m,error:me},{data:c,error:ce}]=await Promise.all([
   supabase.from('meetings').select('*').eq('id',meetingId).eq('business_id',staff.business_id).single(),
   supabase.from('meeting_captures').select('*').eq('meeting_id',meetingId).eq('business_id',staff.business_id).order('created_at',{ascending:false})
  ])
  if(me){showToast('Meeting could not be loaded','error');setLoading(false);return}
  if(ce)console.error(ce)
  setMeeting(m);setCaptures(c||[]);setLoading(false)
 },[meetingId,staff?.business_id,showToast])
 useEffect(()=>{void load()},[load])

 const sendSignal=useCallback(async(payload:Signal)=>{const ch=channelRef.current;if(ch)await ch.send({type:'broadcast',event:'signal',payload})},[])

 const closePeer=useCallback((userId:string)=>{peersRef.current[userId]?.close();delete peersRef.current[userId];setRemoteStreams(v=>{const n={...v};delete n[userId];return n})},[])

 const makePeer=useCallback((remote:Participant)=>{
  if(peersRef.current[remote.user_id])return peersRef.current[remote.user_id]
  const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]})
  peersRef.current[remote.user_id]=pc
  localStreamRef.current?.getTracks().forEach(track=>pc.addTrack(track,localStreamRef.current!))
  pc.ontrack=e=>{const stream=e.streams[0];if(stream)setRemoteStreams(v=>({...v,[remote.user_id]:stream}))}
  pc.onicecandidate=e=>{if(e.candidate&&staff?.user_id)void sendSignal({to:remote.user_id,from:staff.user_id,kind:'candidate',candidate:e.candidate.toJSON()})}
  pc.onconnectionstatechange=()=>{if(['failed','closed','disconnected'].includes(pc.connectionState))closePeer(remote.user_id)}
  return pc
 },[closePeer,sendSignal,staff?.user_id])

 const negotiate=useCallback(async(remote:Participant)=>{const pc=makePeer(remote);if(!pc||!staff?.user_id)return;const offer=await pc.createOffer();await pc.setLocalDescription(offer);await sendSignal({to:remote.user_id,from:staff.user_id,kind:'offer',description:pc.localDescription||offer})},[makePeer,sendSignal,staff?.user_id])

 const handleSignal=useCallback(async(sig:Signal)=>{
  if(!staff?.user_id||sig.to!==staff.user_id)return
  const remote=participants.find(p=>p.user_id===sig.from)||{user_id:sig.from,name:'Participant'}
  const pc=makePeer(remote)
  if(sig.kind==='offer'&&sig.description){await pc.setRemoteDescription(sig.description);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await sendSignal({to:sig.from,from:staff.user_id,kind:'answer',description:pc.localDescription||answer});const queued=candidateQueueRef.current[sig.from]||[];for(const c of queued)await pc.addIceCandidate(c);delete candidateQueueRef.current[sig.from]}
  if(sig.kind==='answer'&&sig.description&&pc.signalingState==='have-local-offer')await pc.setRemoteDescription(sig.description)
  if(sig.kind==='candidate'&&sig.candidate){if(pc.remoteDescription)await pc.addIceCandidate(sig.candidate);else(candidateQueueRef.current[sig.from]??=[]).push(sig.candidate)}
 },[makePeer,participants,sendSignal,staff?.user_id])

 useEffect(()=>{
  if(!meetingId||!staff?.user_id||!meeting)return
  const myId=staff.user_id
  let mounted=true
  const ch=supabase.channel(`meeting:${meetingId}`,{config:{private:true,presence:{enabled:true,key:myId}}})
  channelRef.current=ch
  ch.on('broadcast',{event:'signal'},({payload}:{payload:Signal})=>void handleSignal(payload))
   .on('presence',{event:'sync'},()=>{
    const state=ch.presenceState();const list:Participant[]=[]
    Object.values(state).forEach((entries:any)=>entries.forEach((e:any)=>{if(e.user_id!==myId&&!list.some(p=>p.user_id===e.user_id))list.push(e)}))
    setParticipants(list)
    list.filter(p=>myId<p.user_id).forEach(p=>void negotiate(p))
   })
   .on('presence',{event:'join'},()=>{})
   .on('presence',{event:'leave'},({key}:{key:string})=>closePeer(key))
  ch.subscribe(async status=>{if(status==='SUBSCRIBED'){await ch.track({user_id:staff.user_id,name:staff.full_name||staff.name||staff.email||'Participant',staff_id:staff.id});
    // Canonical lifecycle: join (writes participant + evidence). Falls back to a
    // direct status update only if the lifecycle RPC isn't deployed yet (best-effort).
    const j=await joinMeeting(meetingId);if(j?.participantId){participantIdRef.current=j.participantId}
    else{const { error: statusErr } = await supabase.from('meetings').update({status:'in_progress'}).eq('id',meetingId);if(statusErr)console.error(statusErr)}}})
  return()=>{mounted=false;Object.keys(peersRef.current).forEach(closePeer);void ch.untrack();void supabase.removeChannel(ch);channelRef.current=null;if(meetingId&&participantIdRef.current)void leaveMeeting(meetingId,participantIdRef.current);screenStreamRef.current?.getTracks().forEach(t=>t.stop());if(localStreamRef.current)localStreamRef.current.getTracks().forEach(t=>t.stop());if(recordTimerRef.current)clearInterval(recordTimerRef.current);if(recognitionRef.current)recognitionRef.current.stop();if(!mounted)return}
 },[closePeer,handleSignal,meeting,meetingId,negotiate,staff?.email,staff?.full_name,staff?.id,staff?.name,staff?.user_id])

 useEffect(()=>{Object.entries(remoteStreams).forEach(([id,stream])=>{const el=remoteVideoRefs.current[id];if(el&&el.srcObject!==stream)el.srcObject=stream})},[remoteStreams])

 const startMedia=async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:true});localStreamRef.current=stream;if(localVideoRef.current)localVideoRef.current.srcObject=stream;setMicOn(true);setCameraOn(true);Object.values(peersRef.current).forEach(pc=>stream.getTracks().forEach(track=>{const sender=pc.getSenders().find(s=>s.track?.kind===track.kind);if(sender)sender.replaceTrack(track)}));}catch(e){console.error(e);showToast('Camera and microphone permission is required for an Avenize meeting','error')}}
 useEffect(()=>{if(meeting)void startMedia();return()=>{localStreamRef.current?.getTracks().forEach(t=>t.stop())}},[meeting])

 const toggleMic=()=>{const next=!micOn;localStreamRef.current?.getAudioTracks().forEach(t=>t.enabled=next);setMicOn(next)}
 const toggleCamera=()=>{const next=!cameraOn;localStreamRef.current?.getVideoTracks().forEach(t=>t.enabled=next);setCameraOn(next)}
 const toggleScreen=async()=>{if(sharing){screenStreamRef.current?.getTracks().forEach(t=>t.stop());screenStreamRef.current=null;setSharing(false);const cam=localStreamRef.current?.getVideoTracks()[0];Object.values(peersRef.current).forEach(pc=>{const s=pc.getSenders().find(x=>x.track?.kind==='video');if(s&&cam)void s.replaceTrack(cam)});return}try{const screen=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});screenStreamRef.current=screen;const track=screen.getVideoTracks()[0];Object.values(peersRef.current).forEach(pc=>{const s=pc.getSenders().find(x=>x.track?.kind==='video');if(s)void s.replaceTrack(track)});if(localVideoRef.current)localVideoRef.current.srcObject=screen;track.onended=()=>void toggleScreen();setSharing(true)}catch(e){console.error(e)}}

 const saveCapture=async(type:'text'|'voice',body:string)=>{if(!body.trim()||!meeting||!staff?.business_id||!staff.id)return;const {data,error}=await supabase.from('meeting_captures').insert({meeting_id:meeting.id,business_id:staff.business_id,staff_id:staff.id,capture_type:type,title:type==='voice'?'Voice capture':'Meeting note',body:body.trim()}).select().single();if(error){showToast('Could not save capture','error');return}setCaptures(v=>[data,...v]);showToast('Capture saved to this meeting','success')}

 const startVoice=()=>{const W=window as any;const SR=W.SpeechRecognition||W.webkitSpeechRecognition;if(!SR){showToast('Voice capture is not supported by this browser','error');return}const r=new SR();r.continuous=true;r.interimResults=true;r.lang=navigator.language||'en-NG';r.onresult=(e:any)=>{let text='';for(let i=e.resultIndex;i<e.results.length;i++)text+=e.results[i][0].transcript;setVoiceText(text)};r.onerror=()=>setVoiceListening(false);r.onend=()=>setVoiceListening(false);recognitionRef.current=r;r.start();setVoiceListening(true)}
 const stopVoice=()=>{recognitionRef.current?.stop();setVoiceListening(false);if(voiceText.trim()){void saveCapture('voice',voiceText);setVoiceText('')}}

 const addAttachment=async(file:File)=>{if(!meeting||!staff?.business_id)return;if(file.size>10*1024*1024){showToast('Attachment must be 10 MB or smaller','error');return}const path=`${meeting.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const {error:up}=await supabase.storage.from('meeting-captures').upload(path,file,{contentType:file.type||'application/octet-stream'});if(up){showToast('Attachment upload failed','error');return}const {data,error}=await supabase.from('meeting_captures').insert({meeting_id:meeting.id,business_id:staff.business_id,staff_id:staff.id,capture_type:file.type.startsWith('image/')?'image':'file',title:file.name,storage_path:path,mime_type:file.type,size_bytes:file.size}).select().single();if(error){showToast('Could not save attachment','error');return}setCaptures(v=>[data,...v]);showToast('Attachment captured in meeting','success')}

 const startRecording=()=>{if(!localStreamRef.current){showToast('Camera/microphone is not ready','error');return}const mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')?'video/webm;codecs=vp9,opus':'video/webm';const r=new MediaRecorder(localStreamRef.current,{mimeType:mime});recordChunks.current=[];r.ondataavailable=e=>{if(e.data.size)recordChunks.current.push(e.data)};r.onstop=async()=>{if(!meeting||!staff?.business_id||!staff.id)return;const blob=new Blob(recordChunks.current,{type:mime});const path=`${meeting.id}/${crypto.randomUUID()}-meeting-recording.webm`;const {error:up}=await supabase.storage.from('meeting-captures').upload(path,blob,{contentType:mime});if(up){showToast('Recording upload failed','error');return}const {data,error}=await supabase.from('meeting_captures').insert({meeting_id:meeting.id,business_id:staff.business_id,staff_id:staff.id,capture_type:'recording',title:'Meeting recording',storage_path:path,mime_type:mime,size_bytes:blob.size,duration_seconds:recordingSeconds}).select().single();if(!error)setCaptures(v=>[data,...v]);showToast(error?'Recording saved locally but capture record failed':'Meeting recording captured','success')};r.start(1000);recorderRef.current=r;setRecording(true);setRecordingSeconds(0);recordTimerRef.current=setInterval(()=>setRecordingSeconds(v=>v+1),1000)}
 const stopRecording=()=>{recorderRef.current?.stop();setRecording(false);if(recordTimerRef.current)clearInterval(recordTimerRef.current)}
 const endMeeting=async()=>{if(meetingId){
   if(participantIdRef.current)await leaveMeeting(meetingId,participantIdRef.current)
   const ok=await endMeetingRpc(meetingId)
   if(!ok){const { error } = await supabase.from('meetings').update({status:'completed'}).eq('id',meetingId);if(error)console.error(error)}
 };window.location.assign('/app/meetings')}

 if(loading)return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[var(--av-primary)]"/></div>
 if(!meeting)return <div className="min-h-screen flex items-center justify-center p-6"><div className="text-center"><h1 className="text-xl font-semibold">Meeting not found</h1><Link to="/app/meetings" className="text-[var(--av-primary)] mt-3 inline-block">Back to Meetings</Link></div></div>

 return <div className="min-h-screen bg-[#111827] text-white flex flex-col"><header className="h-16 px-4 md:px-6 flex items-center justify-between border-b border-white/10"><div><p className="text-xs text-white/50">Avenize Meeting</p><h1 className="font-semibold truncate max-w-[45vw]">{meeting.title}</h1></div><div className="flex items-center gap-3"><span className="hidden md:inline text-xs text-white/60">{participants.length+1} participant{participants.length===0?'':'s'}</span>{recording&&<span className="text-xs text-red-300">● REC {formatDuration(recordingSeconds)}</span>}<button onClick={endMeeting} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium"><PhoneOff size={16}/> End</button></div></header>
 <main className="flex-1 grid lg:grid-cols-[1fr_360px] min-h-0"><section className="p-3 md:p-5 flex flex-col min-h-0"><div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-3 min-h-[420px]"> <div className="relative rounded-2xl overflow-hidden bg-black col-span-2"><video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover"/><div className="absolute bottom-3 left-3 rounded-lg bg-black/50 px-2 py-1 text-xs">You</div></div>{Object.entries(remoteStreams).map(([id,stream])=><div key={id} className="relative rounded-2xl overflow-hidden bg-black"><video ref={el=>{remoteVideoRefs.current[id]=el;if(el)el.srcObject=stream}} autoPlay playsInline className="w-full h-full object-cover"/><div className="absolute bottom-3 left-3 rounded-lg bg-black/50 px-2 py-1 text-xs">{participants.find(p=>p.user_id===id)?.name||'Participant'}</div></div>)}{participants.length===0&&<div className="rounded-2xl border border-dashed border-white/10 flex items-center justify-center text-white/45">Waiting for participants to join…</div>}</div><div className="mt-4 flex items-center justify-center gap-2 flex-wrap"><button onClick={toggleMic} className={`p-3 rounded-full ${micOn?'bg-white/10':'bg-red-600'}`}>{micOn?<Mic size={20}/>:<MicOff size={20}/>}</button><button onClick={toggleCamera} className={`p-3 rounded-full ${cameraOn?'bg-white/10':'bg-red-600'}`}>{cameraOn?<Camera size={20}/>:<CameraOff size={20}/>}</button><button onClick={toggleScreen} className={`p-3 rounded-full ${sharing?'bg-[var(--av-primary)]':'bg-white/10'}`}><MonitorUp size={20}/></button><button onClick={recording?stopRecording:startRecording} className={`inline-flex items-center gap-2 rounded-full px-4 py-3 ${recording?'bg-red-600':'bg-white/10'}`}>{recording?<><Square size={16}/> Stop recording</>:<><span className="w-3 h-3 rounded-sm bg-red-500"/> Record</>}</button></div></section>
 <aside className="bg-white text-black border-l border-black/10 flex flex-col min-h-0"><div className="p-4 border-b border-black/5"><h2 className="font-semibold flex items-center gap-2"><MessageSquare size={18}/> Capture</h2><p className="text-xs text-black/50 mt-1">Everything captured here stays attached to this meeting.</p></div><div className="p-4 border-b border-black/5 space-y-2"><textarea value={note} onChange={e=>setNote(e.target.value)} rows={3} className="w-full rounded-xl border border-black/10 p-3 text-sm" placeholder="Capture a decision, action, customer request or note…"/><button onClick={()=>{void saveCapture('text',note);setNote('')}} disabled={!note.trim()} className="w-full rounded-xl bg-[var(--av-primary)] text-white py-2.5 text-sm font-semibold disabled:opacity-40"><Send size={15} className="inline mr-2"/>Save capture</button><div className="grid grid-cols-2 gap-2"><button onClick={voiceListening?stopVoice:startVoice} className={`rounded-xl border border-black/10 py-2 text-sm ${voiceListening?'bg-red-50 text-red-600':''}`}><Mic size={15} className="inline mr-1"/>{voiceListening?'Stop voice':'Voice capture'}</button><label className="rounded-xl border border-black/10 py-2 text-sm text-center cursor-pointer"><Paperclip size={15} className="inline mr-1"/>Attach<input type="file" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)void addAttachment(f);e.currentTarget.value=''}}/></label></div>{voiceText&&<div className="rounded-xl bg-black/[0.03] p-3 text-xs text-black/60">{voiceText}</div>}</div><div className="flex-1 overflow-y-auto p-4"><div className="flex items-center justify-between mb-3"><h3 className="text-sm font-semibold">Meeting captures</h3><span className="text-xs text-black/40">{captures.length}</span></div>{captures.length===0?<p className="text-xs text-black/40">No captures yet.</p>:<div className="space-y-2">{captures.map(c=><div key={c.id} className="rounded-xl border border-black/5 bg-[#F8F9FA] p-3"><div className="flex items-center justify-between gap-2"><span className="text-[10px] uppercase tracking-wide text-[var(--av-primary)]">{c.capture_type}</span><span className="text-[10px] text-black/35">{new Date(c.created_at).toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'})}</span></div><p className="text-sm font-medium mt-1">{c.title||'Capture'}</p>{c.body&&<p className="text-xs text-black/60 mt-1 whitespace-pre-wrap">{c.body}</p>}{c.storage_path&&<p className="text-[10px] text-black/40 mt-1">Attachment stored securely</p>}</div>)}</div>}</div></aside></main></div>
}
