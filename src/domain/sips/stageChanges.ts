import type { SIP } from '../../types/sip';

/**
 * One entry in the `/api/sip-stage-changes.json` artifact: an SIP that recently
 * changed inclusion stage, with the fork and stage that triggered the change.
 */
export interface EipStageChange {
  id: number;
  title: string;
  prefix: 'SIP' | 'RIP';
  status: string;
  /** The plain-language rewrite when one has been written, else the spec one-liner. */
  description: string;
  /**
   * The SIP's own one-liner from its spec preamble, never the plain-language
   * rewrite. Empty when the SIP has none. `/feed.xml` uses this: the rewrite is
   * hand-authored prose that gets revised, and a feed item can't be recalled.
   */
  specDescription: string;
  /** YYYY-MM-DD of the most recent dated status entry. */
  lastStageChange: string;
  lastStageChangeFork: string | null;
  currentStage: string | null;
  url: string;
}

export interface EipStageChangesPayload {
  generatedAt: string;
  count: number;
  sips: EipStageChange[];
}

const getProposalPrefix = (sip: SIP): 'SIP' | 'RIP' =>
  sip.title.startsWith('RIP-') ? 'RIP' : 'SIP';

/**
 * Pure selection logic for the stage-change feed. Finds the most recent dated
 * status across all fork relationships, then reports the current stage from that
 * fork's latest status entry. Ordered newest first. Used by the Astro API
 * endpoint that emits the static JSON artifact.
 *
 * `count` is optional: unbounded by default, since the endpoint publishes the
 * whole chronology.
 */
export function getStageChanges(sips: SIP[], count?: number): EipStageChange[] {
  const eipsWithDates: Array<{
    sip: SIP;
    lastUpdate: Date;
    forkName: string | null;
    currentStage: string | null;
  }> = [];

  for (const sip of sips) {
    let mostRecentDate: Date | null = null;
    let mostRecentFork: string | null = null;

    for (const fork of sip.forkRelationships) {
      for (const entry of fork.statusHistory) {
        if (!entry.date) continue;
        const entryDate = new Date(entry.date);
        if (Number.isNaN(entryDate.getTime())) continue;
        if (!mostRecentDate || entryDate > mostRecentDate) {
          mostRecentDate = entryDate;
          mostRecentFork = fork.forkName;
        }
      }
    }

    if (!mostRecentDate) continue;

    const forkRel = sip.forkRelationships.find((f) => f.forkName === mostRecentFork);
    const currentStage = forkRel
      ? forkRel.statusHistory[forkRel.statusHistory.length - 1].status
      : null;

    eipsWithDates.push({ sip, lastUpdate: mostRecentDate, forkName: mostRecentFork, currentStage });
  }

  const ordered = eipsWithDates.sort(
    (a, b) => b.lastUpdate.getTime() - a.lastUpdate.getTime() || a.sip.id - b.sip.id,
  );

  return (count === undefined ? ordered : ordered.slice(0, count))
    .map(({ sip, lastUpdate, forkName, currentStage }) => ({
      id: sip.id,
      title: sip.title.replace(/^(SIP|RIP)-\d+:\s*/, ''),
      prefix: getProposalPrefix(sip),
      status: sip.status,
      description: sip.laymanDescription || sip.description,
      specDescription: sip.description,
      lastStageChange: lastUpdate.toISOString().split('T')[0],
      lastStageChangeFork: forkName,
      currentStage,
      url: `/sips/${sip.id}`,
    }));
}

export function buildEipStageChangesPayload(
  sips: SIP[],
  generatedAt: string,
  count?: number,
): EipStageChangesPayload {
  const changes = getStageChanges(sips, count);
  return { generatedAt, count: changes.length, sips: changes };
}
