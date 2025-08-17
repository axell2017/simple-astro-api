// api/simple-test.ts - Just planets, no houses
import type { VercelRequest, VercelResponse } from '@vercel/node';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const swephMod = require('sweph');
const sweph: any = swephMod && swephMod.default ? swephMod.default : swephMod;

const CALC_UT = typeof sweph.calc_ut === 'function' ? sweph.calc_ut : sweph.swe_calc_ut;
const SET_EPHE_PATH = typeof sweph.set_ephe_path === 'function' ? sweph.set_ephe_path : sweph.swe_set_ephe_path;

const SE = {
  SUN: sweph.SE_SUN ?? 0,
  MOON: sweph.SE_MOON ?? 1,
  FLG_SWIEPH: sweph.SEFLG_SWIEPH ?? 2
};

function signName(deg: number) {
  const signs = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
  const idx = Math.floor((((deg % 360) + 360) % 360) / 30);
  return signs[idx];
}
function degNorm(x: number) { return ((x % 360) + 360) % 360; }

// Pure JS Julian Day
function julianDay(y: number, m: number, d: number, utHours: number) {
  const a = Math.floor((14 - m) / 12);
  const y2 = y + 4800 - a;
  const m2 = m + 12 * a - 3;
  const jd0 = d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 + Math.floor(y2 / 4) - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045;
  return jd0 - 0.5 + utHours / 24;
}

function extractLongitude(r: any): number | null {
  if (!r) return null;

  // New: handle shape { flag, error, data: [lon, lat, dist, ...] }
  if (r && typeof r === 'object' && Array.isArray((r as any).data) && Number.isFinite((r as any).data[0])) {
    return (r as any).data[0] as number;
  }

  if (typeof r === 'object') {
    if ('longitude' in r && Number.isFinite((r as any).longitude)) return (r as any).longitude as number;
    if ('lon' in r && Number.isFinite((r as any).lon)) return (r as any).lon as number;
  }
  if (Array.isArray(r) && Number.isFinite(r[0])) return r[0] as number;
  if (typeof r === 'number' && Number.isFinite(r)) return r;
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Ensure ephemeris path is set (ephemeris files included via vercel.json)
    try {
      const ephPath = path.join(process.cwd(), 'functions', 'ephemeris');
      if (SET_EPHE_PATH) SET_EPHE_PATH(ephPath);
    } catch {}

    // Fixed test data - no query params needed
    const jd_ut = julianDay(1992, 9, 8, 12); // Sept 8, 1992, 12:00 UTC

    // Just get Sun and Moon positions
    const flags = SE.FLG_SWIEPH;
    const sunR = CALC_UT(jd_ut, SE.SUN, flags);
    const moonR = CALC_UT(jd_ut, SE.MOON, flags);

    const sunLonRaw = extractLongitude(sunR);
    const moonLonRaw = extractLongitude(moonR);

    const sunDeg = sunLonRaw != null ? degNorm(sunLonRaw) : null;
    const moonDeg = moonLonRaw != null ? degNorm(moonLonRaw) : null;

    return res.status(200).json({
      success: true,
      jd_ut,
      sun: sunDeg != null ? { degree: sunDeg, sign: signName(sunDeg) } : { degree: null },
      moon: moonDeg != null ? { degree: moonDeg, sign: signName(moonDeg) } : { degree: null },
      debug: {
        sun: sunR,
        moon: moonR
      }
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
