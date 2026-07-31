-- AVENIZE Layer 1 - Real-time Chat
-- Channels, DMs, messages with Supabase Realtime

-- ============================================
-- CHANNELS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'public' CHECK (type IN ('public', 'private', 'direct')),
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, name)
);

-- ============================================
-- CHANNEL MEMBERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id),
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel_id, staff_id)
);

-- ============================================
-- MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES staff(id),
  content TEXT NOT NULL,
  content_html TEXT, -- rendered HTML for rich content
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'system', 'file')),
  file_url TEXT,
  parent_id UUID REFERENCES messages(id), -- for threading
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MESSAGE REACTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id),
  emoji TEXT NOT NULL DEFAULT '👍',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, staff_id, emoji)
);

-- ============================================
-- LAST READ TRACKING (for unread counts)
-- ============================================
CREATE TABLE IF NOT EXISTS channel_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id),
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel_id, staff_id)
);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_reads ENABLE ROW LEVEL SECURITY;

-- Channels: visible if public OR member of private channel
CREATE POLICY "Channels visible to business"
  ON channels FOR SELECT
  USING (
    business_id IN (SELECT business_id FROM get_current_staff())
    OR id IN (SELECT channel_id FROM channel_members WHERE staff_id = (SELECT id FROM staff WHERE user_id = auth.uid()))
  );

-- Channels: can create if in same business
CREATE POLICY "Channels create"
  ON channels FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- Channels: can update if owner or admin
CREATE POLICY "Channels update"
  ON channels FOR UPDATE
  USING (created_by = (SELECT id FROM staff WHERE user_id = auth.uid()));

-- Channel members: visible to channel members
CREATE POLICY "Channel members visible"
  ON channel_members FOR SELECT
  USING (channel_id IN (SELECT channel_id FROM channel_members WHERE staff_id = (SELECT id FROM staff WHERE user_id = auth.uid())));

-- Channel members: can join public channels, invite for private
CREATE POLICY "Channel members join"
  ON channel_members FOR INSERT
  WITH CHECK (staff_id = (SELECT id FROM staff WHERE user_id = auth.uid()));

-- Messages: visible if channel member
CREATE POLICY "Messages visible"
  ON messages FOR SELECT
  USING (channel_id IN (SELECT channel_id FROM channel_members WHERE staff_id = (SELECT id FROM staff WHERE user_id = auth.uid())));

-- Messages: can send if channel member
CREATE POLICY "Messages send"
  ON messages FOR INSERT
  WITH CHECK (sender_id = (SELECT id FROM staff WHERE user_id = auth.uid()));

-- Messages: can update own messages
CREATE POLICY "Messages update own"
  ON messages FOR UPDATE
  USING (sender_id = (SELECT id FROM staff WHERE user_id = auth.uid()));

-- Reactions: visible to all
CREATE POLICY "Reactions visible"
  ON message_reactions FOR SELECT
  USING (message_id IN (SELECT id FROM messages WHERE channel_id IN (SELECT channel_id FROM channel_members WHERE staff_id = (SELECT id FROM staff WHERE user_id = auth.uid()))));

-- Reactions: can add if channel member
CREATE POLICY "Reactions add"
  ON message_reactions FOR INSERT
  WITH CHECK (staff_id = (SELECT id FROM staff WHERE user_id = auth.uid()));

-- Channel reads: own reads only
CREATE POLICY "Channel reads own"
  ON channel_reads FOR ALL
  USING (staff_id = (SELECT id FROM staff WHERE user_id = auth.uid()));

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get all channels for current user
CREATE OR REPLACE FUNCTION get_my_channels()
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  type TEXT,
  unread_count BIGINT,
  last_message_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.description,
    c.type,
    COALESCE(
      (SELECT COUNT(*) FROM messages m
       WHERE m.channel_id = c.id
       AND m.created_at > COALESCE(cr.last_read_at, '1970-01-01'::timestamptz)
       AND m.sender_id != (SELECT id FROM staff WHERE user_id = auth.uid())
      ), 0
    ) as unread_count,
    (SELECT m.created_at FROM messages m WHERE m.channel_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_at
  FROM channels c
  LEFT JOIN channel_reads cr ON cr.channel_id = c.id AND cr.staff_id = (SELECT id FROM staff WHERE user_id = auth.uid())
  WHERE c.id IN (SELECT channel_id FROM channel_members WHERE staff_id = (SELECT id FROM staff WHERE user_id = auth.uid()))
  ORDER BY last_message_at DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Join a channel
CREATE OR REPLACE FUNCTION join_channel(p_channel_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO channel_members (channel_id, staff_id)
  VALUES (p_channel_id, (SELECT id FROM staff WHERE user_id = auth.uid()))
  ON CONFLICT (channel_id, staff_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Leave a channel
CREATE OR REPLACE FUNCTION leave_channel(p_channel_id UUID)
RETURNS VOID AS $$
BEGIN
  DELETE FROM channel_members
  WHERE channel_id = p_channel_id
  AND staff_id = (SELECT id FROM staff WHERE user_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE TRIGGER channels_updated_at BEFORE UPDATE ON channels FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- AUTO-JOIN DEFAULT CHANNEL
-- Insert a #general channel on business creation trigger
-- ============================================
CREATE OR REPLACE FUNCTION create_default_channel()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_id UUID;
  v_channel_id UUID;
BEGIN
  -- Get the owner staff record
  SELECT id INTO v_owner_id FROM staff WHERE business_id = NEW.id AND role = 'owner' LIMIT 1;
  
  -- Create #general channel
  INSERT INTO channels (business_id, name, description, type, created_by)
  VALUES (NEW.id, 'general', 'Company-wide announcements and updates', 'public', v_owner_id)
  RETURNING id INTO v_channel_id;
  
  -- Owner auto-joins
  INSERT INTO channel_members (channel_id, staff_id, role)
  VALUES (v_channel_id, v_owner_id, 'owner');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create #general when new business is created
CREATE TRIGGER on_business_created
  AFTER INSERT ON businesses
  FOR EACH ROW EXECUTE FUNCTION create_default_channel();
