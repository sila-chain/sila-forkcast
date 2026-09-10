import { describe, expect, it } from 'vitest';
import {
  getEipIdFromHash,
  getInclusionStageSortRank,
  getSpecificationUrl,
  getStageAbbreviation,
  getSummaryDescription,
  getUpgradeAnchorExpansionState,
  isPendingEip,
} from './sip';
import type { SIP } from '../types';

const makeEip = (overrides: Partial<SIP> = {}): SIP => ({
  id: 1,
  title: 'SIP-1: Example',
  status: 'Draft',
  description: 'Fallback description',
  author: 'Example Author',
  type: 'Standards Track',
  createdDate: '2026-01-01',
  forkRelationships: [],
  ...overrides,
});

describe('getSummaryDescription', () => {
  it('returns the SIP description', () => {
    const sip = makeEip({
      description: 'The SIP description',
      laymanDescription: 'Reader-friendly summary',
    });

    expect(getSummaryDescription(sip)).toBe('The SIP description');
  });
});

describe('pending SIP pull request', () => {
  it('uses the explicit pending pull request as the specification URL', () => {
    const sip = makeEip({
      pendingPullRequest: {
        number: 11726,
        url: 'https://github.com/sila-chain/SIPs/pull/11726',
      },
    });

    expect(isPendingEip(sip)).toBe(true);
    expect(getSpecificationUrl(sip)).toBe(
      'https://github.com/sila-chain/SIPs/pull/11726',
    );
  });

  it('keeps canonical SIP URLs separate from pending pull request state', () => {
    const sip = makeEip({ id: 8141, title: 'SIP-8141: Frame Transactions' });

    expect(isPendingEip(sip)).toBe(false);
    expect(getSpecificationUrl(sip)).toBe(
      'https://sips.sila.org/EIPS/sip-8141',
    );
  });
});

describe('inclusion stage labels', () => {
  it('uses shared labels and ordering for inclusion stages', () => {
    expect(getStageAbbreviation('Scheduled for Inclusion')).toBe('SFI');
    expect(getStageAbbreviation('Considered for Inclusion')).toBe('CFI');
    expect(getStageAbbreviation('Proposed for Inclusion')).toBe('PFI');
    expect(getStageAbbreviation('Included')).toBe('Included');
    expect(getInclusionStageSortRank('Scheduled for Inclusion')).toBeLessThan(
      getInclusionStageSortRank('Proposed for Inclusion')
    );
  });
});

describe('getEipIdFromHash', () => {
  it('parses SIP anchor hashes', () => {
    expect(getEipIdFromHash('#sip-8011')).toBe(8011);
  });

  it('ignores non-SIP hashes', () => {
    expect(getEipIdFromHash('#declined-for-inclusion')).toBeNull();
    expect(getEipIdFromHash('sip-8011')).toBeNull();
    expect(getEipIdFromHash('#sip-8011-extra')).toBeNull();
  });

  it('ignores unsafe SIP numbers', () => {
    expect(getEipIdFromHash('#sip-9007199254740993')).toBeNull();
  });
});

describe('getUpgradeAnchorExpansionState', () => {
  it('expands the declined section for declined SIP anchors', () => {
    const sip = makeEip({
      forkRelationships: [
        {
          forkName: 'Glamsterdam',
          statusHistory: [
            { status: 'Proposed', call: null, date: null },
            { status: 'Declined', call: 'acde/225', date: '2025-12-04' },
          ],
        },
      ],
    });

    expect(getUpgradeAnchorExpansionState(sip, 'Glamsterdam')).toEqual({
      declined: true,
      headlinerProposals: false,
    });
  });

  it('expands headliner proposals for unselected headliner candidate anchors', () => {
    const sip = makeEip({
      forkRelationships: [
        {
          forkName: 'Glamsterdam',
          wasHeadlinerCandidate: true,
          isHeadliner: false,
          statusHistory: [
            { status: 'Considered', call: null, date: null },
            { status: 'Declined', call: 'acdc/171', date: '2025-12-11' },
          ],
        },
      ],
    });

    expect(getUpgradeAnchorExpansionState(sip, 'Glamsterdam')).toEqual({
      declined: true,
      headlinerProposals: true,
    });
  });

  it('does not expand headliner proposals for selected headliner anchors', () => {
    const sip = makeEip({
      forkRelationships: [
        {
          forkName: 'Glamsterdam',
          wasHeadlinerCandidate: true,
          isHeadliner: true,
          statusHistory: [
            { status: 'Scheduled', call: null, date: null },
          ],
        },
      ],
    });

    expect(getUpgradeAnchorExpansionState(sip, 'Glamsterdam')).toEqual({
      declined: false,
      headlinerProposals: false,
    });
  });
});
