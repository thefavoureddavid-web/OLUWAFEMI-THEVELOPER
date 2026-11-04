/**
 * ==============================================================
 * // EDIT: VERCEL SERVERLESS WEATHER HELPER - /api/weather.js
 * Weather-Responsive Theme Edge Service for Oluwafemi Portfolio
 * Privacy-First, Zero IP Storage, Rate Limited & Edge Cached
 * Free Open-Meteo API (No API Key Required)
 * ==============================================================
 */

// In-memory 15-Minute Cache (Keyed by 0.1-degree rounded geo-cells)
const weatherCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// In-memory Rate Limiting (Max 30 calls per minute per identifier)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 30;

// Periodic cleanup of stale cache and rate-limit records
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, item] of weatherCache.entries()) {
      if (now - item.timestamp > CACHE_TTL_MS * 2) {
        weatherCache.delete(key);
      }
    }
    for (const [key, record] of rateLimitMap.entries()) {
      if (now - record.windowStart > RATE_LIMIT_WINDOW_MS * 3) {
        rateLimitMap.delete(key);
      }
    }
  }, 10 * 60 * 1000);
}

/**
 * Maps WMO standard weather code + temperature + day/night into site theme category
 */
function resolveWeatherCategory(wmoCode, isDay, temperature, pm10 = 0) {
  // Harmattan / Dust condition: elevated PM10 / dust in West Africa
  if (pm10 > 150) {
    return 'harmattan-dust';
  }

  // Thunderstorm
  if ([95, 96, 99].includes(wmoCode)) {
    return 'thunderstorm';
  }

  // Snow & Ice
  if ([71, 73, 75, 77, 85, 86].includes(wmoCode)) {
    return 'snow';
  }

  // Heavy or moderate Rain
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(wmoCode)) {
    return 'rain';
  }

  // Light Drizzle
  if ([51, 53, 55, 56, 57].includes(wmoCode)) {
    return 'drizzle';
  }

  // Fog & Atmospheric Haze
  if ([45, 48].includes(wmoCode)) {
    return 'fog-haze';
  }

  // Overcast / Cloudy
  if (wmoCode === 3) {
    return 'cloudy';
  }

  // Partly Cloudy
  if (wmoCode === 2) {
    return 'partly-cloudy';
  }

  // Clear conditions (WMO 0 or 1)
  if (isDay) {
    // Extreme Heat (Clear and > 33°C)
    if (temperature >= 33) {
      return 'hot-sun';
    }
    return 'clear-day';
  }

  return 'clear-night';
}

/**
 * Derives the diurnal phase (dawn, day, golden-hour, dusk, night)
 */
function resolveTimePhase(isDay, sunriseIso, sunsetIso) {
  try {
    const now = Date.now();
    if (sunriseIso && sunsetIso) {
      const sunrise = new Date(sunriseIso).getTime();
      const sunset = new Date(sunsetIso).getTime();

      // Dawn: within 45 minutes of sunrise
      if (Math.abs(now - sunrise) <= 45 * 60 * 1000) {
        return 'dawn';
      }
      // Golden Hour: 60 minutes before sunset
      if (now >= sunset - 60 * 60 * 1000 && now <= sunset) {
        return 'golden-hour';
      }
      // Dusk: 45 minutes after sunset
      if (now > sunset && now <= sunset + 45 * 60 * 1000) {
        return 'dusk';
      }
    }
  } catch (e) {}

  return isDay ? 'day' : 'night';
}

/**
 * Standard country code to display name mapping
 */
function sanitizeCountry(code) {
  if (!code) return 'Nigeria';
  const c = String(code).toUpperCase().trim();
  const map = {
    NG: 'Nigeria', US: 'United States', GB: 'United Kingdom', CA: 'Canada',
    DE: 'Germany', GH: 'Ghana', KE: 'Kenya', ZA: 'South Africa', FR: 'France',
    IN: 'India', AE: 'UAE'
  };
  return map[c] || c;
}

export default async function handler(req, res) {
  // CORS & Security Headers
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Origin Verification (allowing self, Vercel preview, and local development)
  const origin = req.headers.origin || req.headers.referer || '';
  const isAllowedOrigin = !origin || 
    origin.includes('oluwafemi-theveloper.vercel.app') || 
    origin.includes('localhost') || 
    origin.includes('127.0.0.1') ||
    origin.includes('.run.app') ||
    origin.includes('.vercel.app');

  if (!isAllowedOrigin) {
    return res.status(403).json({ error: 'Forbidden origin' });
  }

  // 2. Approximate Geo Detection from Vercel Edge Headers
  // Never logs or stores raw IP address
  const headerLat = req.headers['x-vercel-ip-latitude'];
  const headerLon = req.headers['x-vercel-ip-longitude'];
  const rawCity = req.headers['x-vercel-ip-city'];
  const rawCountry = req.headers['x-vercel-ip-country'];

  // Query parameter overrides for optional explicit user geolocation chip
  const queryLat = req.query?.lat || req.query?.latitude;
  const queryLon = req.query?.lon || req.query?.longitude;

  let lat = parseFloat(queryLat || headerLat || '8.4966');
  let lon = parseFloat(queryLon || headerLon || '4.5421');

  // Validate lat/lon boundaries
  if (isNaN(lat) || lat < -90 || lat > 90) lat = 8.4966;
  if (isNaN(lon) || lon < -180 || lon > 180) lon = 4.5421;

  // Round coordinates to ~0.1 deg (~11 km) to enforce privacy and maximize cache hits
  const roundedLat = Math.round(lat * 10) / 10;
  const roundedLon = Math.round(lon * 10) / 10;
  const cacheKey = `${roundedLat},${roundedLon}`;

  // Sanitize city and country (strip illegal characters, default if missing)
  let city = rawCity ? decodeURIComponent(String(rawCity)).replace(/[^\w\s-]/gi, '').trim() : '';
  let country = sanitizeCountry(rawCountry);

  // If using default Ilorin coords
  if (!city && Math.abs(lat - 8.4966) < 0.2 && Math.abs(lon - 4.5421) < 0.2) {
    city = 'Ilorin';
    country = 'Nigeria';
  }

  // 3. In-memory Rate Limiting
  const clientBucket = `${roundedLat}_${roundedLon}_${req.headers['user-agent'] || 'agent'}`.substring(0, 48);
  const now = Date.now();
  const rl = rateLimitMap.get(clientBucket);
  if (!rl || now - rl.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(clientBucket, { count: 1, windowStart: now });
  } else {
    rl.count += 1;
    if (rl.count > MAX_REQUESTS_PER_WINDOW) {
      return res.status(429).json({ error: 'Too many weather requests. Please wait.' });
    }
  }

  // 4. Return Cached Response if within 15 minutes
  const cached = weatherCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
    return res.status(200).json({
      ...cached.data,
      city: city || cached.data.city || 'Your Area',
      country: country || cached.data.country || '',
      cached: true
    });
  }

  // 5. Query Open-Meteo Forecast API with 3.5s timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${roundedLat}&longitude=${roundedLon}&current=temperature_2m,weather_code,is_day,wind_speed_10m,cloud_cover&daily=sunrise,sunset&timezone=auto`;

    const weatherRes = await fetch(openMeteoUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeout);

    if (!weatherRes.ok) {
      throw new Error(`Open-Meteo returned HTTP ${weatherRes.status}`);
    }

    const data = await weatherRes.json();
    const current = data.current || {};
    const daily = data.daily || {};

    const temperature = Math.round(current.temperature_2m ?? 28);
    const weatherCode = current.weather_code ?? 0;
    const isDay = current.is_day === 1 || current.is_day === true;
    const windSpeed = Math.round(current.wind_speed_10m ?? 0);
    const cloudCover = Math.round(current.cloud_cover ?? 10);
    const sunriseIso = daily.sunrise?.[0] || null;
    const sunsetIso = daily.sunset?.[0] || null;

    // Optional lightweight air quality check for Harmattan Dust in West Africa
    let pm10 = 0;
    const isWestAfrica = lat >= 4 && lat <= 15 && lon >= -18 && lon <= 16;
    if (isWestAfrica) {
      try {
        const aqController = new AbortController();
        const aqTimeout = setTimeout(() => aqController.abort(), 1200);
        const aqRes = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${roundedLat}&longitude=${roundedLon}&current=pm10,dust`, {
          signal: aqController.signal
        });
        clearTimeout(aqTimeout);
        if (aqRes.ok) {
          const aqData = await aqRes.json();
          pm10 = Math.max(aqData.current?.pm10 || 0, aqData.current?.dust || 0);
        }
      } catch (e) {
        // Air quality check is purely optional; silent fallback
      }
    }

    const weatherCategory = resolveWeatherCategory(weatherCode, isDay, temperature, pm10);
    const phase = resolveTimePhase(isDay, sunriseIso, sunsetIso);

    const resultPayload = {
      success: true,
      category: weatherCategory,
      weatherCategory,
      temperature,
      isDay,
      phase,
      city: city || 'Your Area',
      country: country || 'Nigeria',
      weatherCode,
      windSpeed,
      cloudCover,
      sunrise: sunriseIso,
      sunset: sunsetIso,
      timestamp: now
    };

    // Save in server-side cache
    weatherCache.set(cacheKey, { timestamp: now, data: resultPayload });

    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
    return res.status(200).json(resultPayload);

  } catch (fetchErr) {
    // Graceful fallback based on visitor local time
    const currentHour = new Date().getUTCHours() + 1; // Approx WAT (UTC+1)
    const isDay = currentHour >= 6 && currentHour < 18;
    const fallbackCategory = isDay ? 'clear-day' : 'clear-night';

    return res.status(200).json({
      success: true,
      category: fallbackCategory,
      weatherCategory: fallbackCategory,
      temperature: isDay ? 30 : 24,
      isDay,
      phase: isDay ? 'day' : 'night',
      city: city || '',
      country: country || '',
      weatherCode: 0,
      fallback: true,
      timestamp: now
    });
  }
}
