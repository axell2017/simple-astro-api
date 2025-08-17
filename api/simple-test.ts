// api/houses-test.ts - Minimal houses (no planets), fixed date/time, lat/lng via query
import type { VercelRequest, VercelResponse } from '@vercel/node';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const swephMod = require('sweph');
const sweph: any = swephMod && swephMod.default ? swephMod.default : swephMod;

const HOUSES_EX = typeof sweph.houses_ex === 'function' ? sweph.houses_ex : sweph.swe_houses_ex;
const SET_EPHE_PATH = typeof sweph.set_ephe_path === 'function' ? sweph.set_ephe_path : sweph.swe_set_ephe_path;

const SE = {
  FLG_SWIEPH: sweph.SEFLG_SWIEPH ?? 2
};

function signName(deg: number) {
  const signs = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
  const idx = Math.floor((((deg % 360) + 360) % 360) / 30);
  return signs[idx];
}
function degNorm(x: number) { return ((x % 360) + 360) % 360; }

// Pure JS Julian Day (Gregorian calendar)
function julianDay(y: number, m: number, d: number, utHours: number) {
  const a = Math.floor((14 - m) / 12);
  const y2 = y + 4800 - a;
  const m2 = m + 12 * a - 3;
  const jd0 =
    d +
    Math.floor((153 * m2 + 2) / 5) +
    365 * y2 +
    Math.floor(y2 / 4) -
    Math.floor(y2 / 100) +
    Math.floor(y2 / 400) -
    32045;
  return jd0 - 0.5 + utHours / 24;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Set ephemeris path
    try {
      const ephPath = path.join(process.cwd(), 'functions', 'ephemeris');
      if (SET_EPHE_PATH) SET_EPHE_PATH(ephPath);
    } catch {}

    // Fixed date/time to keep this simple (same as simple-test)
    const jd_ut = julianDay(1992, 9, 8, 12); // 1992-09-08 12:00 UT

    // Expect lat/lng in query; optional house system (default 'P')
    const q = req.query as Record<string, string>;
    const lat = Number(q.lat);
    const lon = Number(q.lng);
    const hsys = (q.hsys || 'P').toUpperCase(); // single char

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: 'Provide lat and lng query params, e.g. ?lat=-34.9285&lng=138.6007&hsys=P' });
    }

    if (!HOUSES_EX) {
      return res.status(500).json({ error: 'houses_ex not available on this sweph build' });
    }

    // Swiss expects: (tjd_ut, iflag, geolat, geolon, hsys)
    const iflag = SE.FLG_SWIEPH;
    const hres = HOUSES_EX(jd_ut, iflag, lat, lon, hsys);

    let cusps: number[] | undefined;
    let asc: number | undefined;
    let mc: number | undefined;

    if (hres && typeof hres === 'object') {
      // Common shapes
      cusps =
        (hres as any).houseCusps ||
        (hres as any).cusps ||
        (hres as any).houses ||
        (Array.isArray(hres) ? hres[0] : undefined);

      asc =
        (hres as any).ascendant ?? (hres as any).asc ?? (Array.isArray(hres) ? hres[1] : undefined);

      mc =
        (hres as any).mc ?? (hres as any).MC ?? (Array.isArray(hres) ? hres[2] : undefined);
    }

    const out: any = {
      success: true,
      jd_ut,
      input: { lat, lon, hsys, iflag },
      houses: Array.isArray(cusps)
        ? cusps.map((c) => ({ degree: degNorm(c), sign: signName(c) }))
        : null,
      angles: {
        asc: asc != null ? { degree: degNorm(asc), sign: signName(asc) } : null,
        mc:  mc  != null ? { degree: degNorm(mc),  sign: signName(mc)  } : null
      },
      debug: hres
    };

    return res.status(200).json(out);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
