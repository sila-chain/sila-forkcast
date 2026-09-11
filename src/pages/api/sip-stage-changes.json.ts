import type { APIRoute } from 'astro';
import { eipsData } from '../../data/sips';
import { buildEipStageChangesPayload } from '../../domain/sips/stageChanges';

// Emitted as a static artifact during `astro build`, served at
// https://forkcast.org/api/sip-stage-changes.json.
//
// Every SIP with a dated stage change, newest first — the site's chronology of
// what moved when. Unbounded: `/api/sips.json` carries the same history nested
// per SIP, so the value this adds is the global ordering, and truncating it
// throws that away.
export const prerender = true;

export const GET: APIRoute = () => {
  const payload = buildEipStageChangesPayload(eipsData, new Date().toISOString());
  return new Response(JSON.stringify(payload, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
};
