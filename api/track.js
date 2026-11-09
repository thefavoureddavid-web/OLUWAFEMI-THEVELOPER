import crypto from 'crypto';

/**
 * ==============================================================
 * // EDIT: VERCEL SERVERLESS TRACKING HELPER - /api/track.js
 * Visitor Activity Tracking & Geo Enrichment for Oluwafemi Portfolio
 * Salted IP Hashing, NDPA 2023 Compliance, Rate Limiting & Supabase Ingestion
 * ==============================================================
 */

// Editable Configuration
const TRACKING_CONFIG = {
  ipHashSalt: process.env.TRACKING_SALT || 'femi_secure_visitor_salt_2026',
  maxEventsPerMinute: 60,
  oneMinuteMs: 60 * 1000,
  supabaseUrl: process.env.VITE_SUPABASE_URL || 'https://plnfmgqjaspzucomxbsy.supabase.co',
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsbmZtZ3FqYXNwenVjb214YnN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNzQzODEsImV4cCI6MjEwODg1MDM4MX0.d0sLqi9sBC7603ekUEuTbcXdQxaMVKkVW0XzEtBcX48'
};

// In-Memory Rate Limiting
const rateLimitMap = new Map();

function isRateLimited(identifier) {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  if (!record || now - record.windowStart > TRACKING_CONFIG.oneMinuteMs) {
    rateLimitMap.set(identifier, { count: 1, windowStart: now });
    return false;
  }

  record.count += 1;
  return record.count > TRACKING_CONFIG.maxEventsPerMinute;
}

// Periodic Rate Limit Cache Cleanup
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitMap.entries()) {
      if (now - record.windowStart > TRACKING_CONFIG.oneMinuteMs * 5) {
        rateLimitMap.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

// Country Code to Name Converter
function resolveCountryName(code) {
  if (!code) return 'Nigeria';
  const c = String(code).toUpperCase().trim();
  const countryMap = {
    NG: 'Nigeria',
    US: 'United States',
    GB: 'United Kingdom',
    CA: 'Canada',
    DE: 'Germany',
    GH: 'Ghana',
    KE: 'Kenya',
    ZA: 'South Africa',
    FR: 'France',
    IN: 'India',
    AE: 'United Arab Emirates'
  };
  return countryMap[c] || c;
}

// Supabase Direct REST Helper
async function supabaseQuery(endpoint, method = 'GET', body = null, headers = {}) {
  const url = `${TRACKING_CONFIG.supabaseUrl}/rest/v1/${endpoint}`;
  const reqHeaders = {
    'apikey': TRACKING_CONFIG.supabaseKey,
    'Authorization': `Bearer ${TRACKING_CONFIG.supabaseKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...headers
  };

  const options = {
    method,
    headers: reqHeaders
  };

  if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase REST error (${res.status}): ${errText}`);
  }

  try {
    return await res.json();
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  // 1. CORS & Origin Validation
  const origin = req.headers.origin || req.headers.referer || '';
  const allowedOrigins = [
    'https://oluwafemi-theveloper.vercel.app',
    'https://oluwafemi-thedeveloper.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];

  const isAllowedOrigin = allowedOrigins.some(allowed => origin.startsWith(allowed)) || !origin;
  res.setHeader('Access-Control-Allow-Origin', isAllowedOrigin && origin ? origin : '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Visitor-ID');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 2. Client Identifier & Rate Limiting
  const forwardedFor = req.headers['x-forwarded-for'];
  const rawIp = (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : req.socket?.remoteAddress) || '127.0.0.1';
  const visitorUuid = req.headers['x-visitor-id'] || req.body?.visitorId || 'anonymous';
  const rateLimitKey = `${rawIp}_${visitorUuid}`;

  if (isRateLimited(rateLimitKey)) {
    return res.status(429).json({ error: 'Too many tracking events' });
  }

  // 3. Salted SHA-256 IP Hash (Never store raw IP)
  const ipHash = crypto.createHash('sha256').update(`${rawIp}_${TRACKING_CONFIG.ipHashSalt}`).digest('hex').substring(0, 16);

  // 4. Geo Enrichment from Vercel Edge Headers
  const rawCountry = req.headers['x-vercel-ip-country'] || 'NG';
  const country = resolveCountryName(rawCountry);
  const city = req.headers['x-vercel-ip-city'] ? decodeURIComponent(req.headers['x-vercel-ip-city']) : 'Nigeria';
  const region = req.headers['x-vercel-ip-country-region'] || 'NG';

  // 5. Payload Processing
  const payload = req.body || {};
  const { eventType, visitorId, sessionId, metadata = {} } = payload;

  if (!eventType || !visitorId || !sessionId) {
    return res.status(400).json({ error: 'Missing required parameters: eventType, visitorId, sessionId' });
  }

  try {
    // -------------------------------------------------------------
    // EVENT: SESSION START ("LOGIN")
    // -------------------------------------------------------------
    if (eventType === 'start') {
      const {
        isReturning = false,
        landingPage = '/',
        referrer = 'Direct',
        utmSource = null,
        utmMedium = null,
        utmCampaign = null,
        deviceType = 'mobile',
        browser = 'Chrome',
        os = 'Android',
        screenResolution = '390x844',
        language = 'en'
      } = metadata;

      // 1. Upsert Visitor in visitors table
      let existingVisitor = null;
      try {
        const queryRes = await supabaseQuery(`visitors?visitor_uuid=eq.${encodeURIComponent(visitorId)}&select=id,total_visits,is_ignored`);
        if (Array.isArray(queryRes) && queryRes.length > 0) {
          existingVisitor = queryRes[0];
        }
      } catch (e) {
        console.warn('Visitor lookup error:', e);
      }

      let visitorDbId = existingVisitor?.id;
      let sessionNumber = 1;

      if (existingVisitor) {
        sessionNumber = (existingVisitor.total_visits || 1) + 1;
        // Update visitor
        await supabaseQuery(`visitors?id=eq.${existingVisitor.id}`, 'PATCH', {
          last_seen_at: new Date().toISOString(),
          total_visits: sessionNumber,
          last_country: country,
          last_city: city,
          last_device: deviceType,
          last_browser: browser,
          last_os: os
        });
      } else {
        // Insert new visitor
        const insertRes = await supabaseQuery('visitors', 'POST', [{
          visitor_uuid: visitorId,
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          total_visits: 1,
          is_ignored: false,
          last_country: country,
          last_city: city,
          last_device: deviceType,
          last_browser: browser,
          last_os: os
        }]);
        if (Array.isArray(insertRes) && insertRes.length > 0) {
          visitorDbId = insertRes[0].id;
        }
      }

      // 2. Insert Session Record
      await supabaseQuery('visitor_sessions', 'POST', [{
        visitor_id: visitorDbId,
        session_id: sessionId,
        session_number: sessionNumber,
        started_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
        is_active: true,
        landing_page: landingPage,
        exit_page: landingPage,
        referrer: referrer,
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        ip_hash: ipHash,
        country: country,
        city: city,
        region: region,
        device_type: deviceType,
        browser: browser,
        os: os,
        screen_resolution: screenResolution,
        language: language,
        sections_viewed: metadata.initialSection ? [metadata.initialSection] : ['hero'],
        key_actions: [],
        actions_count: 0
      }]);

      return res.status(200).json({ ok: true, status: 'session_started', sessionNumber, country, city });
    }

    // -------------------------------------------------------------
    // EVENT: HEARTBEAT (Every 30s)
    // -------------------------------------------------------------
    if (eventType === 'heartbeat') {
      const { durationSeconds = 30, currentSection, exitPage } = metadata;
      const nowIso = new Date().toISOString();

      // Retrieve existing session to update sections viewed
      let existingSession = null;
      try {
        const queryRes = await supabaseQuery(`visitor_sessions?session_id=eq.${encodeURIComponent(sessionId)}&select=id,sections_viewed,duration_seconds`);
        if (Array.isArray(queryRes) && queryRes.length > 0) {
          existingSession = queryRes[0];
        }
      } catch (e) {}

      if (existingSession) {
        let updatedSections = Array.isArray(existingSession.sections_viewed) ? [...existingSession.sections_viewed] : [];
        if (currentSection && !updatedSections.includes(currentSection)) {
          updatedSections.push(currentSection);
        }

        await supabaseQuery(`visitor_sessions?session_id=eq.${encodeURIComponent(sessionId)}`, 'PATCH', {
          last_active_at: nowIso,
          duration_seconds: Math.max(existingSession.duration_seconds || 0, Number(durationSeconds) || 0),
          is_active: true,
          exit_page: exitPage || '/',
          sections_viewed: updatedSections
        });
      }

      return res.status(200).json({ ok: true, status: 'heartbeat_received' });
    }

    // -------------------------------------------------------------
    // EVENT: ACTION (Clicks, Form, Chatbot, Leads)
    // -------------------------------------------------------------
    if (eventType === 'action') {
      const { actionName, actionDetails = {}, currentSection = '' } = metadata;
      const nowIso = new Date().toISOString();

      let existingSession = null;
      try {
        const queryRes = await supabaseQuery(`visitor_sessions?session_id=eq.${encodeURIComponent(sessionId)}&select=id,visitor_id,key_actions,actions_count,country,city`);
        if (Array.isArray(queryRes) && queryRes.length > 0) {
          existingSession = queryRes[0];
        }
      } catch (e) {}

      if (existingSession) {
        const actionItem = {
          name: actionName,
          section: currentSection,
          time: nowIso,
          details: actionDetails
        };

        const currentActions = Array.isArray(existingSession.key_actions) ? existingSession.key_actions : [];
        currentActions.push(actionItem);

        await supabaseQuery(`visitor_sessions?session_id=eq.${encodeURIComponent(sessionId)}`, 'PATCH', {
          last_active_at: nowIso,
          actions_count: (existingSession.actions_count || 0) + 1,
          key_actions: currentActions.slice(-25) // Keep last 25 actions
        });

        // Trigger High Intent Notification for vital user conversions!
        const highIntentTypes = {
          whatsapp_click: { type: 'whatsapp_click', title: '💬 WhatsApp Chat Initiated', text: 'Visitor clicked WhatsApp button to message Femi directly.' },
          call_click: { type: 'call_click', title: '📞 Direct Call Clicked', text: 'Visitor tapped Femi\'s phone number (0805 476 3626).' },
          discount_claim: { type: 'discount_claim', title: '🔥 10% Discount Claimed', text: 'Visitor clicked to claim the first-5-clients 10% discount!' },
          form_start: { type: 'high_intent', title: '✍️ Project Form Started', text: 'Visitor is filling out the project contact form.' },
          form_submit: { type: 'lead_form', title: '🚀 Contact Form Submitted', text: `Project inquiry submitted by ${actionDetails.name || 'visitor'}.` },
          chatbot_open: { type: 'high_intent', title: '🤖 AI Chatbot Opened', text: 'Visitor engaged the AI assistant widget.' },
          video_play: { type: 'video_engagement', title: '🎬 Intro Video Played', text: 'Visitor started watching Femi\'s intro video.' },
          video_complete: { type: 'video_engagement', title: '🎉 Intro Video Completed', text: 'Visitor watched Femi\'s intro video to the end!' },
          video_cta_discount_click: { type: 'discount_claim', title: '🎁 Video CTA Discount Clicked', text: 'Visitor clicked Claim 10% Discount inside the intro video!' },
          video_cta_consultation_click: { type: 'high_intent', title: '📅 Video CTA Consultation Clicked', text: 'Visitor clicked Book Free Consultation inside the intro video!' }
        };

        if (highIntentTypes[actionName]) {
          const cfg = highIntentTypes[actionName];
          await supabaseQuery('notifications', 'POST', [{
            type: cfg.type,
            title: cfg.title,
            message: `${cfg.text} (Location: ${existingSession.city || 'Unknown'}, ${existingSession.country || 'Nigeria'})`,
            visitor_id: existingSession.visitor_id,
            session_id: sessionId,
            metadata: {
              action: actionName,
              details: actionDetails,
              section: currentSection
            }
          }]);
        }
      }

      return res.status(200).json({ ok: true, status: 'action_logged' });
    }

    // -------------------------------------------------------------
    // EVENT: SESSION END ("LOGOUT" / PAGEHIDE)
    // -------------------------------------------------------------
    if (eventType === 'end') {
      const { durationSeconds = 0, exitPage = '/' } = metadata;
      const nowIso = new Date().toISOString();

      await supabaseQuery(`visitor_sessions?session_id=eq.${encodeURIComponent(sessionId)}`, 'PATCH', {
        ended_at: nowIso,
        last_active_at: nowIso,
        duration_seconds: Number(durationSeconds) || 0,
        is_active: false,
        exit_page: exitPage
      });

      return res.status(200).json({ ok: true, status: 'session_ended' });
    }

    return res.status(400).json({ error: `Unknown eventType: ${eventType}` });

  } catch (err) {
    console.error('Track handler execution error:', err?.message || err);
    // Silent fail for tracking - never crash user experience
    return res.status(500).json({ error: 'Tracking event processing failed', ok: false });
  }
}
