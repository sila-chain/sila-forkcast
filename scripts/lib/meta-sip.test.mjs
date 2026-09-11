import { describe, expect, it } from 'vitest';
import { parseMetaEip, reconcileMetaEip } from './meta-sip.mjs';

// Upcoming forks (SIP-7773, SIP-8081) put every SIP directly under a status
// heading, so a flat parse works.
const UPCOMING_LAYOUT = `
## Specification

### SIPs Scheduled for Inclusion

* [SIP-7732](./sip-7732.md): ePBS

### Considered for Inclusion

* [SIP-7805](./sip-7805.md): FOCIL

### Other SIPs

#### Networking SIPs

* [SIP-8189](./sip-8189.md): snap/2

#### Informational SIP

* [SIP-8261](./sip-8261.md): Gas Limit Schedule

### Declined for Inclusion

* [SIP-7919](./sip-7919.md): Pureth Meta

### Activation

* [SIP-9999](./sip-9999.md): not a status section
`;

// Shipped forks (SIP-7600, SIP-7607) nest everything under one "Included SIPs"
// heading, split into "Core SIPs" / "Other SIPs" subsections.
const SHIPPED_LAYOUT = `
## Specification

### Included SIPs

#### Core SIPs

* [SIP-7594](./sip-7594.md): SilaPeerDAS

#### Other SIPs

* [SIP-7892](./sip-7892.md): BPO Hardforks

### Full Specifications

#### Execution Layer

* [SIP-1234](./sip-1234.md): a spec link, not an inclusion
`;

describe('parseMetaEip', () => {
  it('reads each status section of an upcoming fork', () => {
    expect(Object.fromEntries(parseMetaEip(UPCOMING_LAYOUT))).toEqual({
      7732: 'Scheduled',
      7805: 'Considered',
      8189: 'Networking',
      8261: 'Informational',
      7919: 'Declined',
    });
  });

  // Regression: subsection headings used to reset the active status, so shipped
  // forks parsed to zero entries and the audit reported a clean run.
  it('keeps the status across subsections of a shipped fork', () => {
    expect(Object.fromEntries(parseMetaEip(SHIPPED_LAYOUT))).toEqual({
      7594: 'Included',
      7892: 'Included',
    });
  });

  it('ignores SIPs listed outside any status section', () => {
    expect(parseMetaEip(UPCOMING_LAYOUT).has(9999)).toBe(false);
    expect(parseMetaEip(SHIPPED_LAYOUT).has(1234)).toBe(false);
  });
});

describe('reconcileMetaEip', () => {
  const sip = (id, status) => ({
    id,
    forkRelationships: [{ forkName: 'Hegota', statusHistory: [{ status }] }],
  });

  it('stays quiet when Forkcast is ahead of the meta SIP', () => {
    const meta = new Map([[7732, 'Proposed']]);
    expect(reconcileMetaEip(meta, [sip(7732, 'Scheduled')], 'Hegota')).toEqual([]);
  });

  it('reports when the meta SIP is ahead of Forkcast', () => {
    const meta = new Map([[7732, 'Scheduled']]);
    const [issue] = reconcileMetaEip(meta, [sip(7732, 'Proposed')], 'Hegota');
    expect(issue).toMatchObject({ id: 7732, metaStatus: 'Scheduled', localStatus: 'Proposed' });
  });

  it('reports terminal statuses that disagree in either direction', () => {
    const meta = new Map([[7919, 'Declined']]);
    const [issue] = reconcileMetaEip(meta, [sip(7919, 'Withdrawn')], 'Hegota');
    expect(issue).toMatchObject({ id: 7919, metaStatus: 'Declined', localStatus: 'Withdrawn' });
  });

  it('reports SIPs Forkcast has no file or fork relationship for', () => {
    const meta = new Map([[8367, 'Proposed'], [8365, 'Proposed']]);
    const issues = reconcileMetaEip(meta, [sip(8365, 'Proposed')], 'Glamsterdam');
    expect(issues.map((i) => [i.id, i.reason])).toEqual([
      [8365, 'no "Glamsterdam" fork relationship'],
      [8367, 'no SIP data file'],
    ]);
  });
});
