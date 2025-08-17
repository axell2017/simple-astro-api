// api/positions.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const swephMod = require('sweph');
const sweph: any = swephMod && swephMod.default ? swephMod.default : swephMod;

// Compatibility shims (support both prefixed and non-prefixed builds)
const JULDAY = typeof sweph.julday === 'function' ? sweph.julday : sweph.swe_julday;
const CALC_UT = typeof sweph.calc_ut === 'function' ? sweph.calc_ut : sweph.swe_calc_ut;
const HOUSES_EX = typeof sweph.houses_ex === 'function' ? sweph.houses_ex : sweph.swe_houses_ex;
const SET_EPHE_PATH = typeof sweph.set_ephe_path === 'function' ? sweph.set_ephe_path : sweph.swe_set_ephe_path;

// Fallback constants if not exported by this build
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
type Result = { planets: Planet[]; houses?: Houses; angles?: { asc?: Angle; mc?: Angle } };

function signName(deg: number) {
  const signs = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
  const idx = Math.floor((((deg % 360) + 360) % 360) / 30);
  return signs[idx];
}
function degNorm(x: number) { return ((x % 360) + 360) % 360; }

// JD fallback if julday isn't present
function juldayFallback(y: number, m: number, d: number, utHours: number) {
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
    const q = req.query as Record<string, string>;
    const date = q.date;
    const time = q.time;
    const latStr = q.lat;
    const lngStr = q.lng;
    const house_system = (q.house_system || 'P').toUpperCase();

    if (!date || !time || !latStr || !lngStr) {
      return res.status(400).json({ error: 'Missing date, time, lat, or lng' });
    }

    // Set ephemeris path (bundled via vercel.json includeFiles)
    const ephPath = path.join(process.cwd(), 'functions', 'ephemeris');
    try { if (SET_EPHE_PATH) SET_EPHE_PATH(ephPath); } catch {}

    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm, ss = '00'] = time.split(':');
    const h = Number(hh), min = Number(mm), sec = Number(ss);

    // Build JD (UT) robustly across builds
    const utHours = h + min / 60 + Number(sec) / 3600;
    let jd_ut: number;
    if (typeof JULDAY === 'function') {
      try {
        // Prefer 5-arg form: (year, month, day, hour, gregflag)
        jd_ut = JULDAY(y, m, d, utHours, true);
      } catch (_) {
        // Fallback to 4-arg form if this build doesn't accept gregflag
        jd_ut = JULDAY(y, m, d, utHours);
      }
    } else {
      jd_ut = juldayFallback(y, m, d, utHours);
    }

    const lat = Number(latStr);
    const lon = Number(lngStr);

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

      const lonDeg =
        (r && typeof r === 'object' && 'longitude' in r) ? (r as any).longitude :
        (Array.isArray(r) ? r[0] : Number(r));

      const speed =
        (r && typeof r === 'object' && 'speed' in r) ? (r as any).speed :
        (r && typeof r === 'object' && 'longitudeSpeed' in r) ? (r as any).longitudeSpeed :
        (Array.isArray(r) && r.length > 3 ? r[3] : null);

      const retro =
        (r && typeof r === 'object' && 'retrograde' in r) ? !!(r as any).retrograde :
        (speed != null ? speed < 0 : false);

      const deg = degNorm(lonDeg);
      planets.push({ name: b.name, degree: deg, sign: signName(deg), retro });
    }

    // Houses and angles
    const houses: Houses = { cusps: [] };
    const hres = HOUSES_EX ? HOUSES_EX(jd_ut, lat, lon, house_system) : null;

    let cuspsRaw: number[] | undefined;
    let ascRaw: number | undefined;
    let mcRaw: number | undefined;

    if (hres && typeof hres === 'object') {
      cuspsRaw =
        (hres as any).houseCusps ||
        (hres as any).cusps ||
        (hres as any).houses ||
        (Array.isArray(hres) ? hres[0] : undefined);

      ascRaw =
        (hres as any).ascendant ?? (hres as any).asc ?? (Array.isArray(hres) ? hres[1] : undefined);
      mcRaw =
        (hres as any).mc ?? (hres as any).MC ?? (Array.isArray(hres) ? hres[2] : undefined);
    }

    if (Array.isArray(cuspsRaw)) {
      houses.cusps = cuspsRaw.map((c) => ({ degree: degNorm(c), sign: signName(c) }));
    }

    const angles = {
      asc: ascRaw != null ? { degree: degNorm(ascRaw), sign: signName(ascRaw) } : undefined,
      mc:  mcRaw != null ? { degree: degNorm(mcRaw),  sign: signName(mcRaw)  } : undefined
    };

    if (houses.cusps?.length === 12) {
      for (const p of planets) {
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

    const out: Result = { planets, houses, angles };
    return res.status(200).json(out);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
