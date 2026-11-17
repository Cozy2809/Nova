import { useEffect, useState } from 'react';
import { run, usePoll, msgOf } from './agent.js';

// Sesión multimedia y volumen reales (Windows). Si algo falla se devuelve el error real; nunca datos inventados.
export function useMedia(enabled = true, ms = 4000) {
  const poll = usePoll(async () => {
    const [m, v] = await Promise.allSettled([run('media.status'), run('media.volume.get')]);
    const sessions = m.status === 'fulfilled' ? m.value.sessions || [] : [];
    return { sessions, current: sessions.find((s) => s.current) || sessions[0] || null, mediaErr: m.status === 'rejected' ? msgOf(m.reason) : '', vol: v.status === 'fulfilled' ? v.value : null, volErr: v.status === 'rejected' ? msgOf(v.reason) : '', at: Date.now() };
  }, ms, { enabled });
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const d = poll.data; const cur = d?.current;
  // La posición se extrapola entre consultas solo mientras suena
  const pos = cur ? Math.min(cur.durationSec || Infinity, cur.positionSec + (cur.status === 'Playing' ? (Date.now() - d.at) / 1000 : 0)) : 0;
  const act = async (action, after) => { try { await run('media.control', { action, session: cur?.id }); } catch (e) { return msgOf(e); } await poll.reload(); return ''; };
  const setVol = async (level) => { try { await run('media.volume.set', { level }); } catch (e) { return msgOf(e); } await poll.reload(); return ''; };
  const mute = async (muted) => { try { await run('media.volume.mute', { muted }); } catch (e) { return msgOf(e); } await poll.reload(); return ''; };
  return { ...poll, d, cur, pos, act, setVol, mute, tick };
}
