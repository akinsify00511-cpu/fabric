import { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useAuth } from '../lib/AuthContext'
import { parseIntent, raiseEvent } from '../lib/businessOS'
import { colors, fontSize, radius, spacing } from '../theme'

type Message = { id: string; role: 'sarah' | 'user'; text: string }

export default function SarahScreen() {
  const { staff } = useAuth()
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'sarah', text: "Hi — I'm Sarah. Tell me what's happening in the business and I'll help you turn it into action." },
  ])

  async function send() {
    const text = input.trim()
    if (!text || !staff || busy) return
    setInput('')
    setMessages((current) => [...current, { id: `${Date.now()}-u`, role: 'user', text }])
    setBusy(true)
    try {
      const result = await parseIntent(text, staff.business_id)
      const confidence = Number(result?.confidence ?? 0)
      const event = result?.event_type || result?.intent || 'business update'
      const entities = Array.isArray(result?.entities) ? result.entities : []
      const entityText = entities.map((e: any) => e.name || e.type).filter(Boolean).slice(0, 2).join(' and ')
      const reply = confidence > 0
        ? `I understand this as ${event}${entityText ? ` involving ${entityText}` : ''}. ${result?.requires_confirmation ? 'I would want your confirmation before changing records.' : 'I can use this as a business event.'}`
        : "I’m not confident enough to change anything from that yet. Try telling me what happened, who or what it affected, and what you want done."
      setMessages((current) => [...current, { id: `${Date.now()}-s`, role: 'sarah', text: reply }])
      if (confidence >= 0.85 && !result?.requires_confirmation) {
        await raiseEvent({
          business_id: staff.business_id,
          event_type: result?.event_type || 'SarahCapture',
          entity_type: entities[0]?.type || 'unknown',
          entity_id: entities[0]?.id,
          payload: { text, understood: result, source: 'mobile-sarah' },
          source: 'mobile-sarah',
        })
      }
    } catch {
      setMessages((current) => [...current, { id: `${Date.now()}-e`, role: 'sarah', text: "I couldn't reach the business intelligence service just now. Nothing was changed." }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled">
        {messages.map((message) => (
          <View key={message.id} style={[styles.bubble, message.role === 'user' ? styles.userBubble : styles.sarahBubble]}>
            <Text style={[styles.label, message.role === 'user' && styles.userLabel]}>{message.role === 'user' ? 'YOU' : 'SARAH'}</Text>
            <Text style={styles.message}>{message.text}</Text>
          </View>
        ))}
        {busy && <View style={[styles.bubble, styles.sarahBubble]}><ActivityIndicator color={colors.primary} /></View>}
      </ScrollView>
      <View style={styles.composer}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Tell Sarah what happened…"
          placeholderTextColor={colors.textTertiary}
          style={styles.input}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity style={[styles.send, (!input.trim() || busy) && styles.disabled]} onPress={send} disabled={!input.trim() || busy}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface2 },
  messages: { padding: spacing.lg, gap: spacing.md },
  bubble: { maxWidth: '88%', padding: spacing.md, borderRadius: radius.lg, gap: spacing.xs },
  sarahBubble: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  label: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  userLabel: { color: '#fff' },
  message: { color: colors.text, fontSize: fontSize.md, lineHeight: 21 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.text, fontSize: fontSize.md, backgroundColor: colors.surface2 },
  send: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  sendText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.45 },
})
