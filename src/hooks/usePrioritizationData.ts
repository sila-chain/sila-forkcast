import { useMemo } from 'react';
import { PrioritizationData, EipAggregateStance } from '../types/prioritization';
import { eipsData } from '../data/sips';
import { calculateEipAggregate } from '../utils/prioritization';
import { formatISODate } from '../utils/date';

// Import the JSON data directly
import glamsterdamData from '../data/prioritization/glamsterdam.json';

interface UsePrioritizationDataResult {
  data: PrioritizationData;
  aggregates: EipAggregateStance[];
  lastUpdated: string;
}

/**
 * Hook to load and process prioritization data for a fork
 * Includes ALL SIPs related to the fork, not just those with stances
 */
export function usePrioritizationData(fork: string = 'glamsterdam'): UsePrioritizationDataResult {
  const data = useMemo(() => {
    // Currently only glamsterdam is supported
    if (fork.toLowerCase() === 'glamsterdam') {
      return glamsterdamData as PrioritizationData;
    }
    // Return empty data for unsupported forks
    return {
      fork,
      lastUpdated: formatISODate(new Date()),
      sips: [],
    };
  }, [fork]);

  const aggregates = useMemo(() => {
    // Get ALL SIPs that have a relationship with this fork
    const forkEips = eipsData.filter((sip) =>
      sip.forkRelationships.some(
        (rel) => rel.forkName.toLowerCase() === fork.toLowerCase()
      )
    );

    // Create a map of SIP ID to stances from the prioritization data
    const stancesMap = new Map(
      data.sips.map((eipPrio) => [eipPrio.eipId, eipPrio.stances])
    );

    // Build aggregates for ALL fork SIPs, using empty stances array if no data
    return forkEips.map((sip) => {
      const stances = stancesMap.get(sip.id) || [];
      return calculateEipAggregate(sip.id, stances, sip, fork);
    });
  }, [data, fork]);

  return {
    data,
    aggregates,
    lastUpdated: data.lastUpdated,
  };
}

/**
 * Get a list of all EL client names
 */
export function getELClients(): string[] {
  return ['Besu', 'Erigon', 'Geth', 'Nethermind', 'Reth'];
}

/**
 * Get a list of all CL client names
 */
export function getCLClients(): string[] {
  return ['Grandine', 'Lighthouse', 'Lodestar', 'Nimbus', 'Prysm', 'Teku'];
}

/**
 * Get all client names
 */
export function getAllClients(): string[] {
  return [...getELClients(), ...getCLClients()];
}
