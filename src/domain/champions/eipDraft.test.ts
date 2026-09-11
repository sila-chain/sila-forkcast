import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { SIP } from '../../types/sip';
import {
  applyDraft,
  countWords,
  draftFromEip,
  emptyStakeholderImpacts,
  serializeEip,
  validateDraft,
  type ChampionDraft,
} from './eipDraft';

const EIPS_DIR = path.resolve(import.meta.dirname, '..', '..', 'data', 'sips');

function readEipFile(id: number) {
  const raw = fs.readFileSync(path.join(EIPS_DIR, `${id}.json`), 'utf-8');
  return { raw, sip: JSON.parse(raw) as SIP };
}

const baseEip = (overrides: Partial<SIP> = {}): SIP => ({
  id: 9999,
  title: 'SIP-9999: Test',
  status: 'Draft',
  description: 'A test SIP',
  author: 'Someone (@someone)',
  type: 'Standards Track',
  createdDate: '2026-01-01',
  forkRelationships: [{ forkName: 'Hegota', statusHistory: [] }],
  ...overrides,
});

const emptyDraft = (overrides: Partial<ChampionDraft> = {}): ChampionDraft => ({
  layer: '',
  reviewer: '',
  discussionLink: '',
  laymanDescription: '',
  benefits: [],
  tradeoffs: [],
  stakeholderImpacts: emptyStakeholderImpacts(),
  faq: [],
  supportingDocuments: [],
  champions: [],
  ...overrides,
});

const filledDraft = (overrides: Partial<ChampionDraft> = {}) =>
  emptyDraft({
    layer: 'EL',
    reviewer: 'expert',
    laymanDescription: 'It changes a thing.',
    benefits: ['Makes the thing faster'],
    tradeoffs: null,
    stakeholderImpacts: Object.fromEntries(
      Object.keys(emptyStakeholderImpacts()).map((k) => [k, 'No impact.']),
    ) as ChampionDraft['stakeholderImpacts'],
    ...overrides,
  });

// ---------------------------------------------------------------------------
// Roundtrip — the load-bearing invariant
// ---------------------------------------------------------------------------

describe('roundtrip', () => {
  // A rich file, a sparse one, an explicit `"tradeoffs": null`, and one with
  // multiple forkRelationships (so the champion scoping picks a real index).
  const cases: Array<{ id: number; forkIndex: number }> = [
    { id: 8025, forkIndex: 0 },
    { id: 8367, forkIndex: 0 },
    { id: 7732, forkIndex: 1 },
  ];

  for (const { id, forkIndex } of cases) {
    it(`re-serializes ${id}.json byte for byte`, () => {
      const { raw, sip } = readEipFile(id);
      expect(serializeEip(applyDraft(sip, draftFromEip(sip, forkIndex), forkIndex))).toBe(raw);
    });
  }

  it('roundtrips every fork relationship of a multi-fork SIP', () => {
    const { raw, sip } = readEipFile(7732);
    for (let i = 0; i < sip.forkRelationships.length; i++) {
      expect(serializeEip(applyDraft(sip, draftFromEip(sip, i), i))).toBe(raw);
    }
  });

  it('re-serializes every SIP data file byte for byte', () => {
    const offenders: string[] = [];
    for (const file of fs.readdirSync(EIPS_DIR).filter((f) => f.endsWith('.json'))) {
      const raw = fs.readFileSync(path.join(EIPS_DIR, file), 'utf-8');
      const sip = JSON.parse(raw) as SIP;
      if (serializeEip(applyDraft(sip, draftFromEip(sip, 0), 0)) !== raw) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('never mutates the input SIP', () => {
    const { raw, sip } = readEipFile(8025);
    applyDraft(sip, { ...draftFromEip(sip, 0), laymanDescription: 'Rewritten.' }, 0);
    expect(serializeEip(sip)).toBe(raw);
  });
});

// ---------------------------------------------------------------------------
// Merge semantics
// ---------------------------------------------------------------------------

describe('applyDraft', () => {
  it('deletes a key the champion cleared', () => {
    const sip = baseEip({ laymanDescription: 'Old text', layer: 'EL' });
    const merged = applyDraft(sip, emptyDraft(), 0);

    expect('laymanDescription' in merged).toBe(false);
    expect('layer' in merged).toBe(false);
  });

  it('keeps existing keys in place and appends new ones', () => {
    const sip = baseEip({ laymanDescription: 'Old text', requires: [7702] });
    const merged = applyDraft(
      sip,
      emptyDraft({ laymanDescription: 'New text', benefits: ['A benefit'] }),
      0,
    );

    expect(Object.keys(merged)).toEqual([
      ...Object.keys(sip).filter((k) => k !== 'benefits'),
      'benefits',
    ]);
    expect(merged.laymanDescription).toBe('New text');
  });

  it('distinguishes explicit null tradeoffs from an unset list', () => {
    const sip = baseEip({ tradeoffs: ['A cost'] });

    expect(applyDraft(sip, emptyDraft({ tradeoffs: null }), 0).tradeoffs).toBeNull();
    expect('tradeoffs' in applyDraft(sip, emptyDraft({ tradeoffs: [] }), 0)).toBe(false);
    expect(applyDraft(sip, emptyDraft({ tradeoffs: ['B cost'] }), 0).tradeoffs).toEqual(['B cost']);
  });

  it('preserves an impact sub-field it does not own', () => {
    const sip = baseEip({
      stakeholderImpacts: {
        endUsers: { impact: 'Low', description: 'Old' },
      } as SIP['stakeholderImpacts'],
    });
    const draft = emptyDraft();
    draft.stakeholderImpacts.endUsers = 'New';

    expect(applyDraft(sip, draft, 0).stakeholderImpacts?.endUsers).toEqual({
      impact: 'Low',
      description: 'New',
    });
  });

  it('drops stakeholderImpacts entirely once every description is cleared', () => {
    const sip = baseEip({
      stakeholderImpacts: { endUsers: { description: 'Old' } } as SIP['stakeholderImpacts'],
    });

    expect('stakeholderImpacts' in applyDraft(sip, emptyDraft(), 0)).toBe(false);
  });

  it('scopes champions to the selected fork relationship', () => {
    const sip = baseEip({
      forkRelationships: [
        { forkName: 'Fusaka', statusHistory: [], champions: [{ name: 'Ana' }] },
        { forkName: 'Hegota', statusHistory: [] },
      ],
    });
    const merged = applyDraft(sip, emptyDraft({ champions: [{ name: 'Bo', discord: 'bo' }] }), 1);

    expect(merged.forkRelationships[0].champions).toEqual([{ name: 'Ana' }]);
    expect(merged.forkRelationships[1].champions).toEqual([{ name: 'Bo', discord: 'bo' }]);
  });

  it('drops blank optional champion contacts', () => {
    const sip = baseEip();
    const merged = applyDraft(
      sip,
      emptyDraft({ champions: [{ name: 'Ana', discord: '', telegram: '  ', email: 'a@b.c' }] }),
      0,
    );

    expect(merged.forkRelationships[0].champions).toEqual([{ name: 'Ana', email: 'a@b.c' }]);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('validateDraft', () => {
  const fields = (draft: ChampionDraft) => validateDraft(draft).map((w) => w.message);
  const has = (draft: ChampionDraft, fragment: string) =>
    fields(draft).some((m) => m.includes(fragment));

  it('flags every audit-sips completeness check on an empty draft', () => {
    const messages = fields(emptyDraft());

    expect(messages).toContain('Missing layer — pick EL or CL.');
    expect(messages).toContain('Missing laymanDescription.');
    expect(messages).toContain('Missing benefits.');
    expect(messages.some((m) => m.includes('reviewer'))).toBe(true);
    expect(messages.some((m) => m.includes('stakeholderImpacts'))).toBe(false);
  });

  it('is silent on a complete draft', () => {
    expect(validateDraft(filledDraft())).toEqual([]);
  });

  it('stays quiet about length, which is only a guideline', () => {
    expect(
      validateDraft(
        filledDraft({
          laymanDescription: 'word '.repeat(61),
          benefits: ['word '.repeat(17)],
          tradeoffs: ['word '.repeat(17)],
        }),
      ),
    ).toEqual([]);
  });

  it('flags tradeoffs that are neither a list nor explicitly null', () => {
    expect(has(filledDraft({ tradeoffs: [] }), 'tradeoffs is empty')).toBe(true);
    expect(has(filledDraft({ tradeoffs: null }), 'tradeoffs')).toBe(false);
  });

  it('flags the hard schema limits', () => {
    const faqItem = { question: 'Q?', answer: 'A' };
    expect(
      has(filledDraft({ faq: Array.from({ length: 21 }, () => faqItem) }), '21 FAQ items'),
    ).toBe(true);
    expect(
      has(filledDraft({ faq: [{ question: 'q'.repeat(201), answer: 'A' }] }), 'FAQ question 1'),
    ).toBe(true);
    expect(
      has(filledDraft({ faq: [{ question: 'Q?', answer: 'a'.repeat(5001) }] }), 'FAQ answer 1'),
    ).toBe(true);
  });

  it('flags half-filled FAQ and supporting document rows', () => {
    expect(has(filledDraft({ faq: [{ question: 'Q?', answer: '' }] }), 'FAQ item 1')).toBe(true);
    expect(
      has(
        filledDraft({ supportingDocuments: [{ label: 'Benchmarks', url: '' }] }),
        'Supporting document 1',
      ),
    ).toBe(true);
  });
});

describe('countWords', () => {
  it('ignores surrounding and repeated whitespace', () => {
    expect(countWords('  one   two \n three ')).toBe(3);
    expect(countWords('   ')).toBe(0);
  });
});
