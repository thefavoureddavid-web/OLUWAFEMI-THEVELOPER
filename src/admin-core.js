/**
 * ==============================================================
 * PRIVATE ADMIN CORE & STORAGE MANAGEMENT MODULE
 * Loaded LAZILY only upon authenticating via the secret entrance.
 * Never bundled or executed for public visitors.
 * Admin: Oluwafemi David Adekanola (davidbryght@gmail.com)
 * ==============================================================
 */

const ADMIN_CONFIG = {
  email: "davidbryght@gmail.com",
  maxFailedAttempts: 5,
  initialLockoutSeconds: 900, // 15 minutes
  inactivityTimeoutMs: 15 * 60 * 1000, // 15 minutes
  inactivityWarningMs: 14 * 60 * 1000, // 14 minutes (60s countdown)
  maxBackgroundHiddenMs: 10 * 60 * 1000 // Sign out if tab hidden > 10 minutes
};

const ORIGINAL_PAGE_TITLE = "Oluwafemi David Adekanola | Full-Stack Web Developer in Ilorin, Nigeria";
const NEUTRAL_ADMIN_TITLE = "Oluwafemi David Adekanola | Portfolio";

// In-memory Auth and MFA tracking
let currentMfaFactorId = null;
let currentMfaChallengeId = null;
let memoryFailedAttempts = 0;
let memoryLockoutUntil = 0;
let memoryLockoutMultiplier = 1;
let lockoutIntervalId = null;
let lastActivityTime = Date.now();
let hiddenSinceTime = 0;
let inactivityTimerId = null;
let warningCountdownInterval = null;
let pendingAdminTab = 'websites';
let adminChatFilter = 'all';
let adminChatSearchQuery = '';
let adminConversationsCache = [];
let activeTranscriptConvId = null;
let savedScrollPosition = 0;
let savedActiveElement = null;

// Visitor Activity & Realtime Notification State
let adminNotificationsCache = [];
let adminVisitorsCache = [];
let adminSessionsCache = [];
let adminNotifFilter = 'all';
let adminVisitorFilter = 'all';
let adminVisitorSearchQuery = '';
let realtimeChannel = null;
let visitorPollingTimer = null;
let activeDrawerVisitorId = null;

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message, type = 'success') {
  if (typeof window.showCustomToast === 'function') {
    window.showCustomToast(message, type);
  } else {
    alert(message);
  }
}

function showConfirm(message, onConfirm) {
  if (typeof window.showCustomConfirm === 'function') {
    window.showCustomConfirm(message, onConfirm);
  } else if (confirm(message)) {
    onConfirm();
  }
}

function getSupabase() {
  return window.supabaseClient || null;
}

// Security activity logger
async function logSecurityActivity(eventType, metadata = {}) {
  const userAgent = navigator.userAgent || 'Unknown';
  const client = getSupabase();
  if (!client) return;

  try {
    if (typeof client.rpc === 'function') {
      await client.rpc('log_security_event', {
        p_event_type: eventType,
        p_user_agent: userAgent,
        p_metadata: metadata
      });
    } else if (typeof client.from === 'function') {
      await client.from('activity_logs').insert([{
        event_type: eventType,
        admin_email: ADMIN_CONFIG.email,
        user_agent: userAgent,
        metadata
      }]);
    }
  } catch (err) {
    console.warn('Security audit log skipped:', err);
  }
}

// Lockout state helpers
function getLockoutState() {
  try {
    const raw = sessionStorage.getItem('femi_admin_lockout_state');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.lockoutUntil && parsed.lockoutUntil > Date.now()) {
        return parsed;
      }
    }
  } catch (e) {}
  return {
    failedAttempts: memoryFailedAttempts,
    lockoutUntil: memoryLockoutUntil,
    multiplier: memoryLockoutMultiplier
  };
}

function saveLockoutState(state) {
  memoryFailedAttempts = state.failedAttempts || 0;
  memoryLockoutUntil = state.lockoutUntil || 0;
  memoryLockoutMultiplier = state.multiplier || 1;
  try {
    sessionStorage.setItem('femi_admin_lockout_state', JSON.stringify(state));
  } catch (e) {}
}

function clearLockoutState() {
  memoryFailedAttempts = 0;
  memoryLockoutUntil = 0;
  memoryLockoutMultiplier = 1;
  try {
    sessionStorage.removeItem('femi_admin_lockout_state');
  } catch (e) {}
  if (lockoutIntervalId) {
    clearInterval(lockoutIntervalId);
    lockoutIntervalId = null;
  }
  const banner = document.getElementById('lockout-banner');
  if (banner) banner.classList.add('hidden');
  const submitBtn = document.getElementById('login-submit-btn');
  if (submitBtn) submitBtn.disabled = false;
}

function updateLockoutUI() {
  const state = getLockoutState();
  const banner = document.getElementById('lockout-banner');
  const countdownEl = document.getElementById('lockout-countdown');
  const submitBtn = document.getElementById('login-submit-btn');

  if (state.lockoutUntil && state.lockoutUntil > Date.now()) {
    const remainingMs = state.lockoutUntil - Date.now();
    const mins = Math.floor(remainingMs / 60000);
    const secs = Math.floor((remainingMs % 60000) / 1000);
    if (banner) banner.classList.remove('hidden');
    if (countdownEl) countdownEl.textContent = `Too many failed attempts. Form locked for ${mins}m ${secs < 10 ? '0' : ''}${secs}s.`;
    if (submitBtn) submitBtn.disabled = true;

    if (!lockoutIntervalId) {
      lockoutIntervalId = setInterval(() => {
        const current = getLockoutState();
        if (current.lockoutUntil <= Date.now()) {
          clearLockoutState();
        } else {
          updateLockoutUI();
        }
      }, 1000);
    }
    return true;
  } else {
    if (banner) banner.classList.add('hidden');
    if (submitBtn) submitBtn.disabled = false;
    return false;
  }
}

// Have I Been Pwned Range check
async function checkHaveIBeenPwned(password) {
  if (!password || password.length < 8) return { breached: false, count: 0 };
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuf = await crypto.subtle.digest('SHA-1', data);
    const hashArr = Array.from(new Uint8Array(hashBuf));
    const hashHex = hashArr.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    const prefix = hashHex.substring(0, 5);
    const suffix = hashHex.substring(5);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      method: 'GET',
      cache: 'no-store'
    });
    if (!res.ok) return { breached: false, count: 0 };
    const text = await res.text();
    const lines = text.split('\n');
    for (const line of lines) {
      const [hSuffix, count] = line.trim().split(':');
      if (hSuffix === suffix) {
        return { breached: true, count: parseInt(count, 10) || 1 };
      }
    }
    return { breached: false, count: 0 };
  } catch (err) {
    return { breached: false, count: 0 };
  }
}

// Password Policy
function evaluatePasswordPolicy(pwd) {
  const result = {
    hasLen: pwd.length >= 12,
    hasUpper: /[A-Z]/.test(pwd),
    hasLower: /[a-z]/.test(pwd),
    hasNum: /[0-9]/.test(pwd),
    hasSym: /[^A-Za-z0-9]/.test(pwd),
    noPersonal: true,
    score: 0
  };

  const lower = pwd.toLowerCase();
  const forbidden = ['femi', 'david', 'adekanola', 'bryght', 'davidbryght'];
  for (const term of forbidden) {
    if (lower.includes(term)) {
      result.noPersonal = false;
      break;
    }
  }

  let points = 0;
  if (result.hasLen) points += 25;
  if (pwd.length >= 16) points += 15;
  if (result.hasUpper) points += 15;
  if (result.hasLower) points += 15;
  if (result.hasNum) points += 15;
  if (result.hasSym) points += 15;
  if (!result.noPersonal) points = Math.min(points, 20);

  result.score = Math.min(points, 100);
  result.isValid = result.hasLen && result.hasUpper && result.hasLower && result.hasNum && result.hasSym && result.noPersonal;
  return result;
}

function generateCryptographicPassword(length = 20) {
  const charset = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*()_+-=[]{}|";
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  let pwd = "";
  for (let i = 0; i < length; i++) {
    pwd += charset[randomValues[i] % charset.length];
  }
  return pwd;
}

// Inactivity Watchers
function resetInactivityWatchers() {
  lastActivityTime = Date.now();
  const toast = document.getElementById('inactivity-warning-toast');
  if (toast) toast.classList.add('hidden');
  if (warningCountdownInterval) {
    clearInterval(warningCountdownInterval);
    warningCountdownInterval = null;
  }
}

function startInactivityEngine() {
  stopInactivityEngine();
  resetInactivityWatchers();

  const events = ['mousemove', 'keydown', 'touchstart', 'scroll'];
  events.forEach(evt => window.addEventListener(evt, resetInactivityWatchers, { passive: true }));

  inactivityTimerId = setInterval(async () => {
    const idleMs = Date.now() - lastActivityTime;

    if (idleMs >= ADMIN_CONFIG.inactivityWarningMs && idleMs < ADMIN_CONFIG.inactivityTimeoutMs) {
      const toast = document.getElementById('inactivity-warning-toast');
      const countdownEl = document.getElementById('inactivity-countdown');
      if (toast && toast.classList.contains('hidden')) {
        toast.classList.remove('hidden');
        let remainingSecs = Math.max(1, Math.round((ADMIN_CONFIG.inactivityTimeoutMs - idleMs) / 1000));
        if (countdownEl) countdownEl.textContent = remainingSecs;

        if (!warningCountdownInterval) {
          warningCountdownInterval = setInterval(() => {
            const currentIdle = Date.now() - lastActivityTime;
            remainingSecs = Math.max(0, Math.round((ADMIN_CONFIG.inactivityTimeoutMs - currentIdle) / 1000));
            if (countdownEl) countdownEl.textContent = remainingSecs;
            if (remainingSecs <= 0) {
              clearInterval(warningCountdownInterval);
              warningCountdownInterval = null;
            }
          }, 1000);
        }
      }
    }

    if (idleMs >= ADMIN_CONFIG.inactivityTimeoutMs) {
      stopInactivityEngine();
      await performAdminLogout("Session expired due to 15 minutes of inactivity.");
    }
  }, 5000);

  document.addEventListener('visibilitychange', handleVisibilityChange);
}

async function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    hiddenSinceTime = Date.now();
  } else if (document.visibilityState === 'visible' && hiddenSinceTime > 0) {
    const hiddenDuration = Date.now() - hiddenSinceTime;
    hiddenSinceTime = 0;
    if (hiddenDuration >= ADMIN_CONFIG.maxBackgroundHiddenMs) {
      await performAdminLogout("Session terminated: Browser tab was in background for over 10 minutes.");
    }
  }
}

function stopInactivityEngine() {
  if (inactivityTimerId) {
    clearInterval(inactivityTimerId);
    inactivityTimerId = null;
  }
  if (warningCountdownInterval) {
    clearInterval(warningCountdownInterval);
    warningCountdownInterval = null;
  }
  const toast = document.getElementById('inactivity-warning-toast');
  if (toast) toast.classList.add('hidden');
  const events = ['mousemove', 'keydown', 'touchstart', 'scroll'];
  events.forEach(evt => window.removeEventListener(evt, resetInactivityWatchers));
  document.removeEventListener('visibilitychange', handleVisibilityChange);
}

// Focus trap
function trapModalFocus(modalEl, e) {
  if (e.key !== 'Tab') return;
  const focusable = modalEl.querySelectorAll('button:not([disabled]):not([aria-hidden="true"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === first) {
      last.focus();
      e.preventDefault();
    }
  } else {
    if (document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
  }
}

// Generate Admin Modals HTML Markup
function getAdminModalsHTML() {
  return `
  <!-- Inactivity Warning Toast -->
  <div id="inactivity-warning-toast" class="hidden fixed top-6 right-6 z-[100002] bg-stone-900 border-2 border-orange-500 text-white p-4 rounded-xl shadow-2xl font-mono text-xs max-w-sm">
    <div class="flex items-start gap-3">
      <span class="text-xl">⏳</span>
      <div class="space-y-1">
        <div class="font-bold text-orange-400">Inactivity Warning</div>
        <div class="text-[11px] text-gray-300">
          Your session will automatically lock in <span id="inactivity-countdown" class="font-bold text-white">60</span> seconds due to inactivity.
        </div>
        <button type="button" id="stay-signed-in-btn" class="mt-2 px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded border border-black text-[11px]">
          Stay Signed In
        </button>
      </div>
    </div>
  </div>

  <!-- AUTHENTICATION MODAL -->
  <div id="admin-auth-modal" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
    <div class="modal-content-box bg-white w-full max-w-md rounded-2xl border-3 border-black shadow-[8px_8px_0px_#000] p-6 sm:p-7 relative">
      <div class="washi-tape" style="top: -12px; left: 50%; width: 85px; background-color: rgba(251, 146, 60, 0.9);"></div>
      
      <button type="button" id="close-auth-modal-btn" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-stone-100 hover:bg-red-50 hover:text-red-600 border border-black flex items-center justify-center font-mono font-bold text-sm transition-colors" aria-label="Close authentication modal">
        ✕
      </button>

      <!-- VIEW 1: SIGN IN -->
      <div id="auth-view-login">
        <div class="text-center pt-1 mb-4">
          <div class="w-12 h-12 rounded-full bg-orange-100 border-2 border-orange-500 mx-auto flex items-center justify-center text-2xl mb-2">
            🔐
          </div>
          <h3 id="auth-modal-title" class="text-xl font-bold font-mono text-gray-900">
            Private Authentication
          </h3>
          <p class="text-xs text-gray-600 mt-1">
            Protected workspace for <strong>Oluwafemi David</strong>. Re-authentication required on every entry.
          </p>
        </div>

        <div id="lockout-banner" class="hidden mb-3 p-3 bg-red-100 border-2 border-red-500 rounded-lg text-red-900 text-xs font-mono">
          <div class="flex items-center gap-1.5 font-bold mb-1">
            <span>⛔</span> <span>Account Access Locked</span>
          </div>
          <div id="lockout-countdown" class="text-[11px] leading-tight">
            Too many failed attempts. Try again in 15:00.
          </div>
        </div>

        <div id="caps-lock-warning" class="hidden mb-2 p-2 bg-amber-50 border border-amber-400 rounded text-amber-800 text-[11px] font-mono flex items-center gap-1">
          <span>⚠️</span> <span>Caps Lock is ON. Passwords are case-sensitive.</span>
        </div>

        <div id="auth-error-msg" class="hidden mb-3 p-2.5 bg-red-50 border border-red-300 rounded text-red-700 text-xs font-mono flex items-center gap-1.5">
          <span>⚠️</span> <span id="auth-error-text">Incorrect email or password.</span>
        </div>

        <form id="admin-login-form" class="space-y-3">
          <div>
            <label for="admin-email-input" class="block text-xs font-mono font-bold text-gray-700 mb-1">Account Email</label>
            <input 
              type="email" 
              id="admin-email-input" 
              required 
              value="davidbryght@gmail.com"
              autocomplete="username"
              class="w-full px-3 py-2 rounded-lg border-2 border-black font-mono text-xs bg-stone-100 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500" 
            />
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <label for="admin-password-input" class="block text-xs font-mono font-bold text-gray-700">Password</label>
              <button type="button" id="toggle-login-password-btn" class="text-[11px] font-mono text-orange-600 hover:text-orange-700 underline">
                Show
              </button>
            </div>
            <div class="relative">
              <input 
                type="password" 
                id="admin-password-input" 
                required 
                placeholder="Enter password..." 
                autocomplete="current-password"
                class="w-full px-3 py-2 rounded-lg border-2 border-black font-mono text-sm bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 pr-10" 
              />
            </div>
          </div>

          <button 
            type="submit" 
            id="login-submit-btn" 
            class="btn-mono-cta w-full justify-center text-center font-mono text-xs py-2.5 bg-orange-600 hover:bg-orange-700 border-black shadow-[3px_3px_0px_#000] mt-2"
          >
            <span id="login-btn-spinner" class="hidden inline-block animate-spin mr-1">⏳</span>
            <span id="login-btn-text">Sign in to Private Space</span>
            <span>🔓</span>
          </button>
        </form>

        <div class="mt-4 pt-3 border-t border-gray-200 text-center">
          <button type="button" id="forgot-password-trigger" class="text-xs font-mono text-gray-500 hover:text-orange-600 underline">
            Forgot password? (Email Recovery Link)
          </button>
        </div>
      </div>

      <!-- VIEW 2: TWO-FACTOR TOTP CHALLENGE -->
      <div id="auth-view-mfa" class="hidden">
        <div class="text-center pt-1 mb-4">
          <div class="w-12 h-12 rounded-full bg-blue-100 border-2 border-blue-500 mx-auto flex items-center justify-center text-2xl mb-2">
            🛡️
          </div>
          <h3 class="text-xl font-bold font-mono text-gray-900">
            Two-Factor Challenge
          </h3>
          <p class="text-xs text-gray-600 mt-1">
            Enter the 6-digit verification code from your authenticator application.
          </p>
        </div>

        <form id="admin-mfa-challenge-form" class="space-y-4">
          <div>
            <label for="mfa-code-input" class="block text-xs font-mono font-bold text-gray-700 mb-1 text-center">6-Digit Code</label>
            <input 
              type="text" 
              id="mfa-code-input" 
              required 
              maxlength="6"
              pattern="[0-9]{6}"
              inputmode="numeric"
              autocomplete="one-time-code"
              placeholder="000000"
              class="w-full text-center text-2xl tracking-widest px-3 py-2.5 rounded-lg border-2 border-black font-mono bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold" 
            />
          </div>

          <div id="mfa-challenge-error" class="hidden p-2 bg-red-50 border border-red-300 rounded text-red-700 text-xs font-mono text-center">
            Invalid verification code. Please check and try again.
          </div>

          <button 
            type="submit" 
            id="verify-mfa-btn" 
            class="btn-mono-cta w-full justify-center text-center font-mono text-xs py-2.5 bg-blue-600 hover:bg-blue-700 border-black shadow-[3px_3px_0px_#000]"
          >
            <span>Verify & Proceed</span>
            <span>✓</span>
          </button>

          <button 
            type="button" 
            id="cancel-mfa-btn" 
            class="w-full text-center font-mono text-xs text-gray-500 hover:text-gray-800 underline mt-2"
          >
            Cancel and Sign Out
          </button>
        </form>
      </div>

      <!-- VIEW 3: FORGOT PASSWORD -->
      <div id="auth-view-forgot" class="hidden">
        <div class="text-center pt-1 mb-4">
          <div class="w-12 h-12 rounded-full bg-purple-100 border-2 border-purple-500 mx-auto flex items-center justify-center text-2xl mb-2">
            ✉️
          </div>
          <h3 class="text-xl font-bold font-mono text-gray-900">
            Password Recovery
          </h3>
          <p class="text-xs text-gray-600 mt-1">
            Send a recovery link to the authorized email address on file.
          </p>
        </div>

        <form id="admin-forgot-form" class="space-y-4">
          <div class="p-3 bg-stone-50 rounded-lg border border-gray-200 text-xs font-mono text-gray-700">
            Authorized Email: <strong>davidbryght@gmail.com</strong>
          </div>

          <div id="forgot-feedback-box" class="hidden p-3 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-800 text-xs font-mono">
            ✓ If this account exists, a password reset link has been dispatched to your inbox.
          </div>

          <button 
            type="submit" 
            id="send-reset-btn" 
            class="btn-mono-cta w-full justify-center text-center font-mono text-xs py-2.5 bg-purple-600 hover:bg-purple-700 border-black shadow-[3px_3px_0px_#000]"
          >
            <span>Send Reset Email</span>
            <span>✉️</span>
          </button>

          <button 
            type="button" 
            id="back-to-login-btn" 
            class="w-full text-center font-mono text-xs text-gray-500 hover:text-gray-800 underline mt-2"
          >
            ← Back to Login
          </button>
        </form>
      </div>

      <!-- VIEW 4: SET NEW PASSWORD VIA EMAIL LINK -->
      <div id="auth-view-reset" class="hidden">
        <div class="text-center pt-1 mb-3">
          <div class="w-12 h-12 rounded-full bg-emerald-100 border-2 border-emerald-500 mx-auto flex items-center justify-center text-2xl mb-2">
            🔑
          </div>
          <h3 class="text-xl font-bold font-mono text-gray-900">
            Set New Password
          </h3>
          <p class="text-xs text-gray-600 mt-1">
            Confirmed email recovery session. Enter your new password below.
          </p>
        </div>

        <form id="admin-reset-form" class="space-y-3">
          <div>
            <div class="flex items-center justify-between mb-1">
              <label for="new-password-input" class="block text-xs font-mono font-bold text-gray-700">New Password</label>
              <button type="button" id="gen-reset-pwd-btn" class="text-[11px] font-mono text-emerald-700 hover:underline">
                🎲 Generate Strong
              </button>
            </div>
            <input 
              type="password" 
              id="new-password-input" 
              required 
              placeholder="At least 12 characters..."
              autocomplete="new-password"
              class="w-full px-3 py-2 rounded-lg border-2 border-black font-mono text-xs bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500" 
            />
          </div>

          <div>
            <div class="flex items-center justify-between text-[11px] font-mono text-gray-600 mb-1">
              <span>Password Strength:</span>
              <span id="strength-label" class="font-bold text-red-600">Too Weak</span>
            </div>
            <div class="w-full h-2 bg-gray-200 rounded-full overflow-hidden border border-gray-300">
              <div id="strength-bar" class="h-full bg-red-500 w-1/12 transition-all duration-300"></div>
            </div>
          </div>

          <div class="p-2.5 bg-stone-50 border border-gray-300 rounded text-[11px] font-mono space-y-1 text-gray-700">
            <div id="rule-len" class="flex items-center gap-1.5 text-gray-400"><span>○</span> 12+ Characters</div>
            <div id="rule-upper" class="flex items-center gap-1.5 text-gray-400"><span>○</span> Uppercase Letter (A-Z)</div>
            <div id="rule-lower" class="flex items-center gap-1.5 text-gray-400"><span>○</span> Lowercase Letter (a-z)</div>
            <div id="rule-num" class="flex items-center gap-1.5 text-gray-400"><span>○</span> Number (0-9)</div>
            <div id="rule-sym" class="flex items-center gap-1.5 text-gray-400"><span>○</span> Special Symbol (!@#$%...)</div>
            <div id="rule-name" class="flex items-center gap-1.5 text-gray-400"><span>○</span> No Personal Names (Femi, David, Bryght)</div>
            <div id="rule-hibp" class="flex items-center gap-1.5 text-gray-400"><span>○</span> Not in Have I Been Pwned breaches</div>
          </div>

          <div>
            <label for="confirm-password-input" class="block text-xs font-mono font-bold text-gray-700 mb-1">Confirm New Password</label>
            <input 
              type="password" 
              id="confirm-password-input" 
              required 
              placeholder="Re-enter password..."
              autocomplete="new-password"
              class="w-full px-3 py-2 rounded-lg border-2 border-black font-mono text-xs bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500" 
            />
          </div>

          <button type="submit" id="submit-new-password-btn" class="btn-mono-cta w-full justify-center text-center font-mono text-xs py-2.5 bg-emerald-600 hover:bg-emerald-700 border-black shadow-[3px_3px_0px_#000]">
            <span>Save New Password & Sign In</span>
            <span>💾</span>
          </button>
        </form>
      </div>
    </div>
  </div>

  <!-- SHOWCASE & ADMIN WORKSPACE MODAL -->
  <div id="showcase-manager-modal" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal-content-box bg-stone-50 w-full max-w-3xl rounded-2xl border-3 border-black shadow-[8px_8px_0px_#000] p-6 sm:p-8 relative max-h-[90vh] overflow-y-auto">
      <div class="washi-tape" style="top: -12px; left: 40%; width: 90px; background-color: rgba(251, 146, 60, 0.9);"></div>

      <button id="close-modal-btn" class="absolute top-4 right-4 w-9 h-9 rounded-full bg-white border-2 border-black flex items-center justify-center font-mono font-bold text-lg hover:bg-red-50 hover:text-red-600 transition-colors" title="Close Workspace">
        ✕
      </button>

      <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="flex items-center gap-2 text-xs font-mono font-bold text-orange-600 uppercase tracking-wider">
            <span>⚡</span> Authenticated Workspace · <strong>davidbryght@gmail.com</strong>
          </div>
          <h3 id="modal-title" class="text-2xl sm:text-3xl font-extrabold text-gray-900 font-mono tracking-tight mt-0.5">
            Private Portfolio Workspace
          </h3>
        </div>
        <div class="flex items-center gap-2.5">
          <!-- Live Active Visitor Pill -->
          <div class="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-emerald-100 border border-emerald-400 text-emerald-900 text-xs font-mono font-bold">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span id="admin-active-visitors-count">0</span> Active Now
          </div>

          <!-- Notification Bell Button -->
          <div class="relative">
            <button 
              type="button" 
              id="admin-notification-bell-btn" 
              class="relative p-2 rounded-lg border-2 border-black bg-white hover:bg-orange-50 text-gray-800 font-bold transition-all shadow-[2px_2px_0px_#000] active:translate-y-0.5" 
              aria-label="Visitor Activity Notifications" 
              title="Visitor Activity Notifications"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
              </svg>
              <span id="admin-notif-badge" class="hidden absolute -top-1.5 -right-1.5 bg-red-600 text-white font-mono font-bold text-[10px] rounded-full px-1.5 py-0.5 leading-none shadow border border-white">
                0
              </span>
            </button>
          </div>

          <button id="header-signout-btn" class="px-3 py-1.5 rounded-lg border-2 border-black bg-red-100 hover:bg-red-200 text-red-800 font-mono text-xs font-bold flex items-center gap-1 transition-all">
            <span>🚪 Sign out</span>
          </button>
        </div>
      </div>

      <!-- Tabs Navigation -->
      <div class="flex flex-wrap border-b-2 border-black gap-1 mb-5 font-mono text-xs font-bold">
        <button id="tab-btn-websites" class="px-3 py-2 border-t-2 border-l-2 border-r-2 border-black rounded-t-lg bg-orange-500 text-white flex items-center gap-1">
          <span>🌐</span> Samples (<span id="modal-website-count">0</span>)
        </button>
        <button id="tab-btn-testimonials" class="px-3 py-2 border-t-2 border-l-2 border-r-2 border-transparent rounded-t-lg bg-white/70 text-gray-700 hover:bg-stone-200 transition-colors flex items-center gap-1">
          <span>💬</span> Reviews (<span id="modal-review-count">0</span>)
        </button>
        <button id="tab-btn-visitors" class="px-3 py-2 border-t-2 border-l-2 border-r-2 border-transparent rounded-t-lg bg-white/70 text-gray-700 hover:bg-stone-200 transition-colors flex items-center gap-1">
          <span>👥</span> Visitors (<span id="modal-visitors-count">0</span>)
        </button>
        <button id="tab-btn-chatbot" class="px-3 py-2 border-t-2 border-l-2 border-r-2 border-transparent rounded-t-lg bg-white/70 text-gray-700 hover:bg-stone-200 transition-colors flex items-center gap-1">
          <span>🤖</span> Leads (<span id="modal-chatbot-count">0</span>)
        </button>
        <button id="tab-btn-backup" class="px-3 py-2 border-t-2 border-l-2 border-r-2 border-transparent rounded-t-lg bg-white/70 text-gray-700 hover:bg-stone-200 transition-colors flex items-center gap-1">
          <span>💾</span> Backup
        </button>
        <button id="tab-btn-security" class="px-3 py-2 border-t-2 border-l-2 border-r-2 border-transparent rounded-t-lg bg-white/70 text-gray-700 hover:bg-stone-200 transition-colors flex items-center gap-1">
          <span>🛡️</span> Security &amp; MFA
        </button>
        <button id="tab-btn-logs" class="px-3 py-2 border-t-2 border-l-2 border-r-2 border-transparent rounded-t-lg bg-white/70 text-gray-700 hover:bg-stone-200 transition-colors flex items-center gap-1">
          <span>📜</span> Logs
        </button>
      </div>

      <!-- Tab 1: Websites Management Content -->
      <div id="tab-content-websites" class="space-y-6">
        <form id="website-sample-form" class="bg-white p-5 rounded-xl border-2 border-black shadow-[3px_3px_0px_#000] space-y-3">
          <div class="font-mono font-bold text-sm text-gray-900 flex items-center justify-between">
            <span id="form-website-heading">➕ Add New Website Sample</span>
            <button type="button" id="reset-website-form-btn" class="text-[11px] text-gray-500 underline font-normal hidden">Cancel Editing</button>
          </div>
          <input type="hidden" id="edit-website-id" value="" />

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-mono font-bold text-gray-700 mb-1">Website Title *</label>
              <input type="text" id="sample-title" required placeholder="e.g. Bella Luxe Boutique" class="w-full px-3 py-2 rounded-lg border border-gray-300 font-sans text-xs bg-stone-50" />
            </div>
            <div>
              <label class="block text-xs font-mono font-bold text-gray-700 mb-1">Category *</label>
              <select id="sample-category" class="w-full px-3 py-2 rounded-lg border border-gray-300 font-sans text-xs bg-stone-50">
                <option value="E-Commerce">E-Commerce</option>
                <option value="Web App">Web App</option>
                <option value="Corporate">Corporate</option>
                <option value="FinTech">FinTech</option>
                <option value="Custom">Custom</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-mono font-bold text-gray-700 mb-1">Website Screenshot URL</label>
              <input type="url" id="sample-image-url" placeholder="Paste image link (Cloudinary, etc.)" class="w-full px-3 py-2 rounded-lg border border-gray-300 font-sans text-xs bg-stone-50" />
            </div>
            <div>
              <label class="block text-xs font-mono font-bold text-gray-700 mb-1">OR Choose from Device</label>
              <input type="file" id="sample-file-input" accept="image/*" class="w-full text-xs font-mono text-gray-600 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-orange-100 file:text-orange-800 hover:file:bg-orange-200" />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-mono font-bold text-gray-700 mb-1">Live Website URL</label>
              <input type="url" id="sample-live-url" placeholder="https://example.com" class="w-full px-3 py-2 rounded-lg border border-gray-300 font-sans text-xs bg-stone-50" />
            </div>
            <div>
              <label class="block text-xs font-mono font-bold text-gray-700 mb-1">Tech Stack (comma-separated)</label>
              <input type="text" id="sample-tech" placeholder="React, Node.js, Paystack, Tailwind" class="w-full px-3 py-2 rounded-lg border border-gray-300 font-sans text-xs bg-stone-50" />
            </div>
          </div>

          <div>
            <label class="block text-xs font-mono font-bold text-gray-700 mb-1">Description / Results *</label>
            <textarea id="sample-desc" rows="2" required placeholder="What problem this website solved, key features, performance metrics..." class="w-full px-3 py-2 rounded-lg border border-gray-300 font-sans text-xs bg-stone-50"></textarea>
          </div>

          <button type="submit" id="save-website-btn" class="btn-mono-cta text-xs py-2 px-4 bg-orange-600 hover:bg-orange-700 border-black w-full justify-center">
            <span>💾 Save Website Sample</span>
          </button>
        </form>

        <div>
          <div class="font-mono font-bold text-xs uppercase tracking-wider text-gray-600 mb-3">
            Existing Website Samples in Storage:
          </div>
          <div id="modal-websites-list" class="space-y-2 max-h-56 overflow-y-auto pr-1"></div>
        </div>
      </div>

      <!-- Tab 2: Testimonials Management Content -->
      <div id="tab-content-testimonials" class="space-y-6 hidden">
        <form id="client-review-form" class="bg-white p-5 rounded-xl border-2 border-black shadow-[3px_3px_0px_#000] space-y-3">
          <div class="font-mono font-bold text-sm text-gray-900 flex items-center justify-between">
            <span id="form-review-heading">➕ Add New Client Review</span>
            <button type="button" id="reset-review-form-btn" class="text-[11px] text-gray-500 underline font-normal hidden">Cancel Editing</button>
          </div>
          <input type="hidden" id="edit-review-id" value="" />

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-mono font-bold text-gray-700 mb-1">Client Name *</label>
              <input type="text" id="review-name" required placeholder="e.g. Alhaji Babatunde" class="w-full px-3 py-2 rounded-lg border border-gray-300 font-sans text-xs bg-stone-50" />
            </div>
            <div>
              <label class="block text-xs font-mono font-bold text-gray-700 mb-1">Role & Company *</label>
              <input type="text" id="review-company" required placeholder="e.g. CEO, Babatunde Logistics" class="w-full px-3 py-2 rounded-lg border border-gray-300 font-sans text-xs bg-stone-50" />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-mono font-bold text-gray-700 mb-1">Rating (Stars)</label>
              <select id="review-stars" class="w-full px-3 py-2 rounded-lg border border-gray-300 font-sans text-xs bg-stone-50">
                <option value="5" selected>★★★★★ (5 Stars)</option>
                <option value="4">★★★★☆ (4 Stars)</option>
                <option value="3">★★★☆☆ (3 Stars)</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-mono font-bold text-gray-700 mb-1">Sticky Note Color Theme</label>
              <select id="review-color" class="w-full px-3 py-2 rounded-lg border border-gray-300 font-sans text-xs bg-stone-50">
                <option value="yellow" selected>Post-it Yellow</option>
                <option value="emerald">Mint Green</option>
                <option value="rose">Soft Pink</option>
                <option value="sky">Pastel Sky Blue</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-xs font-mono font-bold text-gray-700 mb-1">Client Quote / Testimonial *</label>
            <textarea id="review-quote" rows="3" required placeholder="Paste the feedback from client (WhatsApp, email, or formal review)..." class="w-full px-3 py-2 rounded-lg border border-gray-300 font-sans text-xs bg-stone-50"></textarea>
          </div>

          <button type="submit" id="save-review-btn" class="btn-mono-cta text-xs py-2 px-4 bg-emerald-600 hover:bg-emerald-700 border-black w-full justify-center">
            <span>💾 Save Client Review</span>
          </button>
        </form>

        <div>
          <div class="font-mono font-bold text-xs uppercase tracking-wider text-gray-600 mb-3">
            Current Client Reviews in Storage:
          </div>
          <div id="modal-reviews-list" class="space-y-2 max-h-56 overflow-y-auto pr-1"></div>
        </div>
      </div>

      <!-- Tab 3: Backup & Export Content -->
      <div id="tab-content-backup" class="space-y-6 hidden">
        <div class="bg-white p-5 rounded-xl border border-gray-300 space-y-4">
          <div>
            <h4 class="font-mono font-bold text-sm text-gray-900">Export Showcase Data</h4>
            <p class="text-xs text-gray-600 mt-1">Download your current custom website samples and reviews as a JSON backup.</p>
            <button type="button" id="export-json-btn" class="mt-2 btn-mono-cta text-xs py-1.5 px-3 bg-stone-900 text-white border-black">
              <span>Export to JSON file</span> 📥
            </button>
          </div>

          <div class="pt-4 border-t border-gray-200">
            <h4 class="font-mono font-bold text-sm text-gray-900">Import Showcase Data</h4>
            <p class="text-xs text-gray-600 mt-1">Restore your website samples and reviews from a previously exported JSON backup.</p>
            <textarea id="import-json-text" rows="3" placeholder="Paste exported JSON content here..." class="w-full mt-2 p-2 rounded border border-gray-300 font-mono text-xs bg-stone-50"></textarea>
            <button type="button" id="import-json-btn" class="mt-2 btn-mono-cta text-xs py-1.5 px-3 bg-stone-900 text-white border-black">
              <span>Import JSON Data</span> 📤
            </button>
          </div>

          <div class="pt-4 border-t border-gray-200">
            <h4 class="font-mono font-bold text-sm text-red-600">Reset to Defaults</h4>
            <p class="text-xs text-gray-600 mt-1">Restore default website samples and testimonials.</p>
            <button type="button" id="reset-defaults-btn" class="mt-2 px-3 py-1.5 rounded border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 font-mono text-xs font-bold transition-colors">
              Reset Showcase to Defaults
            </button>
          </div>
        </div>
      </div>

      <!-- Tab 4: Security & Two-Factor Authentication -->
      <div id="tab-content-security" class="space-y-6 hidden">
        <div class="bg-white p-5 rounded-xl border border-gray-300 space-y-5 font-mono text-xs">
          <div>
            <div class="font-bold text-sm text-gray-900 flex items-center gap-2">
              <span>🛡️</span> Authenticator App Two-Factor Authentication (TOTP)
            </div>
            <p class="text-gray-600 mt-1">
              Add Google Authenticator, Authy, or 1Password to require a dynamic 6-digit code on every login.
            </p>
          </div>

          <div id="mfa-status-badge" class="p-3 bg-stone-50 rounded-lg border border-gray-200 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span id="mfa-dot" class="w-2.5 h-2.5 rounded-full bg-gray-400"></span>
              <span id="mfa-text" class="font-bold text-gray-700">Checking 2FA status...</span>
            </div>
            <button type="button" id="enroll-mfa-btn" class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold transition-colors">
              Enable 2FA
            </button>
            <button type="button" id="unenroll-mfa-btn" class="hidden px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded font-bold transition-colors">
              Disable 2FA
            </button>
          </div>

          <div id="mfa-setup-box" class="hidden p-4 bg-blue-50 border-2 border-blue-400 rounded-xl space-y-3">
            <div class="font-bold text-blue-900 text-sm">Scan QR Code in Authenticator App</div>
            <div class="flex flex-col sm:flex-row items-center gap-4 bg-white p-3 rounded-lg border border-blue-200">
              <div id="mfa-qr-container" class="w-36 h-36 bg-gray-100 flex items-center justify-center border rounded">
                <span class="text-gray-400 text-[10px]">Loading QR...</span>
              </div>
              <div class="space-y-1.5 flex-1">
                <div class="text-[11px] text-gray-600">Or manually enter secret key:</div>
                <code id="mfa-secret-code" class="block p-1.5 bg-stone-100 rounded text-xs select-all text-blue-900 break-all font-bold"></code>
                <div class="text-[10px] text-gray-500">Account: davidbryght@gmail.com</div>
              </div>
            </div>

            <div class="pt-2">
              <label for="enroll-code-input" class="block font-bold text-gray-800 mb-1">Enter 6-Digit Code from App to Confirm:</label>
              <div class="flex items-center gap-2">
                <input type="text" id="enroll-code-input" maxlength="6" pattern="[0-9]{6}" placeholder="123456" class="px-3 py-1.5 rounded border border-gray-300 font-bold tracking-widest text-sm w-32 bg-white" />
                <button type="button" id="confirm-mfa-enroll-btn" class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold">Verify & Activate</button>
                <button type="button" id="cancel-mfa-setup-btn" class="px-3 py-1.5 text-gray-600 hover:underline">Cancel</button>
              </div>
            </div>
          </div>

          <div class="pt-4 border-t border-gray-200">
            <div class="font-bold text-sm text-gray-900 mb-1">Session Management</div>
            <p class="text-gray-600 mb-3">Terminate active sessions across all devices or revoke access immediately.</p>
            <button type="button" id="signout-all-devices-btn" class="px-3 py-1.5 bg-stone-900 hover:bg-black text-white rounded font-bold">
              Sign Out All Devices (Global Revocation)
            </button>
          </div>
        </div>
      </div>

      <!-- Tab 5: Security Logs Content -->
      <div id="tab-content-logs" class="space-y-6 hidden">
        <div class="bg-white p-5 rounded-xl border border-gray-300 space-y-4 font-mono text-xs">
          <div class="flex items-center justify-between">
            <div>
              <div class="font-bold text-sm text-gray-900">Security & Authentication Audit Log</div>
              <p class="text-gray-500 text-[11px] mt-0.5">Real-time audit log stored in Supabase <code>activity_logs</code> table.</p>
            </div>
            <button type="button" id="refresh-logs-btn" class="btn-outline text-xs py-1 px-2.5 font-mono border-black">
              <span>🔄 Refresh</span>
            </button>
          </div>

          <div class="overflow-x-auto border border-gray-200 rounded-lg max-h-72 overflow-y-auto">
            <table class="w-full text-left border-collapse text-[11px]">
              <thead class="bg-stone-100 border-b border-gray-200 sticky top-0 font-bold text-gray-700">
                <tr>
                  <th class="p-2.5">Timestamp</th>
                  <th class="p-2.5">Event</th>
                  <th class="p-2.5">Target</th>
                  <th class="p-2.5">User Agent</th>
                </tr>
              </thead>
              <tbody id="security-logs-tbody" class="divide-y divide-gray-100">
                <tr><td colspan="4" class="p-4 text-center text-gray-500 italic">Click Refresh to load security events.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Tab 6: Chatbot Leads Content -->
      <div id="tab-content-chatbot" class="space-y-6 hidden">
        <div class="flex flex-wrap items-center justify-between gap-3 bg-stone-100 p-4 rounded-xl border border-gray-300 font-mono text-xs">
          <div>
            <div class="font-bold text-sm text-gray-900 flex items-center gap-1.5">
              <span>🤖</span> AI Assistant Captured Leads & Consultations
            </div>
            <p class="text-[11px] text-gray-600 mt-0.5">
              Live visitor interactions, captured consultations, and discount claims from <code>chat_conversations</code>.
            </p>
          </div>
          <button type="button" id="refresh-chats-btn" class="btn-outline text-xs py-1.5 px-2.5 font-mono border-black">
            <span>🔄 Refresh</span>
          </button>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
          <div class="p-3 bg-stone-50 border border-gray-200 rounded-lg">
            <div class="text-[10px] text-gray-500 uppercase">Today's Chats</div>
            <div id="stat-chats-today" class="text-lg font-bold text-gray-900 mt-0.5">0</div>
          </div>
          <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <div class="text-[10px] text-emerald-700 uppercase">Leads Captured</div>
            <div id="stat-leads-captured" class="text-lg font-bold text-emerald-800 mt-0.5">0</div>
          </div>
          <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div class="text-[10px] text-blue-700 uppercase">Consultations</div>
            <div id="stat-consultations" class="text-lg font-bold text-blue-800 mt-0.5">0</div>
          </div>
          <div class="p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <div class="text-[10px] text-orange-700 uppercase">Discount Claims</div>
            <div id="stat-discounts" class="text-lg font-bold text-orange-800 mt-0.5">0</div>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap gap-1.5 font-mono text-xs" id="chat-filter-pills">
            <button type="button" class="chat-tab-filter-btn px-2.5 py-1 rounded-md bg-stone-900 text-white font-bold" data-filter="all">All</button>
            <button type="button" class="chat-tab-filter-btn px-2.5 py-1 rounded-md bg-stone-100 text-gray-700 hover:bg-stone-200 font-bold" data-filter="consultation">📞 Consultations</button>
            <button type="button" class="chat-tab-filter-btn px-2.5 py-1 rounded-md bg-stone-100 text-gray-700 hover:bg-stone-200 font-bold" data-filter="discount">🎁 Discounts</button>
            <button type="button" class="chat-tab-filter-btn px-2.5 py-1 rounded-md bg-stone-100 text-gray-700 hover:bg-stone-200 font-bold" data-filter="unread">🔴 Unread</button>
          </div>
          <input 
            type="text" 
            id="chat-search-input" 
            placeholder="Search leads by name, phone, email..." 
            class="px-2.5 py-1 border border-gray-300 rounded text-xs font-mono bg-stone-50 w-full sm:w-56"
          />
        </div>

        <div id="admin-chat-conversations-list" class="space-y-2 max-h-72 overflow-y-auto pr-1"></div>

        <div id="admin-transcript-panel" class="hidden p-4 bg-stone-50 rounded-xl border border-gray-300 font-mono text-xs space-y-3">
          <div class="flex items-center justify-between border-b border-gray-200 pb-2">
            <div class="font-bold text-gray-900" id="transcript-visitor-title">Conversation Transcript</div>
            <button type="button" id="close-transcript-btn" class="text-gray-500 hover:text-black font-bold">✕ Close</button>
          </div>
          <div id="transcript-messages-list" class="space-y-2 max-h-60 overflow-y-auto pr-1 p-2 bg-white rounded border border-gray-200"></div>
          <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div class="flex items-center gap-2">
              <label class="text-[11px] text-gray-600">Status:</label>
              <select id="transcript-status-select" class="text-xs font-mono p-1 border rounded bg-white">
                <option value="needs_reply">Needs Reply</option>
                <option value="contacted">Contacted</option>
                <option value="booked">Booked</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div class="flex items-center gap-2">
              <a id="transcript-whatsapp-btn" href="#" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold">
                Reply on WhatsApp 💬
              </a>
              <button type="button" id="delete-conversation-btn" class="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded font-bold border border-red-200">
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 7: Visitors Management & Realtime Activity Content -->
      <div id="tab-content-visitors" class="space-y-6 hidden">
        <div class="flex flex-wrap items-center justify-between gap-3 bg-stone-100 p-4 rounded-xl border border-gray-300 font-mono text-xs">
          <div>
            <div class="font-bold text-sm text-gray-900 flex items-center gap-1.5">
              <span>👥</span> Visitor Activity &amp; Session Analytics
            </div>
            <p class="text-[11px] text-gray-600 mt-0.5">
              Live sessions, returning visitors, page journey, and NDPA 2023 compliant telemetry.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" id="ignore-my-device-toggle-btn" class="px-2.5 py-1.5 rounded border border-stone-400 bg-white hover:bg-stone-50 font-mono text-[11px] font-bold text-gray-800">
              📱 Ignore My Device
            </button>
            <button type="button" id="refresh-visitors-btn" class="btn-outline text-xs py-1.5 px-2.5 font-mono border-black">
              <span>🔄 Refresh</span>
            </button>
          </div>
        </div>

        <!-- Metric Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
          <div class="p-3 bg-emerald-50 border border-emerald-300 rounded-lg">
            <div class="text-[10px] text-emerald-800 uppercase flex items-center gap-1">
              <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Active Now
            </div>
            <div id="stat-active-visitors" class="text-xl font-bold text-emerald-900 mt-0.5">0</div>
          </div>
          <div class="p-3 bg-stone-50 border border-gray-200 rounded-lg">
            <div class="text-[10px] text-gray-500 uppercase">Total Today</div>
            <div id="stat-visitors-today" class="text-xl font-bold text-gray-900 mt-0.5">0</div>
          </div>
          <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div class="text-[10px] text-blue-700 uppercase">Returning Rate</div>
            <div id="stat-returning-rate" class="text-xl font-bold text-blue-800 mt-0.5">0%</div>
          </div>
          <div class="p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <div class="text-[10px] text-purple-700 uppercase">Avg. Duration</div>
            <div id="stat-avg-duration" class="text-xl font-bold text-purple-800 mt-0.5">0s</div>
          </div>
        </div>

        <!-- 7-Day Activity Chart Card -->
        <div class="p-4 bg-white rounded-xl border border-gray-200 shadow-sm font-mono text-xs space-y-2">
          <div class="flex items-center justify-between">
            <div class="font-bold text-gray-900 flex items-center gap-1">
              <span>📊</span> 7-Day Visitor Volume &amp; Return Rate
            </div>
            <div class="flex items-center gap-3 text-[10px] text-gray-500">
              <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 bg-orange-500 rounded-sm"></span> New Visits</span>
              <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 bg-blue-600 rounded-sm"></span> Returning</span>
            </div>
          </div>
          <div id="visitor-activity-chart-wrap" class="w-full h-36 pt-2">
            <!-- Rendered SVG Chart -->
          </div>
        </div>

        <!-- Search & Filter Controls -->
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap gap-1.5 font-mono text-xs" id="visitor-filter-pills">
            <button type="button" class="visitor-filter-btn px-2.5 py-1 rounded-md bg-stone-900 text-white font-bold" data-filter="all">All Visitors</button>
            <button type="button" class="visitor-filter-btn px-2.5 py-1 rounded-md bg-stone-100 text-gray-700 hover:bg-stone-200 font-bold" data-filter="active">🟢 Active Now</button>
            <button type="button" class="visitor-filter-btn px-2.5 py-1 rounded-md bg-stone-100 text-gray-700 hover:bg-stone-200 font-bold" data-filter="returning">🔄 Returning</button>
            <button type="button" class="visitor-filter-btn px-2.5 py-1 rounded-md bg-stone-100 text-gray-700 hover:bg-stone-200 font-bold" data-filter="leads">🎯 Has Lead Info</button>
          </div>
          <input 
            type="text" 
            id="visitor-search-input" 
            placeholder="Search by city, country, device, or notes..." 
            class="px-2.5 py-1 border border-gray-300 rounded text-xs font-mono bg-stone-50 w-full sm:w-60"
          />
        </div>

        <!-- Visitors Table -->
        <div class="border border-gray-300 rounded-xl overflow-hidden bg-white shadow-sm font-mono text-xs">
          <div class="max-h-80 overflow-y-auto">
            <table class="w-full text-left">
              <thead class="bg-stone-100 border-b border-gray-200 sticky top-0 font-bold text-gray-700">
                <tr>
                  <th class="p-2.5">Visitor / Status</th>
                  <th class="p-2.5">Location</th>
                  <th class="p-2.5">Device / OS</th>
                  <th class="p-2.5">Visits</th>
                  <th class="p-2.5">Last Seen</th>
                  <th class="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody id="visitors-table-tbody" class="divide-y divide-gray-100">
                <tr><td colspan="6" class="p-4 text-center text-gray-500 italic">Click Refresh to load visitor directory.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>

    <!-- NOTIFICATION CENTER DROPDOWN PANEL -->
    <div id="admin-notification-center" class="hidden absolute top-20 right-4 sm:right-8 z-[100005] w-[92vw] sm:w-96 bg-stone-50 rounded-2xl border-3 border-black shadow-[8px_8px_0px_#000] p-4 font-mono text-xs space-y-3">
      <div class="flex items-center justify-between border-b-2 border-black pb-2">
        <div class="flex items-center gap-2">
          <span class="text-lg">🔔</span>
          <span class="font-bold text-sm text-gray-900">Activity Notifications</span>
          <span id="notif-unread-count-pill" class="px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300 text-[10px] font-bold">0 New</span>
        </div>
        <div class="flex items-center gap-1.5">
          <button type="button" id="notif-sound-toggle-btn" class="p-1 rounded bg-white hover:bg-stone-100 border border-gray-300 text-gray-700 text-sm" title="Toggle Sound Chime">
            🔔
          </button>
          <button type="button" id="notif-push-toggle-btn" class="p-1 rounded bg-white hover:bg-stone-100 border border-gray-300 text-gray-700 text-sm" title="Toggle Push Notifications">
            📲
          </button>
          <button type="button" id="close-notif-center-btn" class="p-1 rounded hover:bg-red-50 text-gray-600 hover:text-red-600 font-bold text-sm">
            ✕
          </button>
        </div>
      </div>

      <!-- Controls & Quiet Hours -->
      <div class="flex items-center justify-between text-[11px] text-gray-600 bg-white p-2 rounded-lg border border-gray-200">
        <div class="flex items-center gap-1.5">
          <span id="quiet-hours-indicator" title="Quiet Hours 23:00 - 07:00 WAT">🌙 Quiet: 23:00-07:00</span>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" id="notif-mark-all-read-btn" class="text-orange-600 hover:underline font-bold">Mark all read</button>
          <span>·</span>
          <button type="button" id="notif-clear-all-btn" class="text-gray-500 hover:text-red-600 font-bold">Clear</button>
        </div>
      </div>

      <!-- Notification Filters -->
      <div class="flex flex-wrap gap-1" id="notif-filter-pills">
        <button type="button" class="notif-filter-btn px-2 py-0.5 rounded bg-stone-900 text-white font-bold text-[10px]" data-filter="all">All</button>
        <button type="button" class="notif-filter-btn px-2 py-0.5 rounded bg-white text-gray-700 border border-gray-200 hover:bg-stone-100 font-bold text-[10px]" data-filter="unread">Unread</button>
        <button type="button" class="notif-filter-btn px-2 py-0.5 rounded bg-white text-gray-700 border border-gray-200 hover:bg-stone-100 font-bold text-[10px]" data-filter="arrival">Arrivals</button>
        <button type="button" class="notif-filter-btn px-2 py-0.5 rounded bg-white text-gray-700 border border-gray-200 hover:bg-stone-100 font-bold text-[10px]" data-filter="departure">Departures</button>
        <button type="button" class="notif-filter-btn px-2 py-0.5 rounded bg-white text-gray-700 border border-gray-200 hover:bg-stone-100 font-bold text-[10px]" data-filter="leads">Leads / Actions</button>
      </div>

      <!-- Notifications Feed -->
      <div id="admin-notifications-feed" class="space-y-2 max-h-80 overflow-y-auto pr-1">
        <div class="p-6 text-center text-xs text-gray-400 italic">No activity notifications yet.</div>
      </div>
    </div>

    <!-- VISITOR DETAIL DRAWER (SLIDE OVER) -->
    <div id="visitor-detail-drawer" class="hidden fixed inset-y-0 right-0 z-[100010] w-full max-w-md bg-stone-50 border-l-3 border-black shadow-[-8px_0px_0px_rgba(0,0,0,0.4)] p-6 font-mono text-xs overflow-y-auto space-y-4">
      <div class="flex items-center justify-between border-b-2 border-black pb-3">
        <div>
          <div class="text-[10px] text-gray-500 uppercase tracking-wider">Visitor Profile</div>
          <div id="drawer-visitor-title" class="text-base font-extrabold text-gray-900">Visitor Details</div>
        </div>
        <button type="button" id="close-visitor-drawer-btn" class="w-8 h-8 rounded-full bg-white border-2 border-black flex items-center justify-center font-bold hover:bg-red-50 text-gray-700 hover:text-red-600 transition-colors">
          ✕
        </button>
      </div>

      <!-- Status & Geo Card -->
      <div class="bg-white p-3.5 rounded-xl border border-gray-300 space-y-2">
        <div class="flex items-center justify-between">
          <span id="drawer-live-badge" class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-700">Offline</span>
          <span id="drawer-visits-count" class="text-[11px] font-bold text-orange-600">1 visit</span>
        </div>
        <div class="grid grid-cols-2 gap-2 pt-1 text-[11px]">
          <div>
            <span class="text-gray-400 block text-[10px]">Location:</span>
            <span id="drawer-location" class="font-bold text-gray-800">Nigeria</span>
          </div>
          <div>
            <span class="text-gray-400 block text-[10px]">Device &amp; OS:</span>
            <span id="drawer-device" class="font-bold text-gray-800">Mobile (Android)</span>
          </div>
          <div>
            <span class="text-gray-400 block text-[10px]">Browser:</span>
            <span id="drawer-browser" class="font-bold text-gray-800">Chrome</span>
          </div>
          <div>
            <span class="text-gray-400 block text-[10px]">First Seen:</span>
            <span id="drawer-first-seen" class="font-bold text-gray-800">Today</span>
          </div>
        </div>
      </div>

      <!-- Linked Lead Info (if any) -->
      <div id="drawer-lead-card" class="hidden bg-emerald-50 border border-emerald-300 p-3.5 rounded-xl space-y-1.5">
        <div class="font-bold text-emerald-900 text-xs flex items-center gap-1.5">
          <span>🎯</span> Identified Client Lead
        </div>
        <div id="drawer-lead-details" class="text-[11px] text-emerald-950 space-y-0.5"></div>
      </div>

      <!-- Journey & Timeline -->
      <div class="bg-white p-3.5 rounded-xl border border-gray-300 space-y-2">
        <div class="font-bold text-gray-900 text-xs flex items-center gap-1.5">
          <span>🧭</span> Session Journey &amp; Actions
        </div>
        <div id="drawer-timeline" class="space-y-2 pt-1 max-h-56 overflow-y-auto pr-1"></div>
      </div>

      <!-- Notes & Labels -->
      <div class="bg-white p-3.5 rounded-xl border border-gray-300 space-y-2">
        <div class="font-bold text-gray-900 text-xs flex items-center gap-1.5">
          <span>📝</span> Admin Notes &amp; Labels
        </div>
        <textarea id="drawer-notes-input" rows="2" placeholder="Add custom notes (e.g., Interested in E-commerce quote)..." class="w-full p-2 border border-gray-300 rounded text-xs bg-stone-50"></textarea>
        <div class="flex items-center justify-between pt-1">
          <button type="button" id="save-drawer-notes-btn" class="px-3 py-1 bg-stone-900 text-white rounded font-bold text-[11px]">
            Save Note
          </button>
          <button type="button" id="drawer-toggle-ignore-btn" class="px-2.5 py-1 text-red-600 hover:bg-red-50 rounded border border-red-200 text-[11px] font-bold">
            Ignore Device
          </button>
        </div>
      </div>
    </div>
  </div>

  <style>
    @keyframes bellShake {
      0% { transform: rotate(0); }
      15% { transform: rotate(14deg); }
      30% { transform: rotate(-14deg); }
      45% { transform: rotate(10deg); }
      60% { transform: rotate(-10deg); }
      75% { transform: rotate(6deg); }
      100% { transform: rotate(0); }
    }
    .bell-shake {
      animation: bellShake 0.6s ease-in-out;
    }
  </style>
  `;
}

// Attach all Admin Event Listeners once DOM is injected
function setupAdminEventListeners() {
  const modal = document.getElementById('showcase-manager-modal');
  const authModal = document.getElementById('admin-auth-modal');
  const closeBtn = document.getElementById('close-modal-btn');
  const closeAuthBtn = document.getElementById('close-auth-modal-btn');
  const headerSignoutBtn = document.getElementById('header-signout-btn');
  const staySignedInBtn = document.getElementById('stay-signed-in-btn');

  // Toggle Password
  const togglePwdBtn = document.getElementById('toggle-login-password-btn');
  const loginPwdInput = document.getElementById('admin-password-input');
  if (togglePwdBtn && loginPwdInput) {
    togglePwdBtn.addEventListener('click', () => {
      if (loginPwdInput.type === 'password') {
        loginPwdInput.type = 'text';
        togglePwdBtn.textContent = 'Hide';
      } else {
        loginPwdInput.type = 'password';
        togglePwdBtn.textContent = 'Show';
      }
    });
  }

  // Caps lock
  if (loginPwdInput) {
    loginPwdInput.addEventListener('keyup', (e) => {
      const warn = document.getElementById('caps-lock-warning');
      if (warn) {
        if (e.getModifierState && e.getModifierState('CapsLock')) {
          warn.classList.remove('hidden');
        } else {
          warn.classList.add('hidden');
        }
      }
    });
  }

  // Login Form
  const loginForm = document.getElementById('admin-login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (updateLockoutUI()) return;

      const emailInput = document.getElementById('admin-email-input');
      const pwdInput = document.getElementById('admin-password-input');
      const submitBtn = document.getElementById('login-submit-btn');
      const spinner = document.getElementById('login-btn-spinner');
      const btnText = document.getElementById('login-btn-text');
      const authError = document.getElementById('auth-error-msg');
      const authErrorText = document.getElementById('auth-error-text');

      const email = (emailInput?.value || ADMIN_CONFIG.email).trim().toLowerCase();
      const password = pwdInput?.value || '';

      if (authError) authError.classList.add('hidden');
      if (submitBtn) submitBtn.disabled = true;
      if (spinner) spinner.classList.remove('hidden');
      if (btnText) btnText.textContent = 'Authenticating...';

      const delayMs = Math.min(500 + (memoryFailedAttempts * 600), 4000);
      await new Promise(r => setTimeout(r, delayMs));

      try {
        if (email !== ADMIN_CONFIG.email.toLowerCase()) {
          throw new Error("Invalid credentials");
        }

        const client = getSupabase();
        if (!client) throw new Error("Database client not available");

        const { data, error } = await client.auth.signInWithPassword({
          email: ADMIN_CONFIG.email,
          password
        });

        if (error) throw error;

        clearLockoutState();
        await logSecurityActivity('login_success', { user_id: data.user?.id });

        if (pwdInput) pwdInput.value = '';

        // MFA check
        let isMfaRequired = false;
        try {
          if (client.auth.mfa) {
            const { data: aalData } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
            if (aalData && aalData.nextLevel === 'aal2' && aalData.currentLevel === 'aal1') {
              const { data: factors } = await client.auth.mfa.listFactors();
              const totpFactor = factors?.totp?.find(f => f.status === 'verified');
              if (totpFactor) {
                currentMfaFactorId = totpFactor.id;
                const { data: challenge, error: chErr } = await client.auth.mfa.challenge({ factorId: totpFactor.id });
                if (!chErr && challenge) {
                  currentMfaChallengeId = challenge.id;
                  isMfaRequired = true;
                  switchAuthView('mfa');
                }
              }
            }
          }
        } catch (mfaCheckErr) {
          console.warn('MFA check error:', mfaCheckErr);
        }

        if (!isMfaRequired) {
          closeAuthModal();
          openStorageModal(pendingAdminTab);
          showToast("Authenticated as Oluwafemi David!");
        }
      } catch (err) {
        memoryFailedAttempts += 1;
        await logSecurityActivity('login_failure', { reason: 'bad_credentials' });

        if (memoryFailedAttempts >= ADMIN_CONFIG.maxFailedAttempts) {
          const lockoutSeconds = ADMIN_CONFIG.initialLockoutSeconds * memoryLockoutMultiplier;
          const lockoutUntil = Date.now() + (lockoutSeconds * 1000);
          saveLockoutState({
            failedAttempts: memoryFailedAttempts,
            lockoutUntil,
            multiplier: memoryLockoutMultiplier * 2
          });
          await logSecurityActivity('client_lockout', { lockoutSeconds });
          updateLockoutUI();
        } else {
          saveLockoutState({
            failedAttempts: memoryFailedAttempts,
            lockoutUntil: 0,
            multiplier: memoryLockoutMultiplier
          });
          if (authError && authErrorText) {
            authErrorText.textContent = `Incorrect email or password. (${ADMIN_CONFIG.maxFailedAttempts - memoryFailedAttempts} attempts left before 15m lockout)`;
            authError.classList.remove('hidden');
          }
        }

        if (pwdInput) {
          pwdInput.focus();
          pwdInput.select();
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (spinner) spinner.classList.add('hidden');
        if (btnText) btnText.textContent = 'Sign in to Private Space';
        updateLockoutUI();
      }
    });
  }

  // MFA Challenge Form
  const mfaForm = document.getElementById('admin-mfa-challenge-form');
  if (mfaForm) {
    mfaForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const codeInput = document.getElementById('mfa-code-input');
      const mfaErr = document.getElementById('mfa-challenge-error');
      const code = (codeInput?.value || '').trim();

      if (mfaErr) mfaErr.classList.add('hidden');
      try {
        const client = getSupabase();
        const { error } = await client.auth.mfa.verify({
          factorId: currentMfaFactorId,
          challengeId: currentMfaChallengeId,
          code
        });
        if (error) throw error;

        await logSecurityActivity('mfa_verified', { factorId: currentMfaFactorId });
        closeAuthModal();
        openStorageModal(pendingAdminTab);
        showToast("Two-factor authentication verified!");
      } catch (err) {
        if (mfaErr) mfaErr.classList.remove('hidden');
        await logSecurityActivity('mfa_challenge_failed', { reason: err.message });
      }
    });
  }

  // Forgot password
  const forgotTrigger = document.getElementById('forgot-password-trigger');
  if (forgotTrigger) forgotTrigger.addEventListener('click', () => switchAuthView('forgot'));

  const backToLoginBtn = document.getElementById('back-to-login-btn');
  if (backToLoginBtn) backToLoginBtn.addEventListener('click', () => switchAuthView('login'));

  const forgotForm = document.getElementById('admin-forgot-form');
  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const feedback = document.getElementById('forgot-feedback-box');
      const sendBtn = document.getElementById('send-reset-btn');
      if (sendBtn) sendBtn.disabled = true;

      try {
        const client = getSupabase();
        const secretResetUrl = window.location.origin + window.location.pathname + '#/ctrl-k8m2x9q4v7w1p3t6y5z0/reset';
        await client.auth.resetPasswordForEmail(ADMIN_CONFIG.email, {
          redirectTo: secretResetUrl
        });
        await logSecurityActivity('password_reset_request', { target: ADMIN_CONFIG.email });
      } catch (err) {
        console.warn('Password reset error:', err);
      } finally {
        if (feedback) feedback.classList.remove('hidden');
        if (sendBtn) sendBtn.disabled = false;
      }
    });
  }

  // Reset form
  const resetForm = document.getElementById('admin-reset-form');
  const newPwdInput = document.getElementById('new-password-input');
  const genResetPwdBtn = document.getElementById('gen-reset-pwd-btn');

  function updateResetPwdStrength() {
    if (!newPwdInput) return;
    const pwd = newPwdInput.value || '';
    const evalRes = evaluatePasswordPolicy(pwd);
    const bar = document.getElementById('strength-bar');
    const label = document.getElementById('strength-label');
    if (bar && label) {
      bar.style.width = `${evalRes.score}%`;
      if (evalRes.score < 50) {
        bar.className = 'h-full bg-red-500 transition-all duration-300';
        label.className = 'font-bold text-red-600';
        label.textContent = 'Too Weak';
      } else if (evalRes.score < 80) {
        bar.className = 'h-full bg-amber-500 transition-all duration-300';
        label.className = 'font-bold text-amber-600';
        label.textContent = 'Moderate';
      } else {
        bar.className = 'h-full bg-emerald-500 transition-all duration-300';
        label.className = 'font-bold text-emerald-600';
        label.textContent = 'Strong & Compliant';
      }
    }

    const setRule = (id, valid) => {
      const el = document.getElementById(id);
      if (el) {
        el.className = valid ? 'flex items-center gap-1.5 text-emerald-600 font-bold' : 'flex items-center gap-1.5 text-gray-400';
        el.firstElementChild.textContent = valid ? '✓' : '○';
      }
    };
    setRule('rule-len', evalRes.hasLen);
    setRule('rule-upper', evalRes.hasUpper);
    setRule('rule-lower', evalRes.hasLower);
    setRule('rule-num', evalRes.hasNum);
    setRule('rule-sym', evalRes.hasSym);
    setRule('rule-name', evalRes.noPersonal);
  }

  if (newPwdInput) {
    newPwdInput.addEventListener('input', updateResetPwdStrength);
    newPwdInput.addEventListener('blur', async () => {
      const pwned = await checkHaveIBeenPwned(newPwdInput.value);
      const hibpEl = document.getElementById('rule-hibp');
      if (hibpEl) {
        if (pwned.breached) {
          hibpEl.className = 'flex items-center gap-1.5 text-red-600 font-bold';
          hibpEl.firstElementChild.textContent = '✗';
        } else if (newPwdInput.value.length >= 8) {
          hibpEl.className = 'flex items-center gap-1.5 text-emerald-600 font-bold';
          hibpEl.firstElementChild.textContent = '✓';
        }
      }
    });
  }

  if (genResetPwdBtn && newPwdInput) {
    genResetPwdBtn.addEventListener('click', () => {
      const strong = generateCryptographicPassword(20);
      newPwdInput.type = 'text';
      newPwdInput.value = strong;
      const confirmInput = document.getElementById('confirm-password-input');
      if (confirmInput) {
        confirmInput.type = 'text';
        confirmInput.value = strong;
      }
      navigator.clipboard.writeText(strong).catch(() => {});
      showToast("Generated strong password & copied to clipboard!");
      updateResetPwdStrength();
    });
  }

  if (resetForm) {
    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pwd = newPwdInput?.value || '';
      const confirm = document.getElementById('confirm-password-input')?.value || '';
      if (pwd !== confirm) {
        alert("Passwords do not match!");
        return;
      }
      const policy = evaluatePasswordPolicy(pwd);
      if (!policy.isValid) {
        alert("Password does not meet required security criteria.");
        return;
      }
      try {
        const client = getSupabase();
        const { error } = await client.auth.updateUser({ password: pwd });
        if (error) throw error;
        await client.auth.signOut();
        await logSecurityActivity('password_reset_complete');
        showToast("Password updated successfully! Please sign in with your new password.");
        switchAuthView('login');
      } catch (err) {
        alert("Failed to update password: " + err.message);
      }
    });
  }

  // Modal Closures
  if (closeAuthBtn) closeAuthBtn.addEventListener('click', closeAndUnmountAdmin);
  if (closeBtn) closeBtn.addEventListener('click', closeAndUnmountAdmin);
  if (headerSignoutBtn) headerSignoutBtn.addEventListener('click', () => performAdminLogout("Signed out of private workspace."));
  if (staySignedInBtn) staySignedInBtn.addEventListener('click', () => {
    resetInactivityWatchers();
    showToast("Session extended.");
  });

  // Tab switching
  const tabWebsites = document.getElementById('tab-btn-websites');
  const tabReviews = document.getElementById('tab-btn-testimonials');
  const tabVisitors = document.getElementById('tab-btn-visitors');
  const tabChatbot = document.getElementById('tab-btn-chatbot');
  const tabBackup = document.getElementById('tab-btn-backup');
  const tabSecurity = document.getElementById('tab-btn-security');
  const tabLogs = document.getElementById('tab-btn-logs');

  const contentWebsites = document.getElementById('tab-content-websites');
  const contentReviews = document.getElementById('tab-content-testimonials');
  const contentVisitors = document.getElementById('tab-content-visitors');
  const contentChatbot = document.getElementById('tab-content-chatbot');
  const contentBackup = document.getElementById('tab-content-backup');
  const contentSecurity = document.getElementById('tab-content-security');
  const contentLogs = document.getElementById('tab-content-logs');

  function switchTab(name) {
    [tabWebsites, tabReviews, tabVisitors, tabChatbot, tabBackup, tabSecurity, tabLogs].forEach(t => {
      if (!t) return;
      t.className = "px-3 py-2 border-t-2 border-l-2 border-r-2 border-transparent rounded-t-lg bg-white/70 text-gray-700 hover:bg-stone-200 transition-colors flex items-center gap-1";
    });
    [contentWebsites, contentReviews, contentVisitors, contentChatbot, contentBackup, contentSecurity, contentLogs].forEach(c => c && c.classList.add('hidden'));

    if (name === 'websites') {
      tabWebsites.className = "px-3 py-2 border-t-2 border-l-2 border-r-2 border-black rounded-t-lg bg-orange-500 text-white flex items-center gap-1 font-bold";
      contentWebsites?.classList.remove('hidden');
    } else if (name === 'testimonials') {
      tabReviews.className = "px-3 py-2 border-t-2 border-l-2 border-r-2 border-black rounded-t-lg bg-emerald-600 text-white flex items-center gap-1 font-bold";
      contentReviews?.classList.remove('hidden');
    } else if (name === 'visitors') {
      tabVisitors.className = "px-3 py-2 border-t-2 border-l-2 border-r-2 border-black rounded-t-lg bg-orange-600 text-white flex items-center gap-1 font-bold";
      contentVisitors?.classList.remove('hidden');
      loadAdminVisitors();
    } else if (name === 'chatbot') {
      tabChatbot.className = "px-3 py-2 border-t-2 border-l-2 border-r-2 border-black rounded-t-lg bg-teal-600 text-white flex items-center gap-1 font-bold";
      contentChatbot?.classList.remove('hidden');
      loadAdminChatbotConversations();
    } else if (name === 'backup') {
      tabBackup.className = "px-3 py-2 border-t-2 border-l-2 border-r-2 border-black rounded-t-lg bg-stone-900 text-white flex items-center gap-1 font-bold";
      contentBackup?.classList.remove('hidden');
    } else if (name === 'security') {
      tabSecurity.className = "px-3 py-2 border-t-2 border-l-2 border-r-2 border-black rounded-t-lg bg-blue-600 text-white flex items-center gap-1 font-bold";
      contentSecurity?.classList.remove('hidden');
    } else if (name === 'logs') {
      tabLogs.className = "px-3 py-2 border-t-2 border-l-2 border-r-2 border-black rounded-t-lg bg-purple-600 text-white flex items-center gap-1 font-bold";
      contentLogs?.classList.remove('hidden');
      loadSecurityLogs();
    }
  }

  if (tabWebsites) tabWebsites.addEventListener('click', () => switchTab('websites'));
  if (tabReviews) tabReviews.addEventListener('click', () => switchTab('testimonials'));
  if (tabVisitors) tabVisitors.addEventListener('click', () => switchTab('visitors'));
  if (tabChatbot) tabChatbot.addEventListener('click', () => switchTab('chatbot'));
  if (tabBackup) tabBackup.addEventListener('click', () => switchTab('backup'));
  if (tabSecurity) tabSecurity.addEventListener('click', () => switchTab('security'));
  if (tabLogs) tabLogs.addEventListener('click', () => switchTab('logs'));

  // Notification Bell Toggle
  const bellBtn = document.getElementById('admin-notification-bell-btn');
  const notifCenter = document.getElementById('admin-notification-center');
  const closeNotifCenterBtn = document.getElementById('close-notif-center-btn');

  if (bellBtn && notifCenter) {
    bellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = notifCenter.classList.contains('hidden');
      if (isHidden) {
        notifCenter.classList.remove('hidden');
        loadAdminNotifications();
      } else {
        notifCenter.classList.add('hidden');
      }
    });
  }

  if (closeNotifCenterBtn && notifCenter) {
    closeNotifCenterBtn.addEventListener('click', () => {
      notifCenter.classList.add('hidden');
    });
  }

  // Sound Chime Toggle
  const soundToggleBtn = document.getElementById('notif-sound-toggle-btn');
  if (soundToggleBtn) {
    const isMuted = localStorage.getItem('femi_admin_sound_muted') === 'true';
    soundToggleBtn.textContent = isMuted ? '🔕' : '🔔';
    soundToggleBtn.addEventListener('click', () => {
      const currentlyMuted = localStorage.getItem('femi_admin_sound_muted') === 'true';
      if (currentlyMuted) {
        localStorage.removeItem('femi_admin_sound_muted');
        soundToggleBtn.textContent = '🔔';
        showToast('Notification chime unmuted.');
        playNotificationChime('arrival');
      } else {
        localStorage.setItem('femi_admin_sound_muted', 'true');
        soundToggleBtn.textContent = '🔕';
        showToast('Notification chime muted.');
      }
    });
  }

  // Push Notifications Toggle
  const pushToggleBtn = document.getElementById('notif-push-toggle-btn');
  if (pushToggleBtn) {
    pushToggleBtn.addEventListener('click', () => {
      requestPushNotificationPermission();
    });
  }

  // Mark all read button
  const markAllReadBtn = document.getElementById('notif-mark-all-read-btn');
  if (markAllReadBtn) {
    markAllReadBtn.addEventListener('click', markAllNotificationsAsRead);
  }

  // Clear notifications button
  const clearNotifsBtn = document.getElementById('notif-clear-all-btn');
  if (clearNotifsBtn) {
    clearNotifsBtn.addEventListener('click', clearArchivedNotifications);
  }

  // Notification Filter Pills
  const notifFilterBtns = document.querySelectorAll('#notif-filter-pills .notif-filter-btn');
  notifFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      notifFilterBtns.forEach(b => {
        b.className = "notif-filter-btn px-2 py-0.5 rounded bg-white text-gray-700 border border-gray-200 hover:bg-stone-100 font-bold text-[10px]";
      });
      btn.className = "notif-filter-btn px-2 py-0.5 rounded bg-stone-900 text-white font-bold text-[10px]";
      adminNotifFilter = btn.getAttribute('data-filter') || 'all';
      renderAdminNotificationsFeed();
    });
  });

  // Visitors Refresh & Ignore Device Buttons
  const refreshVisitorsBtn = document.getElementById('refresh-visitors-btn');
  if (refreshVisitorsBtn) refreshVisitorsBtn.addEventListener('click', loadAdminVisitors);

  const ignoreDeviceBtn = document.getElementById('ignore-my-device-toggle-btn');
  if (ignoreDeviceBtn) {
    const isDeviceIgnored = localStorage.getItem('femi_ignore_device') === 'true';
    ignoreDeviceBtn.textContent = isDeviceIgnored ? '✅ My Device Ignored' : '📱 Ignore My Device';
    ignoreDeviceBtn.addEventListener('click', () => {
      const isCurrentlyIgnored = localStorage.getItem('femi_ignore_device') === 'true';
      if (isCurrentlyIgnored) {
        localStorage.removeItem('femi_ignore_device');
        ignoreDeviceBtn.textContent = '📱 Ignore My Device';
        showToast('Your device tracking is re-enabled.');
      } else {
        localStorage.setItem('femi_ignore_device', 'true');
        ignoreDeviceBtn.textContent = '✅ My Device Ignored';
        showToast('This device will now be ignored from visitor tracking.');
      }
    });
  }

  // Visitor Filter Pills
  const visitorFilterBtns = document.querySelectorAll('#visitor-filter-pills .visitor-filter-btn');
  visitorFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      visitorFilterBtns.forEach(b => {
        b.className = "visitor-filter-btn px-2.5 py-1 rounded-md bg-stone-100 text-gray-700 hover:bg-stone-200 font-bold";
      });
      btn.className = "visitor-filter-btn px-2.5 py-1 rounded-md bg-stone-900 text-white font-bold";
      adminVisitorFilter = btn.getAttribute('data-filter') || 'all';
      renderAdminVisitorsTable();
    });
  });

  // Visitor Search Input
  const visitorSearchInput = document.getElementById('visitor-search-input');
  if (visitorSearchInput) {
    visitorSearchInput.addEventListener('input', () => {
      adminVisitorSearchQuery = visitorSearchInput.value.trim();
      renderAdminVisitorsTable();
    });
  }

  // Visitor Detail Drawer Close
  const closeVisitorDrawerBtn = document.getElementById('close-visitor-drawer-btn');
  if (closeVisitorDrawerBtn) {
    closeVisitorDrawerBtn.addEventListener('click', () => {
      const drawer = document.getElementById('visitor-detail-drawer');
      if (drawer) drawer.classList.add('hidden');
    });
  }

  // Website form submit
  const webForm = document.getElementById('website-sample-form');
  if (webForm) {
    webForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const editId = document.getElementById('edit-website-id').value;
      const title = document.getElementById('sample-title').value.trim();
      const category = document.getElementById('sample-category').value;
      const image = document.getElementById('sample-image-url').value.trim() || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80';
      const liveUrl = document.getElementById('sample-live-url').value.trim() || '#contact';
      const techString = document.getElementById('sample-tech').value.trim();
      const desc = document.getElementById('sample-desc').value.trim();
      const techArray = techString ? techString.split(',').map(s => s.trim()).filter(Boolean) : ['Web', 'Custom'];

      const websites = getStoredWebsites();
      if (editId) {
        const index = websites.findIndex(w => w.id === editId);
        if (index !== -1) {
          websites[index] = { ...websites[index], title, category, image, liveUrl, tech: techArray, desc };
          showToast(`Updated "${title}"!`);
        }
      } else {
        const newSite = {
          id: 'proj-' + Date.now(),
          title,
          category,
          tag: 'Verified Build',
          color: ['amber', 'sky', 'emerald', 'rose'][Math.floor(Math.random() * 4)],
          image,
          liveUrl,
          tech: techArray,
          desc,
          highlight: 'Client Verified'
        };
        websites.unshift(newSite);
        showToast(`Added "${title}" to samples!`);
      }
      saveStoredWebsites(websites);
      resetWebsiteForm();
      renderModalLists();
      if (typeof window.renderProjectsGrid === 'function') {
        window.renderProjectsGrid('all');
      }
    });
  }

  // Client review form submit
  const revForm = document.getElementById('client-review-form');
  if (revForm) {
    revForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const editId = document.getElementById('edit-review-id').value;
      const name = document.getElementById('review-name').value.trim();
      const company = document.getElementById('review-company').value.trim();
      const rating = parseInt(document.getElementById('review-stars').value, 10) || 5;
      const color = document.getElementById('review-color').value || 'yellow';
      const quote = document.getElementById('review-quote').value.trim();

      const testimonials = getStoredTestimonials();
      if (editId) {
        const index = testimonials.findIndex(r => r.id === editId);
        if (index !== -1) {
          testimonials[index] = { ...testimonials[index], name, company, rating, color, quote };
          showToast(`Updated review from "${name}"!`);
        }
      } else {
        const newRev = {
          id: 'rev-' + Date.now(),
          name,
          company,
          rating,
          color,
          quote
        };
        testimonials.unshift(newRev);
        showToast(`Added review from "${name}"!`);
      }
      saveStoredTestimonials(testimonials);
      resetReviewForm();
      renderModalLists();
      if (typeof window.renderTestimonialsGrid === 'function') {
        window.renderTestimonialsGrid();
      }
    });
  }

  // Backup handlers
  const exportBtn = document.getElementById('export-json-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const data = {
        websites: getStoredWebsites(),
        testimonials: getStoredTestimonials(),
        exported_at: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `femi-showcase-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Showcase data backup downloaded!");
    });
  }

  const importBtn = document.getElementById('import-json-btn');
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      const text = document.getElementById('import-json-text').value.trim();
      if (!text) return;
      try {
        const data = JSON.parse(text);
        if (data.websites && Array.isArray(data.websites)) saveStoredWebsites(data.websites);
        if (data.testimonials && Array.isArray(data.testimonials)) saveStoredTestimonials(data.testimonials);
        showToast("Imported data successfully!");
        renderModalLists();
        if (typeof window.renderProjectsGrid === 'function') window.renderProjectsGrid('all');
        if (typeof window.renderTestimonialsGrid === 'function') window.renderTestimonialsGrid();
      } catch (e) {
        alert("Invalid JSON format.");
      }
    });
  }

  // Keydown trap
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAndUnmountAdmin();
    }
    if (authModal && authModal.classList.contains('active')) {
      trapModalFocus(authModal, e);
    } else if (modal && modal.classList.contains('active')) {
      trapModalFocus(modal, e);
    }
  });

  // Chatbot tab actions
  const refreshChatsBtn = document.getElementById('refresh-chats-btn');
  if (refreshChatsBtn) refreshChatsBtn.addEventListener('click', loadAdminChatbotConversations);

  const searchInput = document.getElementById('chat-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      adminChatSearchQuery = searchInput.value.trim();
      renderAdminChatbotList();
    });
  }

  const filterPills = document.querySelectorAll('#chat-filter-pills .chat-tab-filter-btn');
  filterPills.forEach(btn => {
    btn.addEventListener('click', () => {
      filterPills.forEach(b => {
        b.className = "chat-tab-filter-btn px-2.5 py-1 rounded-md bg-stone-100 text-gray-700 hover:bg-stone-200 font-bold";
      });
      btn.className = "chat-tab-filter-btn px-2.5 py-1 rounded-md bg-stone-900 text-white font-bold";
      adminChatFilter = btn.getAttribute('data-filter') || 'all';
      renderAdminChatbotList();
    });
  });

  const closeTranscriptBtn = document.getElementById('close-transcript-btn');
  if (closeTranscriptBtn) {
    closeTranscriptBtn.addEventListener('click', () => {
      const panel = document.getElementById('admin-transcript-panel');
      if (panel) panel.classList.add('hidden');
    });
  }
}

function switchAuthView(viewName) {
  const vLogin = document.getElementById('auth-view-login');
  const vMfa = document.getElementById('auth-view-mfa');
  const vForgot = document.getElementById('auth-view-forgot');
  const vReset = document.getElementById('auth-view-reset');

  [vLogin, vMfa, vForgot, vReset].forEach(v => v && v.classList.add('hidden'));

  if (viewName === 'login') vLogin?.classList.remove('hidden');
  else if (viewName === 'mfa') vMfa?.classList.remove('hidden');
  else if (viewName === 'forgot') vForgot?.classList.remove('hidden');
  else if (viewName === 'reset') vReset?.classList.remove('hidden');
}

function openAuthModal(viewName = 'login') {
  const modal = document.getElementById('admin-auth-modal');
  if (!modal) return;
  switchAuthView(viewName);
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  updateLockoutUI();
}

function closeAuthModal() {
  const modal = document.getElementById('admin-auth-modal');
  if (modal) modal.classList.remove('active');
}

function openStorageModal(tab = 'websites') {
  const modal = document.getElementById('showcase-manager-modal');
  if (!modal) return;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  const tabBtn = document.getElementById(`tab-btn-${tab}`);
  if (tabBtn) tabBtn.click();

  renderModalLists();
  startInactivityEngine();
  startRealtimeNotifications();
  loadAdminNotifications();
  loadAdminVisitors();
}

function closeStorageModal() {
  const modal = document.getElementById('showcase-manager-modal');
  if (modal) modal.classList.remove('active');
}

async function performAdminLogout(reason = "Signed out.") {
  stopInactivityEngine();
  const client = getSupabase();
  try {
    if (client?.auth) await client.auth.signOut();
  } catch (e) {}
  await logSecurityActivity('logout', { reason });
  showToast(reason);
  closeAndUnmountAdmin();
}

// Storage helpers
function getStoredWebsites() {
  if (typeof window.getStoredWebsites === 'function') return window.getStoredWebsites();
  try {
    return JSON.parse(localStorage.getItem('femi_portfolio_websites') || '[]');
  } catch (e) {
    return [];
  }
}

function saveStoredWebsites(data) {
  if (typeof window.saveStoredWebsites === 'function') {
    window.saveStoredWebsites(data);
  } else {
    localStorage.setItem('femi_portfolio_websites', JSON.stringify(data));
  }
}

function getStoredTestimonials() {
  if (typeof window.getStoredTestimonials === 'function') return window.getStoredTestimonials();
  try {
    return JSON.parse(localStorage.getItem('femi_portfolio_testimonials') || '[]');
  } catch (e) {
    return [];
  }
}

function saveStoredTestimonials(data) {
  if (typeof window.saveStoredTestimonials === 'function') {
    window.saveStoredTestimonials(data);
  } else {
    localStorage.setItem('femi_portfolio_testimonials', JSON.stringify(data));
  }
}

function renderModalLists() {
  const websites = getStoredWebsites();
  const testimonials = getStoredTestimonials();

  const countWeb = document.getElementById('modal-website-count');
  const countRev = document.getElementById('modal-review-count');
  if (countWeb) countWeb.textContent = websites.length;
  if (countRev) countRev.textContent = testimonials.length;

  const webList = document.getElementById('modal-websites-list');
  if (webList) {
    if (websites.length === 0) {
      webList.innerHTML = `<div class="text-xs text-gray-500 italic p-2">No samples in storage.</div>`;
    } else {
      webList.innerHTML = websites.map(w => `
        <div class="flex items-center justify-between p-2.5 bg-white rounded-lg border border-gray-200 text-xs font-mono">
          <div class="flex items-center gap-2 overflow-hidden mr-2">
            <img src="${escapeHtml(w.image || '')}" class="w-8 h-8 rounded object-cover flex-shrink-0 bg-slate-200" onerror="this.src='https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=100&q=80';" />
            <div class="truncate">
              <div class="font-bold text-gray-900 truncate">${escapeHtml(w.title)}</div>
              <div class="text-[10px] text-gray-500">${escapeHtml(w.category)}</div>
            </div>
          </div>
          <div class="flex items-center gap-1.5 flex-shrink-0">
            <button type="button" class="edit-site-btn px-2 py-1 rounded bg-stone-100 hover:bg-stone-200 text-gray-800 font-bold" data-id="${escapeHtml(w.id)}">Edit</button>
            <button type="button" class="del-site-btn px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 font-bold" data-id="${escapeHtml(w.id)}">Delete</button>
          </div>
        </div>
      `).join('');

      webList.querySelectorAll('.edit-site-btn').forEach(b => {
        b.addEventListener('click', () => editWebsiteSample(b.getAttribute('data-id')));
      });
      webList.querySelectorAll('.del-site-btn').forEach(b => {
        b.addEventListener('click', () => deleteWebsiteSample(b.getAttribute('data-id')));
      });
    }
  }

  const revList = document.getElementById('modal-reviews-list');
  if (revList) {
    if (testimonials.length === 0) {
      revList.innerHTML = `<div class="text-xs text-gray-500 italic p-2">No reviews in storage.</div>`;
    } else {
      revList.innerHTML = testimonials.map(r => `
        <div class="flex items-center justify-between p-2.5 bg-white rounded-lg border border-gray-200 text-xs font-mono">
          <div class="truncate mr-2">
            <div class="font-bold text-gray-900 truncate">${escapeHtml(r.name)}</div>
            <div class="text-[10px] text-gray-500 truncate">${escapeHtml(r.company || '')}</div>
          </div>
          <div class="flex items-center gap-1.5 flex-shrink-0">
            <button type="button" class="edit-rev-btn px-2 py-1 rounded bg-stone-100 hover:bg-stone-200 text-gray-800 font-bold" data-id="${escapeHtml(r.id)}">Edit</button>
            <button type="button" class="del-rev-btn px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 font-bold" data-id="${escapeHtml(r.id)}">Delete</button>
          </div>
        </div>
      `).join('');

      revList.querySelectorAll('.edit-rev-btn').forEach(b => {
        b.addEventListener('click', () => editClientReview(b.getAttribute('data-id')));
      });
      revList.querySelectorAll('.del-rev-btn').forEach(b => {
        b.addEventListener('click', () => deleteClientReview(b.getAttribute('data-id')));
      });
    }
  }
}

function editWebsiteSample(id) {
  const websites = getStoredWebsites();
  const item = websites.find(w => w.id === id);
  if (!item) return;

  document.getElementById('edit-website-id').value = item.id;
  document.getElementById('sample-title').value = item.title || '';
  document.getElementById('sample-category').value = item.category || 'E-Commerce';
  document.getElementById('sample-image-url').value = item.image || '';
  document.getElementById('sample-live-url').value = item.liveUrl || '';
  document.getElementById('sample-tech').value = Array.isArray(item.tech) ? item.tech.join(', ') : '';
  document.getElementById('sample-desc').value = item.desc || '';
  document.getElementById('form-website-heading').textContent = `✏️ Edit "${item.title}"`;
  document.getElementById('reset-website-form-btn').classList.remove('hidden');
}

function deleteWebsiteSample(id) {
  const websites = getStoredWebsites();
  const item = websites.find(w => w.id === id);
  if (!item) return;
  showConfirm(`Delete "${item.title}"?`, () => {
    const updated = websites.filter(w => w.id !== id);
    saveStoredWebsites(updated);
    renderModalLists();
    if (typeof window.renderProjectsGrid === 'function') window.renderProjectsGrid('all');
    showToast(`Deleted "${item.title}"`);
  });
}

function resetWebsiteForm() {
  const form = document.getElementById('website-sample-form');
  if (form) form.reset();
  const editId = document.getElementById('edit-website-id');
  if (editId) editId.value = '';
  const head = document.getElementById('form-website-heading');
  if (head) head.textContent = '➕ Add New Website Sample';
  const resetBtn = document.getElementById('reset-website-form-btn');
  if (resetBtn) resetBtn.classList.add('hidden');
}

function editClientReview(id) {
  const testimonials = getStoredTestimonials();
  const item = testimonials.find(r => r.id === id);
  if (!item) return;

  document.getElementById('edit-review-id').value = item.id;
  document.getElementById('review-name').value = item.name || '';
  document.getElementById('review-company').value = item.company || '';
  document.getElementById('review-stars').value = item.rating || 5;
  document.getElementById('review-color').value = item.color || 'yellow';
  document.getElementById('review-quote').value = item.quote || '';
  document.getElementById('form-review-heading').textContent = `✏️ Edit Review from "${item.name}"`;
  document.getElementById('reset-review-form-btn').classList.remove('hidden');
}

function deleteClientReview(id) {
  const testimonials = getStoredTestimonials();
  const item = testimonials.find(r => r.id === id);
  if (!item) return;
  showConfirm(`Delete review from "${item.name}"?`, () => {
    const updated = testimonials.filter(r => r.id !== id);
    saveStoredTestimonials(updated);
    renderModalLists();
    if (typeof window.renderTestimonialsGrid === 'function') window.renderTestimonialsGrid();
    showToast(`Deleted review from ${item.name}`);
  });
}

function resetReviewForm() {
  const form = document.getElementById('client-review-form');
  if (form) form.reset();
  const editId = document.getElementById('edit-review-id');
  if (editId) editId.value = '';
  const head = document.getElementById('form-review-heading');
  if (head) head.textContent = '➕ Add New Client Review';
  const resetBtn = document.getElementById('reset-review-form-btn');
  if (resetBtn) resetBtn.classList.add('hidden');
}

// Security Logs
async function loadSecurityLogs() {
  const tbody = document.getElementById('security-logs-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-gray-500 italic">Querying activity_logs...</td></tr>`;

  try {
    const client = getSupabase();
    const { data, error } = await client
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw error;
    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-gray-500 italic">No security events recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(log => {
      const timeStr = log.created_at ? new Date(log.created_at).toLocaleString() : 'Just now';
      return `
        <tr class="hover:bg-stone-50 transition-colors">
          <td class="p-2.5 whitespace-nowrap text-gray-500">${escapeHtml(timeStr)}</td>
          <td class="p-2.5 whitespace-nowrap">
            <span class="inline-block px-2 py-0.5 text-[10px] font-bold rounded border bg-stone-100 text-stone-800 border-stone-300">
              ${escapeHtml(log.event_type)}
            </span>
          </td>
          <td class="p-2.5 whitespace-nowrap font-bold text-gray-800">${escapeHtml(log.admin_email || 'davidbryght@gmail.com')}</td>
          <td class="p-2.5 text-gray-600 truncate max-w-xs" title="${escapeHtml(log.user_agent || '')}">${escapeHtml(log.user_agent || 'Unknown')}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-500 italic">Could not read security logs: ${escapeHtml(err.message)}</td></tr>`;
  }
}

// Chatbot Leads
async function loadAdminChatbotConversations() {
  const container = document.getElementById('admin-chat-conversations-list');
  const countBadge = document.getElementById('modal-chatbot-count');
  if (!container) return;
  container.innerHTML = `<div class="p-4 text-center text-xs text-gray-500 font-mono italic">Querying chat_conversations...</div>`;

  try {
    const client = getSupabase();
    const { data, error } = await client
      .from('chat_conversations')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    adminConversationsCache = data || [];
    if (countBadge) countBadge.textContent = adminConversationsCache.length;

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    let todayCount = 0, leadsCount = 0, consultCount = 0, discountCount = 0;

    adminConversationsCache.forEach(c => {
      const created = new Date(c.created_at || c.updated_at).getTime();
      if (created >= startOfDay) todayCount++;
      if (c.has_lead) leadsCount++;
      if (c.is_consultation_booked) consultCount++;
      if (c.claimed_discount) discountCount++;
    });

    const statChats = document.getElementById('stat-chats-today');
    const statLeads = document.getElementById('stat-leads-captured');
    const statConsult = document.getElementById('stat-consultations');
    const statDisc = document.getElementById('stat-discounts');
    if (statChats) statChats.textContent = todayCount;
    if (statLeads) statLeads.textContent = leadsCount;
    if (statConsult) statConsult.textContent = consultCount;
    if (statDisc) statDisc.textContent = discountCount;

    renderAdminChatbotList();
  } catch (err) {
    container.innerHTML = `<div class="p-4 text-center text-xs text-amber-700 bg-amber-50 rounded border border-amber-200 font-mono">Could not load conversations: ${escapeHtml(err.message)}</div>`;
  }
}

function renderAdminChatbotList() {
  const container = document.getElementById('admin-chat-conversations-list');
  if (!container) return;

  let filtered = [...adminConversationsCache];
  if (adminChatFilter === 'consultation') filtered = filtered.filter(c => c.is_consultation_booked);
  else if (adminChatFilter === 'discount') filtered = filtered.filter(c => c.claimed_discount);
  else if (adminChatFilter === 'unread') filtered = filtered.filter(c => c.status === 'needs_reply');

  if (adminChatSearchQuery) {
    const q = adminChatSearchQuery.toLowerCase();
    filtered = filtered.filter(c =>
      (c.visitor_name && c.visitor_name.toLowerCase().includes(q)) ||
      (c.visitor_email && c.visitor_email.toLowerCase().includes(q)) ||
      (c.visitor_phone && c.visitor_phone.toLowerCase().includes(q)) ||
      (c.summary && c.summary.toLowerCase().includes(q))
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-xs text-gray-400 font-mono italic">No conversations found.</div>`;
    return;
  }

  container.innerHTML = filtered.map(conv => {
    const timeStr = conv.updated_at ? new Date(conv.updated_at).toLocaleString() : 'Recent';
    const nameDisplay = conv.visitor_name || conv.visitor_email || 'Visitor';

    return `
      <div class="p-3 bg-white rounded-lg border border-gray-200 hover:border-black font-mono text-xs transition-colors space-y-2">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="font-bold text-gray-900">${escapeHtml(nameDisplay)}</div>
            <div class="text-[11px] text-gray-500">
              ${conv.visitor_email ? `✉️ ${escapeHtml(conv.visitor_email)} ` : ''}
              ${conv.visitor_phone ? `📱 ${escapeHtml(conv.visitor_phone)} ` : ''}
              <span class="text-stone-400">·</span> ${escapeHtml(timeStr)}
            </div>
          </div>
          <span class="px-2 py-0.5 text-[10px] font-bold rounded border bg-stone-100">${escapeHtml(conv.status || 'new')}</span>
        </div>
        ${conv.summary ? `<p class="text-[11px] text-gray-600 truncate bg-stone-50 p-1.5 rounded">${escapeHtml(conv.summary)}</p>` : ''}
        <div class="flex items-center justify-end gap-2 pt-1 border-t border-gray-100">
          <button type="button" class="view-transcript-btn px-2 py-1 bg-stone-100 hover:bg-stone-200 rounded text-[11px] font-bold text-gray-800" data-id="${escapeHtml(conv.session_id)}">Transcript</button>
          ${conv.visitor_phone ? `<a href="https://wa.me/${conv.visitor_phone.replace(/\D/g, '')}" target="_blank" rel="noopener noreferrer" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold">WhatsApp 💬</a>` : ''}
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.view-transcript-btn').forEach(btn => {
    btn.addEventListener('click', () => openAdminChatbotTranscript(btn.getAttribute('data-id')));
  });
}

async function openAdminChatbotTranscript(sessionId) {
  const panel = document.getElementById('admin-transcript-panel');
  const list = document.getElementById('transcript-messages-list');
  const title = document.getElementById('transcript-visitor-title');
  if (!panel || !list) return;

  panel.classList.remove('hidden');
  if (title) title.textContent = `Transcript (${sessionId})`;
  list.innerHTML = `<div class="p-3 text-center text-xs text-gray-500 italic">Loading messages...</div>`;

  try {
    const client = getSupabase();
    const { data, error } = await client
      .from('chat_messages')
      .select('*')
      .eq('conversation_session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!data || data.length === 0) {
      list.innerHTML = `<div class="p-3 text-center text-xs text-gray-400 italic">No messages stored for this session.</div>`;
      return;
    }

    list.innerHTML = data.map(m => {
      const isUser = m.sender === 'user';
      return `
        <div class="p-2 rounded text-xs ${isUser ? 'bg-orange-50 border border-orange-200 text-orange-950 font-bold' : 'bg-gray-50 border border-gray-200 text-gray-800'}">
          <span class="text-[10px] uppercase tracking-wider text-gray-400 block">${isUser ? 'Visitor' : 'Assistant'}:</span>
          <div class="mt-0.5">${escapeHtml(m.message_text).replace(/\n/g, '<br>')}</div>
        </div>
      `;
    }).join('');
  } catch (err) {
    list.innerHTML = `<div class="p-3 text-center text-xs text-red-500 italic">Failed to load transcript: ${escapeHtml(err.message)}</div>`;
  }
}

// ==============================================================
// VISITOR ACTIVITY NOTIFICATIONS & REALTIME TELEMETRY ENGINE
// ==============================================================

// Web Audio API Synthesizer for pleasant notifications
function playNotificationChime(type = 'arrival') {
  if (localStorage.getItem('femi_admin_sound_muted') === 'true') return;

  // Quiet Hours check (23:00 to 07:00 WAT)
  const hour = new Date().getHours();
  if (hour >= 23 || hour < 7) {
    return;
  }

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'lead_form' || type === 'lead_chat' || type === 'whatsapp_click' || type === 'call_click') {
      // Double upbeat chime for leads
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.12); // A5
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else {
      // Single gentle bell for visitor arrivals
      osc.frequency.setValueAtTime(659.25, now); // E5
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch (e) {}
}

function requestPushNotificationPermission() {
  if ('Notification' in window) {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        showToast('Browser notifications enabled!');
      } else {
        showToast('Browser notifications permission denied.', 'error');
      }
    });
  } else {
    showToast('Push notifications not supported on this browser.', 'error');
  }
}

function sendBrowserPushNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚡</text></svg>'
      });
    } catch (e) {}
  }
}

function updateAdminPageTitleWithUnread(count) {
  if (count > 0) {
    document.title = `(${count}) ${NEUTRAL_ADMIN_TITLE}`;
  } else {
    document.title = NEUTRAL_ADMIN_TITLE;
  }
}

// REALTIME SUBSCRIPTIONS
function startRealtimeNotifications() {
  stopRealtimeNotifications();

  const client = getSupabase();
  if (!client || typeof client.channel !== 'function') return;

  try {
    realtimeChannel = client
      .channel('admin-visitor-activity')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications'
      }, (payload) => {
        const newNotif = payload.new;
        if (!newNotif) return;

        adminNotificationsCache.unshift(newNotif);
        playNotificationChime(newNotif.type);
        sendBrowserPushNotification(newNotif.title, newNotif.message);

        // Shake bell icon
        const bellBtn = document.getElementById('admin-notification-bell-btn');
        if (bellBtn) {
          bellBtn.classList.remove('bell-shake');
          void bellBtn.offsetWidth; // trigger reflow
          bellBtn.classList.add('bell-shake');
        }

        renderAdminNotificationsFeed();
        updateUnreadBadges();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'visitor_sessions'
      }, () => {
        loadAdminVisitors();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Realtime notification channel active.');
        }
      });

    // 30-Second Polling Fallback
    visitorPollingTimer = setInterval(() => {
      loadAdminVisitors();
      loadAdminNotifications();
    }, 30000);

  } catch (err) {
    console.warn('Realtime subscription error:', err);
  }
}

function stopRealtimeNotifications() {
  if (realtimeChannel) {
    try {
      const client = getSupabase();
      if (client?.removeChannel) client.removeChannel(realtimeChannel);
    } catch (e) {}
    realtimeChannel = null;
  }
  if (visitorPollingTimer) {
    clearInterval(visitorPollingTimer);
    visitorPollingTimer = null;
  }
  updateAdminPageTitleWithUnread(0);
}

// NOTIFICATION OPERATIONS
async function loadAdminNotifications() {
  const container = document.getElementById('admin-notifications-feed');
  if (!container) return;

  try {
    const client = getSupabase();
    if (!client) return;

    const { data, error } = await client
      .from('notifications')
      .select('*')
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(60);

    if (error) throw error;
    adminNotificationsCache = data || [];
    renderAdminNotificationsFeed();
    updateUnreadBadges();
  } catch (err) {
    console.warn('Error loading notifications:', err);
  }
}

function updateUnreadBadges() {
  const unreadCount = adminNotificationsCache.filter(n => !n.is_read).length;
  const badge = document.getElementById('admin-notif-badge');
  const pill = document.getElementById('notif-unread-count-pill');

  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  if (pill) {
    pill.textContent = `${unreadCount} New`;
  }

  updateAdminPageTitleWithUnread(unreadCount);
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return 'Just now';
  const diffSec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diffSec < 15) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDays = Math.floor(diffHour / 24);
  return `${diffDays}d ago`;
}

function renderAdminNotificationsFeed() {
  const container = document.getElementById('admin-notifications-feed');
  if (!container) return;

  let filtered = [...adminNotificationsCache];
  if (adminNotifFilter === 'unread') {
    filtered = filtered.filter(n => !n.is_read);
  } else if (adminNotifFilter === 'arrival') {
    filtered = filtered.filter(n => n.type === 'arrival_new' || n.type === 'arrival_returning');
  } else if (adminNotifFilter === 'departure') {
    filtered = filtered.filter(n => n.type === 'departure');
  } else if (adminNotifFilter === 'leads') {
    filtered = filtered.filter(n => n.type !== 'arrival_new' && n.type !== 'arrival_returning' && n.type !== 'departure');
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-xs text-gray-400 italic">No activity notifications found in this filter.</div>`;
    return;
  }

  const iconMap = {
    arrival_new: '🟢',
    arrival_returning: '🔄',
    departure: '👋',
    lead_form: '✍️',
    lead_chat: '🤖',
    whatsapp_click: '💬',
    call_click: '📞',
    discount_claim: '🔥',
    high_intent: '🎯'
  };

  container.innerHTML = filtered.map(item => {
    const icon = iconMap[item.type] || '🔔';
    const isUnread = !item.is_read;
    const timeAgo = formatRelativeTime(item.created_at);

    return `
      <div 
        class="notif-card p-2.5 rounded-xl border transition-all cursor-pointer ${isUnread ? 'bg-orange-50/80 border-orange-300 shadow-sm' : 'bg-white border-gray-200 hover:border-black'}"
        data-id="${escapeHtml(item.id)}"
        data-visitor-id="${escapeHtml(item.visitor_id || '')}"
        data-session-id="${escapeHtml(item.session_id || '')}"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-start gap-2">
            <span class="text-base flex-shrink-0 mt-0.5">${icon}</span>
            <div>
              <div class="font-bold text-gray-900 ${isUnread ? 'text-orange-950 font-extrabold' : ''}">${escapeHtml(item.title)}</div>
              <p class="text-[11px] text-gray-600 leading-snug mt-0.5">${escapeHtml(item.message)}</p>
            </div>
          </div>
          <div class="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0 flex flex-col items-end gap-1">
            <span>${timeAgo}</span>
            ${isUnread ? `<button type="button" class="mark-single-read-btn text-orange-600 hover:underline font-bold text-[10px]" data-id="${escapeHtml(item.id)}">Read</button>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Event handlers
  container.querySelectorAll('.notif-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.mark-single-read-btn')) return;
      const vId = card.getAttribute('data-visitor-id');
      const sId = card.getAttribute('data-session-id');
      const nId = card.getAttribute('data-id');
      if (nId) markNotificationAsRead(nId);
      if (vId) openVisitorDetailDrawer(vId, sId);
    });
  });

  container.querySelectorAll('.mark-single-read-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const nId = btn.getAttribute('data-id');
      if (nId) markNotificationAsRead(nId);
    });
  });
}

async function markNotificationAsRead(notifId) {
  const item = adminNotificationsCache.find(n => n.id === notifId);
  if (item) item.is_read = true;
  updateUnreadBadges();
  renderAdminNotificationsFeed();

  try {
    const client = getSupabase();
    if (client) {
      await client.from('notifications').update({ is_read: true }).eq('id', notifId);
    }
  } catch (e) {}
}

async function markAllNotificationsAsRead() {
  adminNotificationsCache.forEach(n => n.is_read = true);
  updateUnreadBadges();
  renderAdminNotificationsFeed();

  try {
    const client = getSupabase();
    if (client) {
      await client.from('notifications').update({ is_read: true }).eq('is_read', false);
    }
    showToast("All notifications marked as read.");
  } catch (e) {}
}

async function clearArchivedNotifications() {
  adminNotificationsCache = adminNotificationsCache.filter(n => !n.is_read);
  updateUnreadBadges();
  renderAdminNotificationsFeed();

  try {
    const client = getSupabase();
    if (client) {
      await client.from('notifications').update({ is_archived: true }).eq('is_read', true);
    }
    showToast("Cleared read notifications.");
  } catch (e) {}
}

// VISITOR DIRECTORY & ANALYTICS
async function loadAdminVisitors() {
  const tbody = document.getElementById('visitors-table-tbody');
  const countBadge = document.getElementById('modal-visitors-count');

  try {
    const client = getSupabase();
    if (!client) return;

    // 1. Run stale session cleanup RPC
    try {
      if (typeof client.rpc === 'function') {
        await client.rpc('cleanup_stale_sessions');
      }
    } catch (e) {}

    // 2. Fetch Sessions
    const { data: sessions, error: sessErr } = await client
      .from('visitor_sessions')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(100);

    if (sessErr) throw sessErr;
    adminSessionsCache = sessions || [];

    // 3. Fetch Visitors
    const { data: visitors, error: visErr } = await client
      .from('visitors')
      .select('*')
      .order('last_seen_at', { ascending: false })
      .limit(50);

    if (visErr) throw visErr;
    adminVisitorsCache = visitors || [];

    if (countBadge) countBadge.textContent = adminVisitorsCache.length;

    // 4. Calculate stats
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    let activeCount = 0;
    let todaySessionsCount = 0;
    let returningSessionsCount = 0;
    let totalDuration = 0;

    adminSessionsCache.forEach(s => {
      const started = new Date(s.started_at).getTime();
      const lastActive = new Date(s.last_active_at || s.started_at).getTime();

      // Active if is_active is true and active within last 2 minutes
      if (s.is_active && (now - lastActive < 120000)) {
        activeCount++;
      }

      if (started >= startOfToday.getTime()) {
        todaySessionsCount++;
        if (s.session_number > 1) returningSessionsCount++;
        totalDuration += (s.duration_seconds || 0);
      }
    });

    const returningRate = todaySessionsCount > 0 ? Math.round((returningSessionsCount / todaySessionsCount) * 100) : 0;
    const avgDurationSec = todaySessionsCount > 0 ? Math.round(totalDuration / todaySessionsCount) : 0;

    const topActiveEl = document.getElementById('admin-active-visitors-count');
    const statActiveEl = document.getElementById('stat-active-visitors');
    const statTodayEl = document.getElementById('stat-visitors-today');
    const statRateEl = document.getElementById('stat-returning-rate');
    const statAvgDurEl = document.getElementById('stat-avg-duration');

    if (topActiveEl) topActiveEl.textContent = activeCount;
    if (statActiveEl) statActiveEl.textContent = activeCount;
    if (statTodayEl) statTodayEl.textContent = todaySessionsCount;
    if (statRateEl) statRateEl.textContent = `${returningRate}%`;
    if (statAvgDurEl) {
      statAvgDurEl.textContent = avgDurationSec < 60 ? `${avgDurationSec}s` : `${Math.round(avgDurationSec / 60)}m`;
    }

    renderVisitorActivityChart();
    renderAdminVisitorsTable();

  } catch (err) {
    console.warn('Error loading visitors:', err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500 italic">Could not query visitor data: ${escapeHtml(err.message)}</td></tr>`;
    }
  }
}

function renderVisitorActivityChart() {
  const container = document.getElementById('visitor-activity-chart-wrap');
  if (!container) return;

  // Build 7-day stats
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' });
    const dayKey = d.toISOString().split('T')[0];
    days.push({ dayLabel, dayKey, newCount: 0, retCount: 0 });
  }

  adminSessionsCache.forEach(s => {
    if (!s.started_at) return;
    const sDate = s.started_at.split('T')[0];
    const match = days.find(d => d.dayKey === sDate);
    if (match) {
      if (s.session_number > 1) match.retCount++;
      else match.newCount++;
    }
  });

  const maxVal = Math.max(1, ...days.map(d => d.newCount + d.retCount));
  const svgHeight = 100;

  const chartBars = days.map((d, idx) => {
    const total = d.newCount + d.retCount;
    const totalHeight = Math.round((total / maxVal) * (svgHeight - 20));
    const newHeight = total > 0 ? Math.round((d.newCount / total) * totalHeight) : 0;
    const retHeight = totalHeight - newHeight;

    const x = idx * 56 + 20;
    const yNew = svgHeight - newHeight;
    const yRet = yNew - retHeight;

    return `
      <g class="chart-col group">
        <title>${d.dayLabel} (${d.dayKey}): ${d.newCount} New, ${d.retCount} Returning</title>
        <!-- Returning bar -->
        ${retHeight > 0 ? `<rect x="${x}" y="${yRet}" width="26" height="${retHeight}" rx="3" fill="#2563eb" />` : ''}
        <!-- New visitor bar -->
        ${newHeight > 0 ? `<rect x="${x}" y="${yNew}" width="26" height="${newHeight}" rx="3" fill="#ea580c" />` : ''}
        <!-- Label -->
        <text x="${x + 13}" y="${svgHeight + 14}" text-anchor="middle" font-size="10" font-family="monospace" fill="#4b5563">${d.dayLabel}</text>
        <text x="${x + 13}" y="${Math.max(12, yRet - 3)}" text-anchor="middle" font-size="9" font-family="monospace" font-weight="bold" fill="#111827">${total}</text>
      </g>
    `;
  }).join('');

  container.innerHTML = `
    <svg viewBox="0 0 420 125" class="w-full h-full overflow-visible">
      <line x1="15" y1="${svgHeight}" x2="410" y2="${svgHeight}" stroke="#e5e7eb" stroke-width="1.5" />
      ${chartBars}
    </svg>
  `;
}

function renderAdminVisitorsTable() {
  const tbody = document.getElementById('visitors-table-tbody');
  if (!tbody) return;

  let filtered = [...adminVisitorsCache];
  const now = Date.now();

  if (adminVisitorFilter === 'active') {
    filtered = filtered.filter(v => {
      const activeSession = adminSessionsCache.find(s => s.visitor_id === v.id && s.is_active && (now - new Date(s.last_active_at).getTime() < 120000));
      return Boolean(activeSession);
    });
  } else if (adminVisitorFilter === 'returning') {
    filtered = filtered.filter(v => (v.total_visits || 1) > 1);
  } else if (adminVisitorFilter === 'leads') {
    filtered = filtered.filter(v => Boolean(v.lead_email || v.lead_phone || v.lead_name));
  }

  if (adminVisitorSearchQuery) {
    const q = adminVisitorSearchQuery.toLowerCase();
    filtered = filtered.filter(v =>
      (v.last_city && v.last_city.toLowerCase().includes(q)) ||
      (v.last_country && v.last_country.toLowerCase().includes(q)) ||
      (v.last_device && v.last_device.toLowerCase().includes(q)) ||
      (v.notes && v.notes.toLowerCase().includes(q)) ||
      (v.visitor_uuid && v.visitor_uuid.toLowerCase().includes(q))
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-gray-400 italic font-mono">No visitors match this query.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(visitor => {
    const activeSession = adminSessionsCache.find(s => s.visitor_id === visitor.id && s.is_active && (now - new Date(s.last_active_at).getTime() < 120000));
    const isActive = Boolean(activeSession);
    const location = visitor.last_city && visitor.last_city !== 'Unknown' 
      ? `${visitor.last_city}, ${visitor.last_country || 'Nigeria'}`
      : (visitor.last_country || 'Nigeria');
    
    const timeAgo = formatRelativeTime(visitor.last_seen_at);
    const shortUuid = (visitor.visitor_uuid || 'vis').slice(-8);

    return `
      <tr class="hover:bg-stone-50 transition-colors">
        <td class="p-2.5 whitespace-nowrap">
          <div class="flex items-center gap-1.5 font-bold text-gray-900">
            <span class="w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}"></span>
            <span>#${escapeHtml(shortUuid)}</span>
            ${visitor.is_ignored ? `<span class="px-1.5 py-0.2 rounded bg-stone-200 text-stone-600 text-[9px]">Ignored</span>` : ''}
          </div>
        </td>
        <td class="p-2.5 whitespace-nowrap text-gray-700 font-medium">
          <span>🇳🇬 ${escapeHtml(location)}</span>
        </td>
        <td class="p-2.5 whitespace-nowrap text-gray-600 text-[11px]">
          ${escapeHtml(visitor.last_device || 'Mobile')} · ${escapeHtml(visitor.last_browser || 'Chrome')}
        </td>
        <td class="p-2.5 whitespace-nowrap">
          <span class="px-2 py-0.5 rounded text-[11px] font-bold ${visitor.total_visits > 1 ? 'bg-blue-100 text-blue-800' : 'bg-stone-100 text-stone-800'}">
            ${visitor.total_visits} ${visitor.total_visits === 1 ? 'visit' : 'visits'}
          </span>
        </td>
        <td class="p-2.5 whitespace-nowrap text-gray-500 text-[11px]">
          ${timeAgo}
        </td>
        <td class="p-2.5 whitespace-nowrap text-right">
          <button 
            type="button" 
            class="open-drawer-btn px-2.5 py-1 bg-stone-100 hover:bg-orange-50 hover:text-orange-700 rounded border border-gray-300 font-bold text-[11px] transition-colors"
            data-visitor-id="${escapeHtml(visitor.id)}"
          >
            Journey ↗
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.open-drawer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const vId = btn.getAttribute('data-visitor-id');
      if (vId) openVisitorDetailDrawer(vId);
    });
  });
}

// VISITOR DETAIL DRAWER IMPLEMENTATION
async function openVisitorDetailDrawer(visitorId, targetSessionId = null) {
  const drawer = document.getElementById('visitor-detail-drawer');
  if (!drawer) return;

  activeDrawerVisitorId = visitorId;
  drawer.classList.remove('hidden');

  const visitor = adminVisitorsCache.find(v => v.id === visitorId);
  const titleEl = document.getElementById('drawer-visitor-title');
  const liveBadge = document.getElementById('drawer-live-badge');
  const visitsEl = document.getElementById('drawer-visits-count');
  const locEl = document.getElementById('drawer-location');
  const devEl = document.getElementById('drawer-device');
  const browserEl = document.getElementById('drawer-browser');
  const seenEl = document.getElementById('drawer-first-seen');
  const leadCard = document.getElementById('drawer-lead-card');
  const leadDetails = document.getElementById('drawer-lead-details');
  const timelineEl = document.getElementById('drawer-timeline');
  const notesInput = document.getElementById('drawer-notes-input');
  const ignoreBtn = document.getElementById('drawer-toggle-ignore-btn');

  if (titleEl) titleEl.textContent = `Visitor #${visitor?.visitor_uuid?.slice(-8) || 'Details'}`;
  if (notesInput) notesInput.value = visitor?.notes || '';
  if (ignoreBtn) {
    ignoreBtn.textContent = visitor?.is_ignored ? '✅ Un-Ignore Device' : '⛔ Ignore Device';
    ignoreBtn.onclick = () => toggleIgnoreDevice(visitorId, !visitor?.is_ignored);
  }

  const saveNotesBtn = document.getElementById('save-drawer-notes-btn');
  if (saveNotesBtn) {
    saveNotesBtn.onclick = () => saveVisitorNotes(visitorId, notesInput ? notesInput.value.trim() : '');
  }

  // Populate basic info
  if (visitor) {
    if (visitsEl) visitsEl.textContent = `${visitor.total_visits} total visit(s)`;
    if (locEl) locEl.textContent = `${visitor.last_city || 'Unknown'}, ${visitor.last_country || 'Nigeria'}`;
    if (devEl) devEl.textContent = `${visitor.last_device || 'Mobile'} (${visitor.last_os || 'Android'})`;
    if (browserEl) browserEl.textContent = visitor.last_browser || 'Chrome';
    if (seenEl) seenEl.textContent = new Date(visitor.first_seen_at).toLocaleDateString();

    // Lead Check
    if (visitor.lead_name || visitor.lead_email || visitor.lead_phone) {
      if (leadCard) leadCard.classList.remove('hidden');
      if (leadDetails) {
        leadDetails.innerHTML = `
          <div><strong>Name:</strong> ${escapeHtml(visitor.lead_name || 'N/A')}</div>
          <div><strong>Email:</strong> ${escapeHtml(visitor.lead_email || 'N/A')}</div>
          <div><strong>Phone:</strong> ${escapeHtml(visitor.lead_phone || 'N/A')}</div>
        `;
      }
    } else {
      if (leadCard) leadCard.classList.add('hidden');
    }
  }

  // Fetch session history for visitor
  if (timelineEl) {
    timelineEl.innerHTML = `<div class="p-3 text-center text-xs text-gray-400 italic font-mono">Loading session timeline...</div>`;
    try {
      const client = getSupabase();
      const { data: vSessions } = await client
        .from('visitor_sessions')
        .select('*')
        .eq('visitor_id', visitorId)
        .order('started_at', { ascending: false });

      if (!vSessions || vSessions.length === 0) {
        timelineEl.innerHTML = `<div class="p-3 text-center text-xs text-gray-400 italic">No session logs available.</div>`;
        return;
      }

      const active = vSessions.find(s => s.is_active && (Date.now() - new Date(s.last_active_at).getTime() < 120000));
      if (liveBadge) {
        liveBadge.textContent = active ? '🟢 Active Now' : 'Offline';
        liveBadge.className = active ? 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800' : 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-700';
      }

      timelineEl.innerHTML = vSessions.map((sess) => {
        const sessTime = new Date(sess.started_at).toLocaleString();
        const duration = sess.duration_seconds < 60 ? `${sess.duration_seconds}s` : `${Math.round(sess.duration_seconds / 60)}m`;
        const sections = Array.isArray(sess.sections_viewed) ? sess.sections_viewed : [];
        const actions = Array.isArray(sess.key_actions) ? sess.key_actions : [];

        return `
          <div class="p-3 rounded-lg border border-gray-200 bg-stone-50 font-mono text-xs space-y-1.5">
            <div class="flex items-center justify-between font-bold text-gray-900">
              <span>Session #${sess.session_number}</span>
              <span class="text-gray-500 font-normal text-[10px]">${sessTime}</span>
            </div>
            <div class="text-[11px] text-gray-600">
              <span>⏱️ Duration: <strong>${duration}</strong></span>
              <span class="text-stone-300">·</span>
              <span>Landing: <code>${escapeHtml(sess.landing_page || '/')}</code></span>
            </div>
            ${sections.length > 0 ? `
              <div class="pt-1">
                <span class="text-[10px] text-gray-500 block mb-0.5">Sections Explored:</span>
                <div class="flex flex-wrap gap-1">
                  ${sections.map(s => `<span class="px-1.5 py-0.2 bg-white border border-gray-300 rounded text-[10px] text-gray-700">#${escapeHtml(s)}</span>`).join('')}
                </div>
              </div>
            ` : ''}
            ${actions.length > 0 ? `
              <div class="pt-1">
                <span class="text-[10px] text-gray-500 block mb-0.5">Key Events (${actions.length}):</span>
                <div class="space-y-1 text-[11px] text-gray-800">
                  ${actions.map(a => `
                    <div class="flex items-center gap-1.5 bg-white p-1 rounded border border-gray-200">
                      <span>⚡</span>
                      <strong>${escapeHtml(a.name)}</strong>
                      <span class="text-gray-400 text-[10px] ml-auto">${new Date(a.time).toLocaleTimeString()}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    } catch (e) {
      timelineEl.innerHTML = `<div class="p-3 text-center text-xs text-red-500 italic">Error: ${escapeHtml(e.message)}</div>`;
    }
  }
}

async function saveVisitorNotes(visitorId, notes) {
  try {
    const client = getSupabase();
    if (client) {
      await client.from('visitors').update({ notes }).eq('id', visitorId);
      const v = adminVisitorsCache.find(x => x.id === visitorId);
      if (v) v.notes = notes;
      showToast('Visitor note saved.');
    }
  } catch (err) {
    showToast('Failed to save note: ' + err.message, 'error');
  }
}

async function toggleIgnoreDevice(visitorId, shouldIgnore) {
  try {
    const client = getSupabase();
    if (client) {
      await client.from('visitors').update({ is_ignored: shouldIgnore }).eq('id', visitorId);
      const v = adminVisitorsCache.find(x => x.id === visitorId);
      if (v) v.is_ignored = shouldIgnore;
      showToast(shouldIgnore ? 'Device will be ignored from tracking.' : 'Device tracking re-enabled.');
      openVisitorDetailDrawer(visitorId);
      renderAdminVisitorsTable();
    }
  } catch (err) {
    showToast('Failed to toggle ignore state: ' + err.message, 'error');
  }
}

// PUBLIC EXPORTS: MOUNT AND UNMOUNT LIFECYCLE
export function mountAndOpenAdmin(mode = 'login', tab = 'websites') {
  savedScrollPosition = window.scrollY || document.documentElement.scrollTop;
  savedActiveElement = document.activeElement;
  pendingAdminTab = tab;

  // 1. Add noindex meta tag to document head
  let robotsMeta = document.getElementById('admin-robots-meta');
  if (!robotsMeta) {
    robotsMeta = document.createElement('meta');
    robotsMeta.id = 'admin-robots-meta';
    robotsMeta.name = 'robots';
    robotsMeta.content = 'noindex, nofollow, noarchive';
    document.head.appendChild(robotsMeta);
  }

  // 2. Set neutral page title
  document.title = NEUTRAL_ADMIN_TITLE;

  // 3. Inject DOM Markup if not present
  let adminContainer = document.getElementById('private-admin-wrapper');
  if (!adminContainer) {
    adminContainer = document.createElement('div');
    adminContainer.id = 'private-admin-wrapper';
    adminContainer.innerHTML = getAdminModalsHTML();
    document.body.appendChild(adminContainer);
    setupAdminEventListeners();
  }

  // 4. Log entrance access
  logSecurityActivity('admin_entrance_accessed', { mode, timestamp: new Date().toISOString() });

  // 5. Open corresponding view
  if (mode === 'reset') {
    openAuthModal('reset');
  } else {
    openAuthModal('login');
  }
}

export function closeAndUnmountAdmin() {
  stopInactivityEngine();
  stopRealtimeNotifications();

  // Clear memory credentials
  clearLockoutState();
  const pwdInput = document.getElementById('admin-password-input');
  if (pwdInput) pwdInput.value = '';

  // Remove DOM Nodes completely (leaves NO traces in public DOM)
  const wrapper = document.getElementById('private-admin-wrapper');
  if (wrapper) wrapper.remove();

  // Remove robots noindex tag
  const robotsMeta = document.getElementById('admin-robots-meta');
  if (robotsMeta) robotsMeta.remove();

  // Restore page title
  document.title = ORIGINAL_PAGE_TITLE;

  // Restore URL back to clean path without secret hash
  try {
    history.replaceState(null, ORIGINAL_PAGE_TITLE, window.location.pathname);
  } catch (e) {
    window.location.hash = '';
  }

  // Restore body scroll and focus
  document.body.style.overflow = '';
  window.scrollTo({ top: savedScrollPosition, behavior: 'instant' });
  if (savedActiveElement && typeof savedActiveElement.focus === 'function') {
    savedActiveElement.focus();
  }
}
