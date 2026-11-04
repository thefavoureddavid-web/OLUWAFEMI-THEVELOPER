/**
 * ==============================================================
 * // EDIT: WEATHER-RESPONSIVE THEME ENGINE - /src/weather-theme.js
 * Real-time, Privacy-First Ambient Weather & Diurnal Theming
 * Portfolio: Oluwafemi David Adekanola (https://oluwafemi-theveloper.vercel.app/)
 * ==============================================================
 */

// MASTER CONFIGURATION & FEATURE SWITCHES
export const WEATHER_CONFIG = {
  enabled: true,                       // Master switch to turn weather theming on/off (Rollback Switch)
  debug: true,                         // Master switch to enable ?wxdebug=1 diagnostic HUD
  allowPreview: true,                  // Allow testing via ?wx=rain, ?wx=night, ?wx=sunny, etc.
  cacheMinutes: 30,                    // SessionStorage cache duration in minutes
  apiEndpoint: '/api/weather',         // Serverless edge helper
  directOpenMeteoFallback: true,       // Direct client fallback to Open-Meteo if edge helper is unavailable
  maxRainDrops: 35,                    // Particle cap for rain
  maxSnowFlakes: 25,                   // Particle cap for snow
  maxStars: 24,                        // Particle cap for night stars
  lightningIntervalMinMs: 9000,        // Seizure-safe minimum delay between flashes (9s)
  lightningIntervalMaxMs: 16000,       // Seizure-safe maximum delay between flashes (16s)
  lightningMaxOpacity: 0.12,           // Very gentle, low-opacity ambient flash

  // HERO GREETING TEMPLATES (Tokens: {city})
  greetings: {
    'clear-day': {
      dawn: "Good morning 🌅 Crisp morning in {city}! Perfect time to build something great.",
      day: "Good day ☀️ Sunny day in {city}! Ready to launch your next project?",
      'golden-hour': "Good afternoon 🌇 Golden hour in {city}! Great time to plan your website.",
      dusk: "Good evening 🌆 Twilight in {city}! Let's build a website that stands out.",
      night: "Good evening 🌙 Clear night in {city}! Perfect time to plan your website."
    },
    'hot-sun': {
      default: "Warm greetings 🔥 Sunny & warm in {city}! Keep cool while we build your dream site."
    },
    'clear-night': {
      default: "Good evening 🌌 Peaceful night in {city}! Perfect time to plan your website."
    },
    'rain': {
      day: "Hello 🌧️ Rainy day in {city}? Cozy weather to design your new website.",
      night: "Good evening ☔ Rainy night in {city}? Perfect time to plan your website."
    },
    'drizzle': {
      default: "Hello 🌦️ Gentle rain in {city}! Ready to turn visitors into customers?"
    },
    'thunderstorm': {
      default: "Stormy outside ⛈️ in {city}? Stay safe indoors while we craft your web app."
    },
    'snow': {
      default: "Winter greetings ❄️ Crisp weather in {city}! Let's launch your next project."
    },
    'cloudy': {
      default: "Hello ☁️ Cool, overcast day in {city}! Great day to start your web project."
    },
    'partly-cloudy': {
      default: "Good day ⛅ Pleasant weather in {city}! Ready to grow your business online?"
    },
    'fog-haze': {
      default: "Hello 🌫️ Misty day in {city}! Clear web architecture starts right here."
    },
    'harmattan-dust': {
      default: "Harmattan greetings 🏜️ in {city}! Fast, clean code for your business."
    },
    fallback: {
      dawn: "Good morning 🌅 Early start? Let's build a fast, high-converting website.",
      day: "Good day ⚡ Ready to turn website visitors into paying customers?",
      'golden-hour': "Good afternoon 🌇 Great evening ahead to plan your new website.",
      dusk: "Good evening 🌆 Perfect time to plan your business website.",
      night: "Good evening 🌙 Working late? Let's discuss your next digital project."
    }
  }
};

// Aliases for URL preview testing (?wx=...)
const WX_ALIASES = {
  sunny: 'clear-day',
  sun: 'clear-day',
  'clear-day': 'clear-day',
  day: 'clear-day',
  hot: 'hot-sun',
  'hot-sun': 'hot-sun',
  heat: 'hot-sun',
  night: 'clear-night',
  'clear-night': 'clear-night',
  dark: 'clear-night',
  rain: 'rain',
  rainy: 'rain',
  drizzle: 'drizzle',
  thunder: 'thunderstorm',
  storm: 'thunderstorm',
  thunderstorm: 'thunderstorm',
  lightning: 'thunderstorm',
  cloudy: 'cloudy',
  clouds: 'cloudy',
  overcast: 'cloudy',
  'partly-cloudy': 'partly-cloudy',
  partlycloudy: 'partly-cloudy',
  snow: 'snow',
  snowy: 'snow',
  fog: 'fog-haze',
  haze: 'fog-haze',
  'fog-haze': 'fog-haze',
  mist: 'fog-haze',
  dust: 'harmattan-dust',
  harmattan: 'harmattan-dust',
  'harmattan-dust': 'harmattan-dust'
};

// Global state
let activeThemeState = {
  category: 'clear-day',
  phase: 'day',
  temperature: 28,
  city: '',
  country: '',
  isDay: true,
  isExactLocation: false
};

// Diagnostic & Debug HUD state (Exposed safely without coordinates or IPs)
const debugState = {
  enabled: WEATHER_CONFIG.enabled,
  parsedWxParam: null,
  activeCategory: 'clear-day',
  activePhase: 'day',
  consentState: 'none',
  themeSource: 'INITIAL',
  apiStatus: 'not_requested',
  apiLatencyMs: 0,
  cacheState: 'none',
  lastError: null,
  tempAndCity: ''
};

let skyAnimationId = null;
let skyCanvas = null;
let skyCtx = null;
let particles = [];
let lightningTimer = null;
let isHeroVisible = true;
let isTabVisible = true;
let debugPanelElement = null;

/**
 * Derives fallback theme strictly from local system clock
 */
export function getLocalTimeFallbackTheme() {
  const hour = new Date().getHours();
  let phase = 'day';
  let isDay = true;
  let category = 'clear-day';

  if (hour >= 5 && hour < 7) {
    phase = 'dawn';
    category = 'clear-day';
  } else if (hour >= 7 && hour < 17) {
    phase = 'day';
    category = 'clear-day';
  } else if (hour >= 17 && hour < 19) {
    phase = 'golden-hour';
    category = 'clear-day';
  } else if (hour >= 19 && hour < 21) {
    phase = 'dusk';
    category = 'clear-night';
    isDay = false;
  } else {
    phase = 'night';
    category = 'clear-night';
    isDay = false;
  }

  return {
    category,
    weatherCategory: category,
    phase,
    temperature: isDay ? 30 : 24,
    city: '',
    country: '',
    isDay,
    fallback: true
  };
}

/**
 * Resolve friendly greeting sentence
 */
function getGreetingPhrase(category, phase, rawCity) {
  const city = rawCity ? String(rawCity).trim() : '';
  const catTemplates = WEATHER_CONFIG.greetings[category] || WEATHER_CONFIG.greetings.fallback;
  let rawTemplate = catTemplates[phase] || catTemplates.default || WEATHER_CONFIG.greetings.fallback[phase] || WEATHER_CONFIG.greetings.fallback.day;

  if (city) {
    return rawTemplate.replace('{city}', city);
  }

  // Smoothly strip "in {city}" when city is absent
  return rawTemplate
    .replace(' in {city}!', '!')
    .replace(' in {city}?', '?')
    .replace(' in {city}', '')
    .replace('{city}', '');
}

/**
 * Apply theme variables & data attributes to document
 */
export function applyTheme(data, source = 'UNKNOWN') {
  const root = document.documentElement;

  // Master switch / Rollback check
  if (!WEATHER_CONFIG.enabled) {
    root.removeAttribute('data-weather');
    root.removeAttribute('data-time-phase');
    stopSkyCanvasAnimation();
    const heroSky = document.getElementById('hero-weather-sky');
    if (heroSky) heroSky.classList.add('hidden');
    const greeting = document.getElementById('weather-hero-greeting');
    if (greeting) greeting.classList.add('opacity-0');
    debugState.enabled = false;
    debugState.themeSource = 'DISABLED';
    updateDebugPanelUI();
    return;
  }

  // Normalize category from both weatherCategory and category keys
  const category = (data.category || data.weatherCategory || 'clear-day').toLowerCase();
  const phase = data.phase || (data.isDay === false ? 'night' : 'day');
  const temp = typeof data.temperature === 'number' ? data.temperature : (phase === 'night' ? 24 : 29);
  const city = data.city || '';

  activeThemeState = {
    ...activeThemeState,
    ...data,
    category,
    phase,
    temperature: temp,
    city
  };

  debugState.activeCategory = category;
  debugState.activePhase = phase;
  debugState.themeSource = source;
  debugState.tempAndCity = `${temp}°C ${city ? '· ' + city : ''}`.trim();

  // Set data-weather and data-time-phase attributes on <html>
  root.setAttribute('data-weather', category);
  root.setAttribute('data-time-phase', phase);

  // Update hero greeting line
  updateHeroGreeting(category, phase, city);

  // Update weather chip UI
  updateWeatherChipUI(activeThemeState);

  // Re-initialize or adjust sky canvas particles
  initSkyCanvasAnimation(category);

  // Refresh debug panel HUD
  updateDebugPanelUI();
}

/**
 * Update the hero greeting text pill
 */
function updateHeroGreeting(category, phase, city) {
  const container = document.getElementById('weather-hero-greeting');
  const textEl = document.getElementById('weather-greeting-text');
  const iconEl = document.getElementById('weather-greeting-icon');
  if (!container || !textEl) return;

  const iconMap = {
    'clear-day': phase === 'golden-hour' || phase === 'dusk' ? '🌇' : (phase === 'dawn' ? '🌅' : '☀️'),
    'hot-sun': '🔥',
    'clear-night': '🌙',
    'partly-cloudy': '⛅',
    'cloudy': '☁️',
    'fog-haze': '🌫️',
    'drizzle': '🌦️',
    'rain': '🌧️',
    'thunderstorm': '⛈️',
    'snow': '❄️',
    'harmattan-dust': '🏜️'
  };

  const phrase = getGreetingPhrase(category, phase, city);
  textEl.textContent = phrase;
  if (iconEl) iconEl.textContent = iconMap[category] || '🌤️';

  container.classList.remove('opacity-0', '-translate-y-1');
  container.classList.add('opacity-100', 'translate-y-0');
}

/**
 * Update the weather chip pill and menu
 */
function updateWeatherChipUI(data) {
  const labelEl = document.getElementById('weather-chip-label');
  const statusEl = document.getElementById('weather-panel-status');
  if (!labelEl) return;

  const iconMap = {
    'clear-day': '☀️',
    'hot-sun': '🔥',
    'clear-night': '🌙',
    'partly-cloudy': '⛅',
    'cloudy': '☁️',
    'fog-haze': '🌫️',
    'drizzle': '🌦️',
    'rain': '🌧️',
    'thunderstorm': '⛈️',
    'snow': '❄️',
    'harmattan-dust': '🏜️'
  };

  const icon = iconMap[data.category] || '🌤️';
  const tempStr = typeof data.temperature === 'number' ? `${data.temperature}°C` : '';
  const cityStr = data.city || (data.fallback ? 'Local Time' : '');

  labelEl.textContent = [icon, tempStr, cityStr].filter(Boolean).join(' · ');

  if (statusEl) {
    statusEl.textContent = `${data.category.replace(/-/g, ' ').toUpperCase()} · ${tempStr} · ${cityStr || 'Auto detected'}`;
  }
}

/**
 * Resolve WMO code for direct client-side Open-Meteo fallback
 */
function resolveCategoryFromWMO(wmoCode, isDay, temp) {
  if ([95, 96, 99].includes(wmoCode)) return 'thunderstorm';
  if ([71, 73, 75, 77, 85, 86].includes(wmoCode)) return 'snow';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(wmoCode)) return 'rain';
  if ([51, 53, 55, 56, 57].includes(wmoCode)) return 'drizzle';
  if ([45, 48].includes(wmoCode)) return 'fog-haze';
  if (wmoCode === 3) return 'cloudy';
  if (wmoCode === 2) return 'partly-cloudy';
  if (isDay) {
    return temp >= 33 ? 'hot-sun' : 'clear-day';
  }
  return 'clear-night';
}

/**
 * Fetch weather from serverless API with caching and error fallbacks
 */
export async function fetchWeather(customCoords = null) {
  if (!WEATHER_CONFIG.enabled) {
    applyTheme({}, 'DISABLED');
    return;
  }

  // 1. PRIORITY #1: URL PREVIEW OVERRIDE (?wx=rain, ?wx=night, etc.)
  // Must execute BEFORE privacy or localStorage checks so test links always work immediately!
  if (WEATHER_CONFIG.allowPreview) {
    const params = new URLSearchParams(window.location.search);
    const wxParam = params.get('wx');
    if (wxParam) {
      debugState.parsedWxParam = wxParam;
      const lower = wxParam.toLowerCase().trim();
      const previewCat = WX_ALIASES[lower] || lower;
      const isNight = previewCat === 'clear-night';

      applyTheme({
        category: previewCat,
        weatherCategory: previewCat,
        phase: isNight ? 'night' : (previewCat === 'clear-day' ? 'day' : 'day'),
        temperature: previewCat === 'hot-sun' ? 36 : (isNight ? 23 : 28),
        city: 'Preview Mode',
        country: '',
        isDay: !isNight,
        preview: true
      }, 'URL_OVERRIDE');
      return;
    }
  }

  // 2. PRIORITY #2: USER MANUAL PREFERENCE IN LOCAL STORAGE
  try {
    const userMode = localStorage.getItem('femi_weather_mode');
    if (userMode && userMode !== 'auto') {
      if (userMode === 'off') {
        document.documentElement.removeAttribute('data-weather');
        document.documentElement.removeAttribute('data-time-phase');
        stopSkyCanvasAnimation();
        const greeting = document.getElementById('weather-hero-greeting');
        if (greeting) greeting.classList.add('opacity-0');
        debugState.themeSource = 'USER_OFF';
        updateDebugPanelUI();
        return;
      }
      const isNight = userMode === 'clear-night';
      applyTheme({
        category: userMode,
        weatherCategory: userMode,
        phase: isNight ? 'night' : 'day',
        temperature: isNight ? 24 : 30,
        city: 'Manual Mode',
        country: '',
        isDay: !isNight
      }, 'LOCAL_STORAGE');
      return;
    }
  } catch (e) {}

  // 3. PRIORITY #3: PRIVACY CONSENT CHECK
  try {
    const consent = localStorage.getItem('femi_privacy_consent') || 'none';
    debugState.consentState = consent;
    if (consent === 'declined' && !customCoords) {
      applyTheme(getLocalTimeFallbackTheme(), 'CONSENT_DECLINED_CLOCK');
      return;
    }
  } catch (e) {}

  // 4. PRIORITY #4: SESSION STORAGE CACHE (Skip if customCoords requested)
  const now = Date.now();
  if (!customCoords) {
    try {
      const cachedRaw = sessionStorage.getItem('femi_weather_cache');
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached && now - cached.timestamp < WEATHER_CONFIG.cacheMinutes * 60 * 1000) {
          debugState.cacheState = 'HIT';
          applyTheme(cached.data, 'SESSION_CACHE');
          return;
        }
      }
    } catch (e) {}
  }
  debugState.cacheState = 'MISS';

  // 5. QUERY SERVERLESS EDGE FUNCTION (/api/weather)
  const startTime = Date.now();
  try {
    let url = WEATHER_CONFIG.apiEndpoint;
    if (customCoords) {
      url += `?lat=${encodeURIComponent(customCoords.lat)}&lon=${encodeURIComponent(customCoords.lon)}`;
    }

    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), 4500);

    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(fetchTimeout);

    const latency = Date.now() - startTime;
    debugState.apiLatencyMs = latency;
    debugState.apiStatus = `HTTP ${res.status}`;

    if (!res.ok) throw new Error(`Edge API HTTP ${res.status}`);
    const data = await res.json();

    if (data && data.success) {
      applyTheme(data, 'API_VERCEL');
      try {
        sessionStorage.setItem('femi_weather_cache', JSON.stringify({
          timestamp: now,
          data
        }));
      } catch (e) {}
      return;
    } else {
      throw new Error("Invalid payload structure from /api/weather");
    }

  } catch (apiErr) {
    debugState.lastError = apiErr.message || String(apiErr);
    console.warn("Weather serverless API call failed, evaluating client fallback:", apiErr);

    // 6. DIRECT CLIENT OPEN-METEO FALLBACK (Free, Public, No Secrets, Allowed by CSP)
    if (WEATHER_CONFIG.directOpenMeteoFallback) {
      try {
        const lat = customCoords ? customCoords.lat : 8.4966; // Default to Ilorin, Nigeria
        const lon = customCoords ? customCoords.lon : 4.5421;
        const roundedLat = Math.round(lat * 10) / 10;
        const roundedLon = Math.round(lon * 10) / 10;

        const directController = new AbortController();
        const directTimeout = setTimeout(() => directController.abort(), 3500);

        const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${roundedLat}&longitude=${roundedLon}&current=temperature_2m,weather_code,is_day&daily=sunrise,sunset&timezone=auto`;
        const directRes = await fetch(openMeteoUrl, {
          signal: directController.signal,
          headers: { 'Accept': 'application/json' }
        });
        clearTimeout(directTimeout);

        if (directRes.ok) {
          const mData = await directRes.json();
          const cur = mData.current || {};
          const isDay = cur.is_day === 1 || cur.is_day === true;
          const temp = Math.round(cur.temperature_2m ?? 28);
          const wmo = cur.weather_code ?? 0;
          const category = resolveCategoryFromWMO(wmo, isDay, temp);

          debugState.apiStatus = 'DIRECT_OPEN_METEO (HTTP 200)';
          applyTheme({
            category,
            weatherCategory: category,
            temperature: temp,
            isDay,
            phase: isDay ? 'day' : 'night',
            city: customCoords ? 'Your Area' : 'Ilorin',
            country: 'Nigeria',
            weatherCode: wmo
          }, 'DIRECT_METEO');
          return;
        }
      } catch (directErr) {
        debugState.lastError = `Direct Open-Meteo failed: ${directErr.message}`;
      }
    }

    // 7. FINAL ERROR-FREE FALLBACK: SYSTEM CLOCK DIURNAL CYCLE
    applyTheme(getLocalTimeFallbackTheme(), 'CLOCK_FALLBACK');
  }
}

/**
 * ==============================================================
 * LIGHTWEIGHT SKY BACKDROP CANVAS ANIMATION
 * ==============================================================
 */
function initSkyCanvasAnimation(category) {
  // Check reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    stopSkyCanvasAnimation();
    return;
  }

  // Low-end device particle throttle
  const isLowEnd = typeof navigator !== 'undefined' && navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4;
  const particleScale = isLowEnd ? 0.4 : 1.0;

  if (!skyCanvas) {
    skyCanvas = document.getElementById('weather-sky-canvas');
  }
  if (!skyCanvas) return;

  skyCtx = skyCanvas.getContext('2d');
  resizeSkyCanvas();

  particles = [];
  if (lightningTimer) {
    clearTimeout(lightningTimer);
    lightningTimer = null;
  }

  const w = skyCanvas.width;
  const h = skyCanvas.height;

  if (category === 'rain' || category === 'drizzle' || category === 'thunderstorm') {
    const count = Math.round((category === 'drizzle' ? 18 : WEATHER_CONFIG.maxRainDrops) * particleScale);
    for (let i = 0; i < count; i++) {
      particles.push({
        type: 'rain',
        x: Math.random() * w,
        y: Math.random() * h,
        len: Math.random() * 16 + 10,
        speed: Math.random() * 8 + 12,
        opacity: Math.random() * 0.4 + 0.2
      });
    }

    if (category === 'thunderstorm') {
      scheduleNextLightningFlash();
    }

  } else if (category === 'snow') {
    const count = Math.round(WEATHER_CONFIG.maxSnowFlakes * particleScale);
    for (let i = 0; i < count; i++) {
      particles.push({
        type: 'snow',
        x: Math.random() * w,
        y: Math.random() * h,
        radius: Math.random() * 2.5 + 1,
        speed: Math.random() * 1.5 + 0.6,
        drift: Math.random() * 0.8 - 0.4,
        angle: Math.random() * Math.PI * 2,
        opacity: Math.random() * 0.6 + 0.3
      });
    }

  } else if (category === 'clear-night') {
    const count = Math.round(WEATHER_CONFIG.maxStars * particleScale);
    for (let i = 0; i < count; i++) {
      particles.push({
        type: 'star',
        x: Math.random() * w,
        y: Math.random() * (h * 0.8),
        radius: Math.random() * 1.2 + 0.6,
        twinkleSpeed: Math.random() * 0.03 + 0.01,
        alpha: Math.random(),
        baseAlpha: Math.random() * 0.5 + 0.4
      });
    }

  } else if (category === 'cloudy' || category === 'partly-cloudy') {
    const count = category === 'cloudy' ? 4 : 2;
    for (let i = 0; i < count; i++) {
      particles.push({
        type: 'cloud',
        x: Math.random() * w,
        y: Math.random() * (h * 0.5) + 10,
        width: Math.random() * 140 + 120,
        height: Math.random() * 30 + 35,
        speed: Math.random() * 0.2 + 0.1,
        opacity: Math.random() * 0.12 + 0.08
      });
    }

  } else if (category === 'harmattan-dust' || category === 'fog-haze') {
    const count = Math.round(18 * particleScale);
    for (let i = 0; i < count; i++) {
      particles.push({
        type: 'dust',
        x: Math.random() * w,
        y: Math.random() * h,
        radius: Math.random() * 3 + 1.5,
        speedX: Math.random() * 0.5 + 0.2,
        speedY: Math.random() * 0.3 - 0.15,
        opacity: Math.random() * 0.15 + 0.08
      });
    }
  }

  startSkyCanvasLoop();
}

function resizeSkyCanvas() {
  if (!skyCanvas) return;
  const rect = skyCanvas.parentElement ? skyCanvas.parentElement.getBoundingClientRect() : { width: window.innerWidth, height: 600 };
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  skyCanvas.width = (rect.width || window.innerWidth) * dpr;
  skyCanvas.height = (rect.height || 600) * dpr;
  if (skyCtx) {
    skyCtx.scale(dpr, dpr);
  }
}

function startSkyCanvasLoop() {
  stopSkyCanvasAnimation();

  function render() {
    if (!skyCtx || !skyCanvas) return;
    if (!isHeroVisible || !isTabVisible) {
      skyAnimationId = requestAnimationFrame(render);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = skyCanvas.width / dpr;
    const h = skyCanvas.height / dpr;

    skyCtx.clearRect(0, 0, w, h);

    const category = activeThemeState.category;

    // Render gentle daytime sun glow in clear-day / hot-sun
    if (category === 'clear-day' || category === 'hot-sun') {
      const sunX = w * 0.85;
      const sunY = h * 0.25;
      const grad = skyCtx.createRadialGradient(sunX, sunY, 10, sunX, sunY, category === 'hot-sun' ? 220 : 160);
      grad.addColorStop(0, category === 'hot-sun' ? 'rgba(251, 146, 60, 0.28)' : 'rgba(253, 224, 71, 0.22)');
      grad.addColorStop(0.5, 'rgba(254, 215, 170, 0.08)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      skyCtx.fillStyle = grad;
      skyCtx.beginPath();
      skyCtx.arc(sunX, sunY, 220, 0, Math.PI * 2);
      skyCtx.fill();
    }

    // Render gentle crescent moon in clear-night
    if (category === 'clear-night') {
      const moonX = w * 0.88;
      const moonY = 40;
      skyCtx.save();
      skyCtx.fillStyle = 'rgba(254, 240, 138, 0.85)';
      skyCtx.beginPath();
      skyCtx.arc(moonX, moonY, 14, 0, Math.PI * 2);
      skyCtx.fill();
      skyCtx.globalCompositeOperation = 'destination-out';
      skyCtx.beginPath();
      skyCtx.arc(moonX - 5, moonY - 3, 12, 0, Math.PI * 2);
      skyCtx.fill();
      skyCtx.restore();
    }

    // Update and draw active particles
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      if (p.type === 'rain') {
        skyCtx.strokeStyle = category === 'thunderstorm' ? `rgba(186, 230, 253, ${p.opacity})` : `rgba(148, 163, 184, ${p.opacity})`;
        skyCtx.lineWidth = 1.2;
        skyCtx.beginPath();
        skyCtx.moveTo(p.x, p.y);
        skyCtx.lineTo(p.x - 2, p.y + p.len);
        skyCtx.stroke();

        p.y += p.speed;
        p.x -= 1.2;
        if (p.y > h) {
          p.y = -10;
          p.x = Math.random() * w + 20;
        }

      } else if (p.type === 'snow') {
        skyCtx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
        skyCtx.beginPath();
        skyCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        skyCtx.fill();

        p.y += p.speed;
        p.angle += 0.02;
        p.x += Math.sin(p.angle) * 0.6 + p.drift;

        if (p.y > h) {
          p.y = -5;
          p.x = Math.random() * w;
        }

      } else if (p.type === 'star') {
        p.alpha += p.twinkleSpeed;
        const currentAlpha = p.baseAlpha + Math.sin(p.alpha) * 0.35;
        skyCtx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.1, currentAlpha)})`;
        skyCtx.beginPath();
        skyCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        skyCtx.fill();

      } else if (p.type === 'cloud') {
        skyCtx.fillStyle = `rgba(226, 232, 240, ${p.opacity})`;
        skyCtx.beginPath();
        skyCtx.ellipse(p.x, p.y, p.width / 2, p.height / 2, 0, 0, Math.PI * 2);
        skyCtx.fill();

        p.x += p.speed;
        if (p.x - p.width / 2 > w) {
          p.x = -p.width;
        }

      } else if (p.type === 'dust') {
        skyCtx.fillStyle = category === 'harmattan-dust' ? `rgba(217, 119, 6, ${p.opacity})` : `rgba(148, 163, 184, ${p.opacity})`;
        skyCtx.beginPath();
        skyCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        skyCtx.fill();

        p.x += p.speedX;
        p.y += p.speedY;
        if (p.x > w) p.x = 0;
        if (p.y > h) p.y = 0;
        if (p.y < 0) p.y = h;
      }
    }

    skyAnimationId = requestAnimationFrame(render);
  }

  skyAnimationId = requestAnimationFrame(render);
}

function stopSkyCanvasAnimation() {
  if (skyAnimationId) {
    cancelAnimationFrame(skyAnimationId);
    skyAnimationId = null;
  }
}

/**
 * Gentle, seizure-safe thunderstorm flash (at most once every 9-16 seconds)
 */
function scheduleNextLightningFlash() {
  if (lightningTimer) clearTimeout(lightningTimer);

  const delay = Math.floor(
    Math.random() * (WEATHER_CONFIG.lightningIntervalMaxMs - WEATHER_CONFIG.lightningIntervalMinMs) + 
    WEATHER_CONFIG.lightningIntervalMinMs
  );

  lightningTimer = setTimeout(() => {
    if (activeThemeState.category === 'thunderstorm' && isHeroVisible && isTabVisible) {
      const flashEl = document.getElementById('weather-lightning-flash');
      if (flashEl) {
        flashEl.style.opacity = String(WEATHER_CONFIG.lightningMaxOpacity);
        setTimeout(() => {
          flashEl.style.opacity = '0';
        }, 180);
      }
    }
    scheduleNextLightningFlash();
  }, delay);
}

/**
 * ==============================================================
 * STEP 2: DEBUG PANEL (?wxdebug=1)
 * Diagnostic HUD showing theme states without exposing coordinates or IPs
 * ==============================================================
 */
function initDebugPanel() {
  if (!WEATHER_CONFIG.debug) return;

  const params = new URLSearchParams(window.location.search);
  const isDebugRequested = params.get('wxdebug') === '1' || params.has('wxdebug');
  if (!isDebugRequested) return;

  if (document.getElementById('weather-debug-hud')) return;

  const hud = document.createElement('div');
  hud.id = 'weather-debug-hud';
  hud.className = 'fixed bottom-4 left-4 z-[99999] max-w-sm w-[340px] bg-stone-950/95 text-stone-200 border-2 border-amber-500 rounded-xl shadow-[4px_4px_0px_#000] p-3 text-xs font-mono backdrop-blur-md transition-all select-none';
  hud.innerHTML = `
    <div class="flex items-center justify-between border-b border-stone-800 pb-1.5 mb-2">
      <div class="flex items-center gap-1.5 font-bold text-amber-400">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span>⚡ WEATHER DEBUG HUD</span>
      </div>
      <div class="flex items-center gap-1 text-[11px]">
        <button id="wx-hud-minimize-btn" class="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300">_</button>
        <button id="wx-hud-close-btn" class="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-red-700 text-stone-300 font-bold">&times;</button>
      </div>
    </div>

    <div id="wx-hud-body" class="space-y-1.5 text-[11px]">
      <div class="flex justify-between py-0.5 border-b border-stone-900">
        <span class="text-stone-400">Engine State:</span>
        <span id="wx-hud-enabled" class="font-bold text-emerald-400">ENABLED</span>
      </div>
      <div class="flex justify-between py-0.5 border-b border-stone-900">
        <span class="text-stone-400">Parsed ?wx Param:</span>
        <span id="wx-hud-param" class="font-bold text-amber-300">none</span>
      </div>
      <div class="flex justify-between py-0.5 border-b border-stone-900">
        <span class="text-stone-400">data-weather:</span>
        <span id="wx-hud-data-weather" class="font-bold text-sky-400">clear-day</span>
      </div>
      <div class="flex justify-between py-0.5 border-b border-stone-900">
        <span class="text-stone-400">data-time-phase:</span>
        <span id="wx-hud-data-phase" class="text-stone-300">day</span>
      </div>
      <div class="flex justify-between py-0.5 border-b border-stone-900">
        <span class="text-stone-400">Theme Source:</span>
        <span id="wx-hud-source" class="font-bold text-orange-400">INITIAL</span>
      </div>
      <div class="flex justify-between py-0.5 border-b border-stone-900">
        <span class="text-stone-400">Consent State:</span>
        <span id="wx-hud-consent" class="text-stone-300">none</span>
      </div>
      <div class="flex justify-between py-0.5 border-b border-stone-900">
        <span class="text-stone-400">API Call / Status:</span>
        <span id="wx-hud-api" class="text-stone-300">pending</span>
      </div>
      <div class="flex justify-between py-0.5 border-b border-stone-900">
        <span class="text-stone-400">Session Cache:</span>
        <span id="wx-hud-cache" class="text-stone-300">none</span>
      </div>
      <div class="flex justify-between py-0.5 border-b border-stone-900">
        <span class="text-stone-400">Detected Temp / City:</span>
        <span id="wx-hud-temp-city" class="text-stone-200">28°C</span>
      </div>
      <div id="wx-hud-error-row" class="hidden py-0.5 text-red-400 border-b border-stone-900 text-[10px]">
        <span>Error:</span> <span id="wx-hud-error-text"></span>
      </div>

      <!-- Quick Test Swatch Buttons -->
      <div class="pt-1.5">
        <div class="text-[10px] text-stone-400 mb-1">Instant Preview Overrides:</div>
        <div class="grid grid-cols-4 gap-1">
          <button type="button" class="wx-test-btn px-1.5 py-1 bg-stone-900 hover:bg-amber-600 hover:text-white rounded border border-stone-700 text-[10px] text-center" data-val="rain">🌧️ Rain</button>
          <button type="button" class="wx-test-btn px-1.5 py-1 bg-stone-900 hover:bg-amber-600 hover:text-white rounded border border-stone-700 text-[10px] text-center" data-val="night">🌙 Night</button>
          <button type="button" class="wx-test-btn px-1.5 py-1 bg-stone-900 hover:bg-amber-600 hover:text-white rounded border border-stone-700 text-[10px] text-center" data-val="sunny">☀️ Sunny</button>
          <button type="button" class="wx-test-btn px-1.5 py-1 bg-stone-900 hover:bg-amber-600 hover:text-white rounded border border-stone-700 text-[10px] text-center" data-val="storm">⛈️ Storm</button>
          <button type="button" class="wx-test-btn px-1.5 py-1 bg-stone-900 hover:bg-amber-600 hover:text-white rounded border border-stone-700 text-[10px] text-center" data-val="hot">🔥 Hot</button>
          <button type="button" class="wx-test-btn px-1.5 py-1 bg-stone-900 hover:bg-amber-600 hover:text-white rounded border border-stone-700 text-[10px] text-center" data-val="cloudy">⛅ Cloudy</button>
          <button type="button" class="wx-test-btn px-1.5 py-1 bg-stone-900 hover:bg-amber-600 hover:text-white rounded border border-stone-700 text-[10px] text-center" data-val="dust">🏜️ Dust</button>
          <button type="button" id="wx-hud-refresh-btn" class="px-1.5 py-1 bg-emerald-950 hover:bg-emerald-600 hover:text-white rounded border border-emerald-700 text-[10px] text-center text-emerald-300">🔄 Auto</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(hud);
  debugPanelElement = hud;

  // Minimize handler
  const minBtn = document.getElementById('wx-hud-minimize-btn');
  const bodyEl = document.getElementById('wx-hud-body');
  if (minBtn && bodyEl) {
    let minimized = false;
    minBtn.addEventListener('click', () => {
      minimized = !minimized;
      bodyEl.style.display = minimized ? 'none' : 'block';
      minBtn.textContent = minimized ? '+' : '_';
    });
  }

  // Close handler
  const closeBtn = document.getElementById('wx-hud-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => hud.remove());
  }

  // Swatch test buttons
  hud.querySelectorAll('.wx-test-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-val');
      if (val) {
        const cat = WX_ALIASES[val] || val;
        applyTheme({
          category: cat,
          weatherCategory: cat,
          phase: cat === 'clear-night' ? 'night' : 'day',
          temperature: cat === 'hot-sun' ? 36 : (cat === 'clear-night' ? 24 : 29),
          city: 'Preview HUD',
          country: '',
          isDay: cat !== 'clear-night',
          preview: true
        }, `HUD_OVERRIDE (${val})`);
      }
    });
  });

  const refreshBtn = document.getElementById('wx-hud-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      try {
        sessionStorage.removeItem('femi_weather_cache');
        localStorage.removeItem('femi_weather_mode');
      } catch (e) {}
      fetchWeather();
    });
  }

  updateDebugPanelUI();
}

/**
 * Update UI inside the Debug HUD
 */
function updateDebugPanelUI() {
  if (!debugPanelElement) return;

  const elEnabled = document.getElementById('wx-hud-enabled');
  const elParam = document.getElementById('wx-hud-param');
  const elDataWeather = document.getElementById('wx-hud-data-weather');
  const elDataPhase = document.getElementById('wx-hud-data-phase');
  const elSource = document.getElementById('wx-hud-source');
  const elConsent = document.getElementById('wx-hud-consent');
  const elApi = document.getElementById('wx-hud-api');
  const elCache = document.getElementById('wx-hud-cache');
  const elTempCity = document.getElementById('wx-hud-temp-city');
  const elErrRow = document.getElementById('wx-hud-error-row');
  const elErrText = document.getElementById('wx-hud-error-text');

  if (elEnabled) {
    elEnabled.textContent = WEATHER_CONFIG.enabled ? 'ENABLED' : 'DISABLED';
    elEnabled.className = WEATHER_CONFIG.enabled ? 'font-bold text-emerald-400' : 'font-bold text-red-500';
  }
  if (elParam) {
    elParam.textContent = debugState.parsedWxParam || 'none';
  }
  if (elDataWeather) {
    elDataWeather.textContent = document.documentElement.getAttribute('data-weather') || activeThemeState.category || 'none';
  }
  if (elDataPhase) {
    elDataPhase.textContent = document.documentElement.getAttribute('data-time-phase') || activeThemeState.phase || 'day';
  }
  if (elSource) {
    elSource.textContent = debugState.themeSource;
  }
  if (elConsent) {
    elConsent.textContent = debugState.consentState;
  }
  if (elApi) {
    const latStr = debugState.apiLatencyMs ? ` (${debugState.apiLatencyMs}ms)` : '';
    elApi.textContent = `${debugState.apiStatus}${latStr}`;
  }
  if (elCache) {
    elCache.textContent = debugState.cacheState;
  }
  if (elTempCity) {
    elTempCity.textContent = debugState.tempAndCity || `${activeThemeState.temperature}°C ${activeThemeState.city ? '· ' + activeThemeState.city : ''}`;
  }
  if (elErrRow && elErrText) {
    if (debugState.lastError) {
      elErrRow.classList.remove('hidden');
      elErrText.textContent = debugState.lastError;
    } else {
      elErrRow.classList.add('hidden');
    }
  }
}

/**
 * ==============================================================
 * USER CONTROL WIDGET INITIALIZATION
 * ==============================================================
 */
function initWeatherControls() {
  const chipBtn = document.getElementById('weather-chip-widget');
  const panel = document.getElementById('weather-theme-panel');
  const closeBtn = document.getElementById('close-weather-panel-btn');
  const exactLocBtn = document.getElementById('use-exact-location-btn');
  const themeButtons = document.querySelectorAll('.weather-theme-choice-btn');

  if (chipBtn && panel) {
    chipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target) && e.target !== chipBtn && !chipBtn.contains(e.target)) {
        panel.classList.add('hidden');
      }
    });
  }

  if (closeBtn && panel) {
    closeBtn.addEventListener('click', () => panel.classList.add('hidden'));
  }

  // Theme manual switcher buttons
  themeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      if (!mode) return;

      try {
        localStorage.setItem('femi_weather_mode', mode);
      } catch (e) {}

      if (panel) panel.classList.add('hidden');

      if (mode === 'auto') {
        try {
          sessionStorage.removeItem('femi_weather_cache');
        } catch (e) {}
        fetchWeather();
      } else if (mode === 'off') {
        document.documentElement.removeAttribute('data-weather');
        document.documentElement.removeAttribute('data-time-phase');
        stopSkyCanvasAnimation();
        const greeting = document.getElementById('weather-hero-greeting');
        if (greeting) greeting.classList.add('opacity-0');
        const label = document.getElementById('weather-chip-label');
        if (label) label.textContent = '⊘ Weather Theme Off';
        debugState.themeSource = 'USER_OFF';
        updateDebugPanelUI();
      } else {
        const isNight = mode === 'clear-night';
        applyTheme({
          category: mode,
          weatherCategory: mode,
          phase: isNight ? 'night' : 'day',
          temperature: isNight ? 24 : 31,
          city: 'Manual Mode',
          country: '',
          isDay: !isNight
        }, 'USER_CLICK');
      }
    });
  });

  // Optional "📍 Use my exact location" user-initiated chip
  if (exactLocBtn) {
    exactLocBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        if (typeof window.showCustomToast === 'function') {
          window.showCustomToast("Geolocation is not supported by your browser.", "error");
        }
        return;
      }

      exactLocBtn.textContent = '📍 Locating...';
      exactLocBtn.disabled = true;

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          exactLocBtn.textContent = '✓ Location Applied';
          setTimeout(() => {
            exactLocBtn.textContent = '📍 Use my exact location';
            exactLocBtn.disabled = false;
          }, 3000);

          if (panel) panel.classList.add('hidden');

          // Strictly in-memory query, never stored in localStorage
          fetchWeather({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude
          });

          if (typeof window.showCustomToast === 'function') {
            window.showCustomToast("Weather theme updated with your local coordinates!", "success");
          }
        },
        (err) => {
          exactLocBtn.textContent = '📍 Use my exact location';
          exactLocBtn.disabled = false;
          if (typeof window.showCustomToast === 'function') {
            window.showCustomToast("Location permission was not granted. Using time-of-day theme.", "error");
          }
          // Silent fallback to time-of-day
          applyTheme(getLocalTimeFallbackTheme(), 'GEOLOCATION_DENIED_FALLBACK');
        },
        { timeout: 8000, maximumAge: 600000, enableHighAccuracy: false }
      );
    });
  }
}

/**
 * ==============================================================
 * SYNCHRONOUS EARLY CHECK FOR ?wx= PREVIEW & CACHE
 * Executes immediately on module evaluation to eliminate theme flicker
 * ==============================================================
 */
(function earlyPreviewCheck() {
  if (typeof window === 'undefined') return;

  const params = new URLSearchParams(window.location.search);
  const wxParam = params.get('wx');

  if (wxParam && WEATHER_CONFIG.enabled && WEATHER_CONFIG.allowPreview) {
    debugState.parsedWxParam = wxParam;
    const lower = wxParam.toLowerCase().trim();
    const cat = WX_ALIASES[lower] || lower;
    document.documentElement.setAttribute('data-weather', cat);
    document.documentElement.setAttribute('data-time-phase', cat === 'clear-night' ? 'night' : 'day');
  }
})();

/**
 * ==============================================================
 * MAIN ENTRY POINT
 * ==============================================================
 */
export function initWeatherTheme() {
  if (!WEATHER_CONFIG.enabled) {
    document.documentElement.removeAttribute('data-weather');
    document.documentElement.removeAttribute('data-time-phase');
    return;
  }

  try {
    initWeatherControls();
    initDebugPanel();

    // IntersectionObserver to pause particles when hero is scrolled out
    const heroEl = document.getElementById('hero');
    if (heroEl && 'IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          isHeroVisible = entry.isIntersecting;
        });
      }, { threshold: 0.1 });
      observer.observe(heroEl);
    }

    // Visibility change listener: pause canvas & refresh if hidden > 30 minutes
    let hiddenAt = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        isTabVisible = false;
        hiddenAt = Date.now();
      } else {
        isTabVisible = true;
        if (hiddenAt && Date.now() - hiddenAt > 30 * 60 * 1000) {
          fetchWeather(); // Refresh weather on stale return
        }
      }
    });

    window.addEventListener('resize', resizeSkyCanvas);

    // Initial weather evaluation
    fetchWeather();

  } catch (err) {
    console.warn("Weather theming initialization swallowed (isolated):", err);
  }
}

// Self-initialize if loaded as standalone module script
if (typeof window !== 'undefined' && document.readyState !== 'loading') {
  initWeatherTheme();
} else if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => initWeatherTheme());
}
