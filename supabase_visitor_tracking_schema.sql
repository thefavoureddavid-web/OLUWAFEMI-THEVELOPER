-- ====================================================================
-- SUPABASE SQL MIGRATION: VISITOR ACTIVITY TRACKING & NOTIFICATIONS
-- Re-runnable, idempotent schema for Oluwafemi David Adekanola Portfolio
-- Admin: Oluwafemi David Adekanola (davidbryght@gmail.com)
-- ====================================================================

-- 1. VISITORS DIRECTORY TABLE
CREATE TABLE IF NOT EXISTS public.visitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_uuid TEXT UNIQUE NOT NULL,
    first_seen_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_seen_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    total_visits INT DEFAULT 1 NOT NULL,
    is_ignored BOOLEAN DEFAULT false NOT NULL,
    notes TEXT DEFAULT '',
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    lead_name TEXT,
    lead_email TEXT,
    lead_phone TEXT,
    last_country TEXT,
    last_city TEXT,
    last_device TEXT,
    last_browser TEXT,
    last_os TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. VISITOR SESSIONS TABLE
CREATE TABLE IF NOT EXISTS public.visitor_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_id UUID REFERENCES public.visitors(id) ON DELETE CASCADE,
    session_id TEXT UNIQUE NOT NULL,
    session_number INT DEFAULT 1 NOT NULL,
    started_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_active_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_seconds INT DEFAULT 0 NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    landing_page TEXT DEFAULT '/',
    exit_page TEXT DEFAULT '/',
    referrer TEXT DEFAULT 'Direct',
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    ip_hash TEXT,
    country TEXT DEFAULT 'Nigeria',
    city TEXT DEFAULT 'Unknown',
    region TEXT DEFAULT '',
    device_type TEXT DEFAULT 'mobile',
    browser TEXT DEFAULT 'Chrome',
    os TEXT DEFAULT 'Android',
    screen_resolution TEXT DEFAULT '390x844',
    language TEXT DEFAULT 'en',
    sections_viewed JSONB DEFAULT '[]'::JSONB,
    key_actions JSONB DEFAULT '[]'::JSONB,
    actions_count INT DEFAULT 0 NOT NULL
);

-- 3. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    type TEXT NOT NULL CHECK (type IN (
        'arrival_new', 
        'arrival_returning', 
        'departure', 
        'lead_form', 
        'lead_chat', 
        'whatsapp_click', 
        'call_click', 
        'discount_claim', 
        'high_intent'
    )),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    visitor_id UUID REFERENCES public.visitors(id) ON DELETE SET NULL,
    session_id TEXT,
    is_read BOOLEAN DEFAULT false NOT NULL,
    is_archived BOOLEAN DEFAULT false NOT NULL,
    metadata JSONB DEFAULT '{}'::JSONB
);

-- 4. INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_visitors_uuid ON public.visitors (visitor_uuid);
CREATE INDEX IF NOT EXISTS idx_visitors_last_seen ON public.visitors (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_visitor_id ON public.visitor_sessions (visitor_id);
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_session_id ON public.visitor_sessions (session_id);
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_active ON public.visitor_sessions (is_active, last_active_at);
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_started_at ON public.visitor_sessions (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications (is_read, is_archived);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications (type);

-- 5. AUTOMATED NOTIFICATION & SESSION TRIGGER FUNCTIONS

-- Function to create notification when visitor arrives
CREATE OR REPLACE FUNCTION public.handle_session_arrival_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_is_ignored BOOLEAN;
    v_location_str TEXT;
    v_notif_title TEXT;
    v_notif_msg TEXT;
    v_notif_type TEXT;
BEGIN
    -- Check if visitor is flagged as ignored
    SELECT is_ignored INTO v_is_ignored FROM public.visitors WHERE id = NEW.visitor_id;
    IF v_is_ignored IS TRUE THEN
        RETURN NEW;
    END IF;

    -- Format location
    IF NEW.city IS NOT NULL AND NEW.city <> 'Unknown' AND NEW.city <> '' THEN
        v_location_str := NEW.city || ', ' || COALESCE(NEW.country, 'Nigeria');
    ELSE
        v_location_str := COALESCE(NEW.country, 'Unknown Location');
    END IF;

    -- Distinguish New vs Returning
    IF NEW.session_number = 1 THEN
        v_notif_type := 'arrival_new';
        v_notif_title := '🟢 New Visitor Arrived';
        v_notif_msg := 'New visitor from ' || v_location_str || ' on ' || COALESCE(NEW.device_type, 'device') || ' (' || COALESCE(NEW.browser, 'browser') || ').';
    ELSE
        v_notif_type := 'arrival_returning';
        v_notif_title := '🔄 Returning Visitor (Visit #' || NEW.session_number || ')';
        v_notif_msg := 'Returning visitor from ' || v_location_str || ' just arrived via ' || COALESCE(NEW.referrer, 'Direct') || '.';
    END IF;

    -- Insert notification with anti-spam check (avoid duplicate within 30 seconds for same session)
    IF NOT EXISTS (
        SELECT 1 FROM public.notifications 
        WHERE session_id = NEW.session_id 
          AND type IN ('arrival_new', 'arrival_returning')
          AND created_at > (NOW() - INTERVAL '30 seconds')
    ) THEN
        INSERT INTO public.notifications (
            type,
            title,
            message,
            visitor_id,
            session_id,
            metadata
        ) VALUES (
            v_notif_type,
            v_notif_title,
            v_notif_msg,
            NEW.visitor_id,
            NEW.session_id,
            jsonb_build_object(
                'country', NEW.country,
                'city', NEW.city,
                'device_type', NEW.device_type,
                'browser', NEW.browser,
                'os', NEW.os,
                'session_number', NEW.session_number,
                'referrer', NEW.referrer
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on visitor_sessions arrival
DROP TRIGGER IF EXISTS trg_session_arrival_notification ON public.visitor_sessions;
CREATE TRIGGER trg_session_arrival_notification
AFTER INSERT ON public.visitor_sessions
FOR EACH ROW
EXECUTE FUNCTION public.handle_session_arrival_notification();

-- Function to create notification when visitor departs or triggers high intent
CREATE OR REPLACE FUNCTION public.handle_session_departure_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_is_ignored BOOLEAN;
    v_duration_mins INT;
    v_sections_count INT;
    v_location_str TEXT;
BEGIN
    -- Only trigger when session was active and now set to inactive
    IF OLD.is_active = true AND NEW.is_active = false THEN
        SELECT is_ignored INTO v_is_ignored FROM public.visitors WHERE id = NEW.visitor_id;
        IF v_is_ignored IS TRUE THEN
            RETURN NEW;
        END IF;

        -- Ignore very brief bounces (< 8 seconds) to prevent departure spam
        IF NEW.duration_seconds < 8 THEN
            RETURN NEW;
        END IF;

        IF NEW.city IS NOT NULL AND NEW.city <> 'Unknown' AND NEW.city <> '' THEN
            v_location_str := NEW.city || ', ' || COALESCE(NEW.country, 'Nigeria');
        ELSE
            v_location_str := COALESCE(NEW.country, 'Unknown');
        END IF;

        v_duration_mins := ROUND(NEW.duration_seconds / 60.0);
        v_sections_count := COALESCE(jsonb_array_length(NEW.sections_viewed), 0);

        -- Prevent duplicate departure notification within 60 seconds
        IF NOT EXISTS (
            SELECT 1 FROM public.notifications
            WHERE session_id = NEW.session_id
              AND type = 'departure'
        ) THEN
            INSERT INTO public.notifications (
                type,
                title,
                message,
                visitor_id,
                session_id,
                metadata
            ) VALUES (
                'departure',
                '👋 Visitor Departed (' || v_location_str || ')',
                'Session ended after ' || 
                CASE WHEN NEW.duration_seconds < 60 THEN NEW.duration_seconds || 's'
                     ELSE v_duration_mins || 'm' END || 
                '. Explored ' || v_sections_count || ' section(s) with ' || NEW.actions_count || ' action(s).',
                NEW.visitor_id,
                NEW.session_id,
                jsonb_build_object(
                    'duration_seconds', NEW.duration_seconds,
                    'sections_count', v_sections_count,
                    'actions_count', NEW.actions_count,
                    'exit_page', NEW.exit_page
                )
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on visitor_sessions departure
DROP TRIGGER IF EXISTS trg_session_departure_notification ON public.visitor_sessions;
CREATE TRIGGER trg_session_departure_notification
AFTER UPDATE OF is_active ON public.visitor_sessions
FOR EACH ROW
EXECUTE FUNCTION public.handle_session_departure_notification();

-- 6. RPC: CLEANUP STALE SESSIONS (heartbeat timeout > 2 minutes)
CREATE OR REPLACE FUNCTION public.cleanup_stale_sessions()
RETURNS INT AS $$
DECLARE
    v_closed_count INT;
BEGIN
    UPDATE public.visitor_sessions
    SET 
        is_active = false,
        ended_at = last_active_at,
        duration_seconds = GREATEST(duration_seconds, EXTRACT(EPOCH FROM (last_active_at - started_at))::INT)
    WHERE 
        is_active = true 
        AND last_active_at < (NOW() - INTERVAL '2 minutes');

    GET DIAGNOSTICS v_closed_count = ROW_COUNT;
    RETURN v_closed_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RPC: PURGE OLD TRACKING DATA (90-Day Retention Compliance)
CREATE OR REPLACE FUNCTION public.purge_old_visitor_data(p_retention_days INT DEFAULT 90)
RETURNS INT AS $$
DECLARE
    v_deleted_count INT;
BEGIN
    -- Delete notifications older than retention days
    DELETE FROM public.notifications
    WHERE created_at < (NOW() - (p_retention_days || ' days')::INTERVAL);

    -- Delete sessions older than retention days
    DELETE FROM public.visitor_sessions
    WHERE started_at < (NOW() - (p_retention_days || ' days')::INTERVAL);

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Drop prior policies if present
DROP POLICY IF EXISTS "Anon can insert and update visitors" ON public.visitors;
DROP POLICY IF EXISTS "Admin full access on visitors" ON public.visitors;
DROP POLICY IF EXISTS "Anon can insert sessions" ON public.visitor_sessions;
DROP POLICY IF EXISTS "Anon can update active sessions" ON public.visitor_sessions;
DROP POLICY IF EXISTS "Admin full access on sessions" ON public.visitor_sessions;
DROP POLICY IF EXISTS "Anon can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Admin full access on notifications" ON public.notifications;

-- Visitors Table Policies
CREATE POLICY "Anon can insert and update visitors"
ON public.visitors
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

CREATE POLICY "Admin full access on visitors"
ON public.visitors
FOR ALL
TO authenticated
USING ((auth.jwt() ->> 'email') = 'davidbryght@gmail.com')
WITH CHECK ((auth.jwt() ->> 'email') = 'davidbryght@gmail.com');

-- Visitor Sessions Table Policies
CREATE POLICY "Anon can insert sessions"
ON public.visitor_sessions
FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "Anon can update active sessions"
ON public.visitor_sessions
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

CREATE POLICY "Admin full access on sessions"
ON public.visitor_sessions
FOR ALL
TO authenticated
USING ((auth.jwt() ->> 'email') = 'davidbryght@gmail.com')
WITH CHECK ((auth.jwt() ->> 'email') = 'davidbryght@gmail.com');

-- Notifications Table Policies
CREATE POLICY "Anon can insert notifications"
ON public.notifications
FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "Admin full access on notifications"
ON public.notifications
FOR ALL
TO authenticated
USING ((auth.jwt() ->> 'email') = 'davidbryght@gmail.com')
WITH CHECK ((auth.jwt() ->> 'email') = 'davidbryght@gmail.com');

-- 9. ENABLE SUPABASE REALTIME REPLICATION
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.visitor_sessions;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
