import { describe, expect, it } from 'vitest';
import { resolveEipMarkdownLink } from './eipMarkdownLinks';

describe('resolveEipMarkdownLink', () => {
  it('links tracked emitted SIPs internally', () => {
    const eipsById = new Map([[7702, {}]]);

    expect(resolveEipMarkdownLink('./sip-7702.md', eipsById)).toEqual({
      kind: 'internal',
      eipId: 7702,
      href: '/sips/7702',
    });
  });

  it('links untracked SIP references to the canonical spec URL', () => {
    const eipsById = new Map([[7702, {}]]);

    for (const href of ['./sip-4337.md', 'EIPS/sip-4337.md']) {
      expect(resolveEipMarkdownLink(href, eipsById)).toEqual({
        kind: 'external',
        eipId: 4337,
        href: 'https://sips.sila.org/EIPS/sip-4337',
      });
    }
  });

  it('links tracked pending SIPs internally because Forkcast emits their pages', () => {
    const eipsById = new Map([
      [8208, { id: 8208, pendingPullRequest: { number: 123, url: 'https://github.com/sila-chain/SIPs/pull/123' } }],
    ]);

    expect(resolveEipMarkdownLink('../EIPS/sip-8208.md', eipsById)).toEqual({
      kind: 'internal',
      eipId: 8208,
      href: '/sips/8208',
    });
  });

  it('ignores non-SIP links', () => {
    expect(resolveEipMarkdownLink('https://example.com', new Map())).toBeNull();
  });
});
