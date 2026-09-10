import type { APIRoute } from 'astro';
import type { SIP } from '../../../types/sip';
import { eipsData } from '../../../data/sips';

// Emitted as one static artifact per SIP during `astro build`, served at
// https://forkcast.org/api/sips/{id}.json.
//
// Under `trailingSlash: 'always'` the dev server matches this route only WITH
// a trailing slash, while the static build serves the bare file. In
// `astro dev`, use /api/sips/{id}.json/ .
//
// The per-SIP counterpart of `/api/sips.json`: the same record, but a single
// small fetch instead of the whole dataset — for the common "what about SIP
// X?" question. Record shape is identical to the per-SIP source files in
// `src/data/sips/`.
export const prerender = true;

export async function getStaticPaths() {
  return eipsData.map((sip) => ({ params: { id: String(sip.id) }, props: { sip } }));
}

export const GET: APIRoute<{ sip: SIP }> = ({ props }) =>
  new Response(JSON.stringify(props.sip, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
