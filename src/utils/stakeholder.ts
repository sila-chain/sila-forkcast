import { SIP } from '../types/sip';
import { getInclusionStage } from './sip';

/**
 * Filter SIPs for a specific stakeholder and fork
 */
export const filterEipsForStakeholder = (
  sips: SIP[],
  forkName: string,
  stakeholderKey: keyof NonNullable<SIP['stakeholderImpacts']>
): SIP[] => {
  return sips.filter(sip => {
    const hasStakeholderImpact = sip.stakeholderImpacts?.[stakeholderKey]?.description;
    const hasForkRelationship = sip.forkRelationships.some(
      fr => fr.forkName.toLowerCase() === forkName.toLowerCase()
    );
    return hasStakeholderImpact && hasForkRelationship;
  });
};

/**
 * Group SIPs by inclusion stage for a specific fork
 */
export const groupByInclusionStage = (sips: SIP[], forkName: string) => ({
  sfi: sips.filter(sip => getInclusionStage(sip, forkName) === 'Scheduled for Inclusion'),
  cfi: sips.filter(sip => getInclusionStage(sip, forkName) === 'Considered for Inclusion'),
  pfi: sips.filter(sip => getInclusionStage(sip, forkName) === 'Proposed for Inclusion'),
  included: sips.filter(sip => getInclusionStage(sip, forkName) === 'Included'),
});
