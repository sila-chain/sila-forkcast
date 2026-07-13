import type { APIRoute } from 'astro';
import { eipsData } from '../../data/sips';
import { buildEipStageChangesPayload } from '../../domain/sips/stageChanges';

// Emitted as a static artifact during `astro build`, served at
// https://sila-forkcast.org/api/sip-stage-changes.json.
export const prerender = true;

export const GET: APIRoute = () => {
  const payload = buildEipStageChangesPayload(eipsData, new Date().toISOString(), 10);
  return new Response(JSON.stringify(payload, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
};
