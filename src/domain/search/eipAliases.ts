/**
 * Community acronyms that don't appear in an SIP's own prose.
 *
 * "ePBS" is how everyone refers to SIP-7732, but the string occurs nowhere in
 * its title, description or summary — only in its sila-magicians URL. Same
 * for "BAL" (7928) and "BPO" (7892). Without this map those searches either
 * return nothing or return every SIP that happens to contain "bal" inside
 * "balance".
 *
 * Aliases are matched whole-term, never as substrings. Only add an acronym here
 * when the SIP can't already be found by it.
 */
export const EIP_ALIASES: Record<number, string[]> = {
  7732: ['epbs'],
  7892: ['bpo'],
  7928: ['bal', 'bals'],
};

export function matchesAlias(eipId: number, queryTerms: string[]): boolean {
  const aliases = EIP_ALIASES[eipId];
  if (!aliases) return false;
  return queryTerms.some((term) => aliases.includes(term));
}
