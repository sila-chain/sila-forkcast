import { SIP } from '../../types/sip';
import { eipsData } from '../../data/sips';
import { getForkRelationship } from '../../utils/sip';

/** The fork whose proposals the rank page ranks. */
export const RANK_FORK = 'hegota';

/**
 * Only SIPs whose inclusion is still undecided. Once an SIP is SFI'd
 * (`Scheduled`) it is locked into the fork and there is nothing left to rank —
 * that applies to headliners (SIP-7805) and non-headliners (SIP-8141) alike.
 */
const ACTIVE_STATUSES = new Set(['Proposed', 'Considered']);

/**
 * The proposals that make up the rank page's board: SIPs still in play for the
 * fork, minus the headliners (which are chosen separately, not ranked) and
 * Informational SIPs (process/analysis docs that do not change the protocol).
 */
export const getRankableEips = (sips: SIP[] = eipsData): SIP[] =>
  sips.filter(sip => {
    if (sip.type === 'Informational') return false;
    const relationship = getForkRelationship(sip, RANK_FORK);
    if (!relationship || relationship.isHeadliner) return false;
    const history = relationship.statusHistory;
    return ACTIVE_STATUSES.has(history[history.length - 1]?.status);
  });
