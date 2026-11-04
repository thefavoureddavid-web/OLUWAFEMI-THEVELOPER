/**
 * ==============================================================
 * // EDIT: WEATHER-RESPONSIVE THEME ENGINE - /src/weather-theme.js
 * Real-time, Privacy-First Ambient Weather & Diurnal Theming
 * Portfolio: Oluwafemi David Adekanola (https://oluwafemi-theveloper.vercel.app/)
 * ==============================================================
 */

// EDIT: MASTER CONFIGURATION & FEATURE FLAGS
export const WEATHER_CONFIG = {
  enabled: true,                       // Master switch to turn weather theming on/off
  allowPreview: true,                   // Allow testing via ?wx=rain, ?wx=night, ?wx=sunny, etc.
  cacheMinutes: 30,                    // SessionStorage cache duration in minutes
  apiEndpoint: '/api/weather',         // Serverless edge helper
  maxRainDrops: 35,                    // Particle cap for rain
  maxSnowFlakes: 25,                   // Particle cap for snow
  maxStars: 22,                        // Particle cap for night stars
  lightningIntervalMinMs: 9000,        // Seizure-safe minimum delay between flashes (9s)
  lightningIntervalMaxMs: 16000,       // Seizure-safe maximum delay between flashes (16s)
  lightningMaxOpacity: 0.12,           // Very gentle, low-opacity ambient flash

  // EDIT: HERO GREETING TEMPLATES (Tokens: {city})
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

let skyAnimationId = null;
let skyCanvas = null;
let skyCtx = null;
let particles = [];
let lightningTimer = null;
let isHeroVisible = true;
let isTabVisible = true;

/**
 * Derives fallback theme strictly from local system clock
 */
function getLocalTimeFallbackTheme() {
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
function applyTheme(data) {
  if (!WEATHER_CONFIG.enabled) return;

  activeThemeState = { ...activeThemeState, ...data };
  const root = document.documentElement;

  // Set data-weather and data-time-phase attributes
  root.setAttribute('data-weather', data.category);
  root.setAttribute('data-time-phase', data.phase || 'day');

  // Update hero greeting line
  updateHeroGreeting(data.category, data.phase, data.city);

  // Update weather chip UI
  updateWeatherChipUI(data);

  // Re-initialize or adjust sky canvas particles
  initSkyCanvasAnimation(data.category);
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
 * Fetch weather from serverless API with caching
 */
async function fetchWeather(customCoords = null) {
  // Check Privacy Consent: If visitor explicitly declined cookie/tracking, do not call location API
  try {
    if (localStorage.getItem('femi_privacy_consent') === 'declined') {
      applyTheme(getLocalTimeFallbackTheme());
      return;
    }
  } catch (e) {}

  // Check custom override mode in localStorage
  try {
    const userMode = localStorage.getItem('femi_weather_mode');
    if (userMode && userMode !== 'auto') {
      if (userMode === 'off') {
        document.documentElement.removeAttribute('data-weather');
        document.documentElement.removeAttribute('data-time-phase');
        return;
      }
      applyTheme({
        category: userMode,
        phase: userMode === 'clear-night' ? 'night' : 'day',
        temperature: 28,
        city: 'Preview',
        country: '',
        isDay: userMode !== 'clear-night'
      });
      return;
    }
  } catch (e) {}

  // Check URL Preview Override (if enabled)
  if (WEATHER_CONFIG.allowPreview) {
    const params = new URLSearchParams(window.location.search);
    const wxParam = params.get('wx');
    if (wxParam) {
      const aliasMap = {
        sunny: 'clear-day',
        hot: 'hot-sun',
        night: 'clear-night',
        rain: 'rain',
        thunder: 'thunderstorm',
        storm: 'thunderstorm',
        fog: 'fog-haze',
        haze: 'fog-haze',
        dust: 'harmattan-dust',
        harmattan: 'harmattan-dust',
        cloudy: 'cloudy',
        snow: 'snow'
      };
      const previewCat = aliasMap[wxParam.toLowerCase()] || wxParam;
      applyTheme({
        category: previewCat,
        phase: previewCat === 'clear-night' ? 'night' : 'day',
        temperature: previewCat === 'hot-sun' ? 36 : 28,
        city: 'Preview Mode',
        country: '',
        isDay: previewCat !== 'clear-night',
        preview: true
      });
      return;
    }
  }

  // Check SessionStorage Cache (unless customCoords provided)
  const now = Date.now();
  if (!customCoords) {
    try {
      const cachedRaw = sessionStorage.getItem('femi_weather_cache');
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached && now - cached.timestamp < WEATHER_CONFIG.cacheMinutes * 60 * 1000) {
          applyTheme(cached.data);
          return;
        }
      }
    } catch (e) {}
  }

  // Query Serverless Function /api/weather
  try {
    let url = WEATHER_CONFIG.apiEndpoint;
    if (customCoords) {
      url += `?lat=${encodeURIComponent(customCoords.lat)}&lon=${encodeURIComponent(customCoords.lon)}`;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data && data.success) {
      applyTheme(data);
      try {
        sessionStorage.setItem('femi_weather_cache', JSON.stringify({
          timestamp: now,
          data
        }));
      } catch (e) {}
    } else {
      throw new Error("Invalid payload format");
    }
  } catch (err) {
    // Silent fallback to local time-of-day theme
    applyTheme(getLocalTimeFallbackTheme());
  }
}

/**
 * ==============================================================
 * LIGHTWEIGHT SKY BACKDROP CANVAS ANIMATION
 * ==============================================================
 */
function initSkyCanvasAnimation(category) {
  // Check reduced motion
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
    clearInterval(lightningTimer);
    lightningTimer = null;
  }

  const w = skyCanvas.width;
  const h = skyCanvas.height;

  if (category === 'rain' || category === 'drizzle' || category === 'thunderstorm') {
    const count = Math.round((category === 'drizzle' ? 20 : WEATHER_CONFIG.maxRainDrops) * particleScale);
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
        fetchWeather();
      } else if (mode === 'off') {
        document.documentElement.removeAttribute('data-weather');
        document.documentElement.removeAttribute('data-time-phase');
        stopSkyCanvasAnimation();
        const greeting = document.getElementById('weather-hero-greeting');
        if (greeting) greeting.classList.add('opacity-0');
        const label = document.getElementById('weather-chip-label');
        if (label) label.textContent = '⊘ Weather Theme Off';
      } else {
        applyTheme({
          category: mode,
          phase: mode === 'clear-night' ? 'night' : 'day',
          temperature: mode === 'clear-night' ? 24 : 31,
          city: 'Manual Mode',
          country: '',
          isDay: mode !== 'clear-night'
        });
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
          applyTheme(getLocalTimeFallbackTheme());
        },
        { timeout: 8000, maximumAge: 600000, enableHighAccuracy: false }
      );
    });
  }
}

/**
 * ==============================================================
 * MAIN ENTRY POINT (IDLE LOADED)
 * ==============================================================
 */
export function initWeatherTheme() {
  if (!WEATHER_CONFIG.enabled) return;

  try {
    initWeatherControls();

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

    // Initial weather fetch
    fetchWeather();

  } catch (err) {
    console.warn("Weather theming initialization swallowed (isolated):", err);
  }
}
