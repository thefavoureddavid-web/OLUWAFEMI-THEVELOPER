-- ====================================================================
-- SUPABASE SQL MIGRATION: CHATBOT LEADS & CONVERSATION TRANSCRIPTS
-- Re-runnable script for Oluwafemi David Adekanola Portfolio
-- Admin Email: davidbryght@gmail.com
-- ====================================================================

-- 1. Create chat_conversations table
CREATE TABLE IF NOT EXISTS public.chat_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    session_id TEXT NOT NULL,
    visitor_name TEXT,
    visitor_email TEXT,
    visitor_phone TEXT,
    project_type TEXT,
    summary TEXT,
    discount_claimed BOOLEAN DEFAULT false,
    consultation_requested BOOLEAN DEFAULT false,
    consultation_preferred_time TEXT,
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'booked', 'closed')),
    is_read BOOLEAN DEFAULT false,
    page_url TEXT,
    device TEXT
);

-- 2. Create chat_messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('visitor', 'bot')),
    content TEXT NOT NULL
);

-- 3. Create index for fast retrieval by session and created_at
CREATE INDEX IF NOT EXISTS idx_chat_conversations_created_at ON public.chat_conversations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_session_id ON public.chat_conversations (session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_id ON public.chat_messages (conversation_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies if re-running
DROP POLICY IF EXISTS "Anon can insert chat conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "Anon can update own chat session" ON public.chat_conversations;
DROP POLICY IF EXISTS "Admin full access on chat conversations" ON public.chat_conversations;

DROP POLICY IF EXISTS "Anon can insert chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Admin full access on chat messages" ON public.chat_messages;

-- 6. RLS Policies for chat_conversations:
-- Anon role (public visitors) may INSERT new conversation records
CREATE POLICY "Anon can insert chat conversations" 
ON public.chat_conversations 
FOR INSERT 
TO anon 
WITH CHECK (true);

-- Anon role may update their conversation details during the same active session
CREATE POLICY "Anon can update own chat session"
ON public.chat_conversations
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Only authenticated admin (davidbryght@gmail.com) may SELECT, UPDATE, DELETE
CREATE POLICY "Admin full access on chat conversations" 
ON public.chat_conversations 
FOR ALL 
TO authenticated 
USING (
    (auth.jwt() ->> 'email') = 'davidbryght@gmail.com'
)
WITH CHECK (
    (auth.jwt() ->> 'email') = 'davidbryght@gmail.com'
);

-- 7. RLS Policies for chat_messages:
-- Anon role may INSERT chat messages
CREATE POLICY "Anon can insert chat messages" 
ON public.chat_messages 
FOR INSERT 
TO anon 
WITH CHECK (true);

-- Only authenticated admin may SELECT, UPDATE, DELETE chat messages
CREATE POLICY "Admin full access on chat messages" 
ON public.chat_messages 
FOR ALL 
TO authenticated 
USING (
    (auth.jwt() ->> 'email') = 'davidbryght@gmail.com'
)
WITH CHECK (
    (auth.jwt() ->> 'email') = 'davidbryght@gmail.com'
);

-- 8. Enable Realtime Replication for Admin Dashboard live notifications
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversations;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
