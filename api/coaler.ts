import type { VercelRequest, VercelResponse } from '@vercel/node';

function fmtDeg(x: number | undefined) {
  return typeof x === 'number' && isFinite(x) ? `${x.toFixed(2)}°` : '-';
}

function makeSummary(chart: any) {
  try {
    const sun = chart?.planets?.find((p: any) => p.name === 'Sun');
    const moon = chart?.planets?.find((p: any) => p.name === 'Moon');
    const asc = chart?.angles?.asc;
    const parts: string[] = [];
    if (sun) parts.push(`Sun ${fmtDeg(sun.degree)} ${sun.sign} H${sun.house ?? '-'}`);
    if (moon) parts.push(`Moon ${fmtDeg(moon.degree)} ${moon.sign} H${moon.house ?? '-'}`);
    if (asc) parts.push(`Asc ${fmtDeg(asc.degree)} ${asc.sign}`);
    return parts.join(' • ');
  } catch {
    return '';
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  try {
    const { message, chart } = req.body || {};
    if (!message || !chart) return res.status(400).json({ error: 'Provide { message, chart } in JSON body.' });

    const summary = makeSummary(chart);
    const opening = `I see your chart: ${summary}.`;
    let guidance = '';

    const text = String(message).toLowerCase();
    if (text.includes('career') || text.includes('work')) {
      guidance = 'Your MC and 10th house themes illuminate your public path. Consider the sign on your Midheaven and any planets in the 10th.';
    } else if (text.includes('love') || text.includes('relationship')) {
      guidance = 'Look to Venus and the 7th house for partnership patterns. The ruler of the 7th and aspects to Venus offer further nuance.';
    } else if (text.includes('purpose') || text.includes('life')) {
      guidance = 'Your Sun’s sign and house show core vitality; the North Node can hint at a growth trajectory.';
    } else if (text.includes('health') || text.includes('wellbeing')) {
      guidance = 'The 6th house and its ruler speak to daily rhythms and care. Observe planets there for habits that support you.';
    } else {
      guidance = 'Ask about love, career, purpose, timing, or any part of your chart you’re drawn to. I will focus my reading accordingly.';
    }

    const reply = `Coaler: ${opening} ${guidance} What would you like to explore next?`;
    return res.status(200).json({ reply });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
