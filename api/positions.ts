// api/positions.ts - Planets + Houses with robust parsing, validation, and timezone support
import type { VercelRequest, VercelResponse } from '@vercel/node';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const swephMod = require('sweph');
const sweph: any = swephMod && swephMod.default ? swephMod.default : swephMod;

const CALC_UT = typeof sweph.calc_ut === 'function' ? sweph.calc_ut : sweph.swe_calc_ut;
const HOUSES_EX = typeof sweph.houses_ex === 'function' ? sweph.houses_ex : sweph.swe_houses_ex;
const SET_EPHE_PATH = typeof sweph.set_ephe_path === 'function' ? sweph.set_ephe_path : sweph.swe_set_ephe_path;

const SE = {
  SUN: sweph.SE_SUN ?? 0,
  MOON: sweph.SE_MOON ?? 1,
  MERCURY: sweph.SE_MERCURY ?? 2,
  VENUS: sweph.SE_VENUS ?? 3,
  MARS: sweph.SE_MARS ?? 4,
  JUPITER: sweph.SE_JUPITER ?? 5,
  SATURN: sweph.SE_SATURN ?? 6,
  URANUS: sweph.SE_URANUS ?? 7,
  NEPTUNE: sweph.SE_NEPTUNE ?? 8,
  PLUTO: sweph.SE_PLUTO ?? 9,
  FLG_SWIEPH: sweph.SEFLG_SWIEPH ?? 2,
  FLG_SPEED: sweph.SEFLG_SPEED ?? 256
};

type Angle = { degree: number; sign: string };
type Planet = { name: string; degree: number; sign: string; house?: number; retro?: boolean };
type Houses = { cusps: Angle[] };
type Output = {
  success: true;
  jd_ut: number;
  input: any;
  planets: Planet[];
  houses?: Houses;
  angles?: { asc?: Angle | null; mc?: Angle | null } | null;
  debug?: any;
};

function signName(deg: number) {
  const signs = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
  const idx = Math.floor((((deg % 360) + 360) % 360) / 30);
  return signs[idx];
}
function degNorm(x: number) { return ((x % 360) + 360) % 360; }

// Pure JS Julian Day (Gregorian)
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

function extractLongitude(r: any): number | null {
  if (!r) return null;
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

// Basic validators
function isValidDateStr(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function isValidTimeStr(s: string) {
  return /^\d{2}:\d{2}(:\d{2})?$/.test(s);
}
function clampHouseSystem(s: string) {
  return (s || 'P').trim().toUpperCase().slice(0, 1);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Set ephemeris path (bundled via vercel.json -> functions/ephemeris)
    try {
      const ephPath = path.join(process.cwd(), 'functions', 'ephemeris');
      if (SET_EPHE_PATH) SET_EPHE_PATH(ephPath);
    } catch {}

    const q = req.query as Record<string, string>;

    // Inputs with defaults
    const date = (q.date && String(q.date)) || '1992-09-08';
    const time = (q.time && String(q.time)) || '12:00:00';
    const lat = q.lat != null ? Number(q.lat) : -34.9285;
    const lon = q.lng != null ? Number(q.lng) : 138.6007;
    const hsys = clampHouseSystem(q.house_system || q.hsys || 'P');

    // Timezone handling: minutes offset from UTC. Positive for east of UTC.
    // Example: Sydney AEST = +600, Los Angeles PDT = -420
    const tzOffsetMinutes = q.tz_offset_minutes != null ? Number(q.tz_offset_minutes) : 0;

    // Validate inputs
    if (!isValidDateStr(date)) {
      return res.status(400).json({ error: "Invalid 'date'. Use YYYY-MM-DD." });
    }
    if (!isValidTimeStr(time)) {
      return res.status(400).json({ error: "Invalid 'time'. Use HH:MM or HH:MM:SS (24h)." });
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return res.status(400).json({ error: "Invalid 'lat'. Range -90 to 90." });
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      return res.status(400).json({ error: "Invalid 'lng'. Range -180 to 180." });
    }
    if (!Number.isFinite(tzOffsetMinutes) || tzOffsetMinutes < -900 || tzOffsetMinutes > 900) {
      return res.status(400).json({ error: "Invalid 'tz_offset_minutes'. Range -900 to 900." });
    }
    if (!/^[A-Z]$/.test(hsys)) {
      return res.status(400).json({ error: "Invalid 'house_system' (or 'hsys'). Provide a single letter code like 'P'." });
    }

    // Parse date and time
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm, ss = '00'] = time.split(':');
    const h = Number(hh), min = Number(mm), sec = Number(ss);

    // Convert local time to UT using the offset (minutes east of UTC are positive)
    // UT hours = localHours - (tzOffsetMinutes/60)
    const localHours = h + min / 60 + Number(sec) / 3600;
    const utHours = localHours - tzOffsetMinutes / 60;

    // JD in UT
    const jd_ut = julianDay(y, m, d, utHours);

    // Planets
    const bodies = [
      { id: SE.SUN, name: 'Sun' },
      { id: SE.MOON, name: 'Moon' },
      { id: SE.MERCURY, name: 'Mercury' },
      { id: SE.VENUS, name: 'Venus' },
      { id: SE.MARS, name: 'Mars' },
      { id: SE.JUPITER, name: 'Jupiter' },
      { id: SE.SATURN, name: 'Saturn' },
      { id: SE.URANUS, name: 'Uranus' },
      { id: SE.NEPTUNE, name: 'Neptune' },
      { id: SE.PLUTO, name: 'Pluto' }
    ];

    const planets: Planet[] = [];
    for (const b of bodies) {
      const flags = SE.FLG_SWIEPH | SE.FLG_SPEED;
      const r = CALC_UT(jd_ut, b.id, flags);
      const lonDeg = extractLongitude(r);
      const speed =
        (r && typeof r === 'object' && 'speed' in r) ? (r as any).speed :
        (r && typeof r === 'object' && 'longitudeSpeed' in r) ? (r as any).longitudeSpeed :
        (Array.isArray(r) && r.length > 3 ? r[3] : null);
      const retro = speed != null ? speed < 0 : false;

      if (lonDeg == null) {
        planets.push({ name: b.name, degree: NaN, sign: 'Unknown', retro });
      } else {
        const deg = degNorm(lonDeg);
        planets.push({ name: b.name, degree: deg, sign: signName(deg), retro });
      }
    }

    // Houses
    let houses: Houses | undefined;
    let angles: { asc?: Angle | null; mc?: Angle | null } | null = null;
    if (HOUSES_EX && Number.isFinite(lat) && Number.isFinite(lon)) {
      const iflag = SE.FLG_SWIEPH;
      const hres = HOUSES_EX(jd_ut, iflag, lat, lon, hsys);

      let cuspsRaw: number[] | undefined;
      let ascRaw: number | undefined;
      let mcRaw: number | undefined;

      if (hres && typeof hres === 'object') {
        if ((hres as any).data && typeof (hres as any).data === 'object') {
          const data = (hres as any).data;
          if (Array.isArray(data.houses)) cuspsRaw = data.houses;
          if (Array.isArray(data.points) && data.points.length >= 2) {
            ascRaw = data.points[0];
            mcRaw = data.points[1];
          }
        }
        if (!cuspsRaw) {
          cuspsRaw =
            (hres as any).houseCusps ||
            (hres as any).cusps ||
            (hres as any).houses ||
            (Array.isArray(hres) ? hres[0] : undefined);
        }
        if (ascRaw == null) {
          ascRaw = (hres as any).ascendant ?? (hres as any).asc ?? (Array.isArray(hres) ? hres[1] : undefined);
        }
        if (mcRaw == null) {
          mcRaw = (hres as any).mc ?? (hres as any).MC ?? (Array.isArray(hres) ? hres[2] : undefined);
        }
      }

      if (Array.isArray(cuspsRaw)) {
        houses = { cusps: cuspsRaw.map((c) => ({ degree: degNorm(c), sign: signName(c) })) };
      }
      angles = {
        asc: ascRaw != null ? { degree: degNorm(ascRaw), sign: signName(ascRaw) } : null,
        mc:  mcRaw  != null ? { degree: degNorm(mcRaw),  sign: signName(mcRaw)  } : null
      };

      // Assign house numbers to planets if cusps available
      if (houses?.cusps?.length === 12) {
        for (const p of planets) {
          if (!Number.isFinite(p.degree)) continue;
          const deg = p.degree;
          let houseNum = 12;
          for (let i = 0; i < 12; i++) {
            const start = houses.cusps[i].degree;
            const end = houses.cusps[(i + 1) % 12].degree;
            const inHouse = start <= end ? (deg >= start && deg < end) : (deg >= start || deg < end);
            if (inHouse) { houseNum = i + 1; break; }
          }
          p.house = houseNum;
        }
      }
    }

    const out: Output = {
      success: true,
      jd_ut,
      input: { date, time, lat, lon, hsys, tz_offset_minutes: tzOffsetMinutes },
      planets,
      houses,
      angles
    };

    return res.status(200).json(out);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
