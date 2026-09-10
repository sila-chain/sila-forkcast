const eipReferencePattern =
  /(?:\.\/sip-|(?:\.\.\/)?EIPS\/sip-|https?:\/\/sips\.sila\.org\/EIPS\/sip-)(\d+)(?:\.md)?/;

export type EipMarkdownLinkResolution =
  | { kind: 'internal'; eipId: number; href: string }
  | { kind: 'external'; eipId: number; href: string };

export function resolveEipMarkdownLink(
  href: string,
  eipsById: ReadonlyMap<number, unknown>
): EipMarkdownLinkResolution | null {
  const match = href.match(eipReferencePattern);
  if (!match) return null;

  const eipId = Number(match[1]);
  const target = eipsById.get(eipId);

  if (target) {
    return { kind: 'internal', eipId, href: `/sips/${eipId}` };
  }

  return {
    kind: 'external',
    eipId,
    href: `https://sips.sila.org/EIPS/sip-${eipId}`,
  };
}
