// api/positions.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import path from 'path';
import * as sweph from 'sweph';

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

    // Ensure Swiss Ephemeris data files are found
    const ephPath = path.join(process.cwd(), 'functions', 'ephemeris');
    try { sweph.swe_set_ephe_path(ephPath); } catch {}

    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm, ss = '00'] = time.split(':');
    const h = Number(hh), min = Number(mm), sec = Number(ss);
    const jd_ut = sweph.swe_julday(y, m, d, h + min / 60 + Number(sec) / 3600);

    const lat = Number(latStr);
    const lon = Number(lngStr);

    // Planets
    const bodies = [
      { id: sweph.SE_SUN, name: 'Sun' },
      { id: sweph.SE_MOON, name: 'Moon' },
      { id: sweph.SE_MERCURY, name: 'Mercury' },
      { id: sweph.SE_VENUS, name: 'Venus' },
      { id: sweph.SE_MARS, name: 'Mars' },
      { id: sweph.SE_JUPITER, name: 'Jupiter' },
      { id: sweph.SE_SATURN, name: 'Saturn' },
      { id: sweph.SE_URANUS, name: 'Uranus' },
      { id: sweph.SE_NEPTUNE, name: 'Neptune' },
      { id: sweph.SE_PLUTO, name: 'Pluto' }
    ];

    const planets: Planet[] = [];
    for (const b of bodies) {
      const flags = sweph.SEFLG_SWIEPH | sweph.SEFLG_SPEED;
      const { longitude, retrograde } = sweph.swe_calc_ut(jd_ut, b.id, flags);
      const deg = degNorm(longitude);
      planets.push({ name: b.name, degree: deg, sign: signName(deg), retro: retrograde });
    }

    // Houses and angles
    const houses: Houses = { cusps: [] };
    const hres = sweph.swe_houses_ex(jd_ut, lat, lon, house_system);
    if (hres?.houseCusps) {
      houses.cusps = hres.houseCusps.map((c: number) => ({ degree: degNorm(c), sign: signName(c) }));
    }
    const angles = {
      asc: hres?.ascendant != null ? { degree: degNorm(hres.ascendant), sign: signName(hres.ascendant) } : undefined,
      mc:  hres?.mc != null ? { degree: degNorm(hres.mc), sign: signName(hres.mc) } : undefined
    };

    // Assign houses if we have 12 cusps
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
