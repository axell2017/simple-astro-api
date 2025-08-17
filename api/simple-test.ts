// api/simple-test.ts - Just planets, no houses
import type { VercelRequest, VercelResponse } from '@vercel/node';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const swephMod = require('sweph');
const sweph: any = swephMod && swephMod.default ? swephMod.default : swephMod;

const CALC_UT = typeof sweph.calc_ut === 'function' ? sweph.calc_ut : sweph.swe_calc_ut;

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

// Pure JS Julian Day
function julianDay(y: number, m: number, d: number, utHours: number) {
  const a = Math.floor((14 - m) / 12);
  const y2 = y + 4800 - a;
  const m2 = m + 12 * a - 3;
  const jd0 = d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 + Math.floor(y2 / 4) - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045;
  return jd0 - 0.5 + utHours / 24;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Fixed test data - no query params needed
    const jd_ut = julianDay(1992, 9, 8, 12); // Sept 8, 1992, 12:00 UTC
    
    // Just get Sun and Moon positions
    const sunResult = CALC_UT(jd_ut, SE.SUN, SE.FLG_SWIEPH);
    const moonResult = CALC_UT(jd_ut, SE.MOON, SE.FLG_SWIEPH);
    
    const sunLon = Array.isArray(sunResult) ? sunResult[0] : Number(sunResult);
    const moonLon = Array.isArray(moonResult) ? moonResult[0] : Number(moonResult);
    
    return res.status(200).json({
      success: true,
      jd_ut,
      sun: { degree: sunLon, sign: signName(sunLon) },
      moon: { degree: moonLon, sign: signName(moonLon) }
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
