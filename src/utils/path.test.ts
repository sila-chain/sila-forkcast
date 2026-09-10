import { describe, expect, it } from 'vitest';
import { canonicalHref } from './path';

describe('canonicalHref', () => {
  it('adds the slash a route path is missing', () => {
    expect(canonicalHref('/sips')).toBe('/sips/');
    expect(canonicalHref('/sips/7702')).toBe('/sips/7702/');
    expect(canonicalHref('/calls/acde/244')).toBe('/calls/acde/244/');
  });

  it('leaves an already-canonical path alone', () => {
    expect(canonicalHref('/')).toBe('/');
    expect(canonicalHref('/sips/')).toBe('/sips/');
  });

  it('slashes the path, not the query or hash', () => {
    expect(canonicalHref('/calls?filter=acde')).toBe('/calls/?filter=acde');
    expect(canonicalHref('/sips/7702#faq')).toBe('/sips/7702/#faq');
    expect(canonicalHref('/sips/7702?tab=faq#top')).toBe('/sips/7702/?tab=faq#top');
    expect(canonicalHref('/sips/7702/?tab=faq')).toBe('/sips/7702/?tab=faq');
  });

  it('leaves file paths alone, since they are not routes', () => {
    expect(canonicalHref('/feed.xml')).toBe('/feed.xml');
    expect(canonicalHref('/llms.txt')).toBe('/llms.txt');
    expect(canonicalHref('/sips/7702.md')).toBe('/sips/7702.md');
    expect(canonicalHref('/api/sips.json?x=1')).toBe('/api/sips.json?x=1');
  });

  it('leaves anything not root-relative alone', () => {
    expect(canonicalHref('https://sila.org/sips')).toBe('https://sila.org/sips');
    expect(canonicalHref('mailto:hi@forkcast.org')).toBe('mailto:hi@forkcast.org');
    expect(canonicalHref('#t=1200')).toBe('#t=1200');
    expect(canonicalHref('?filter=acde')).toBe('?filter=acde');
  });

  it('is idempotent', () => {
    for (const href of ['/sips', '/calls?filter=acde', '/feed.xml', '#t=1']) {
      expect(canonicalHref(canonicalHref(href))).toBe(canonicalHref(href));
    }
  });
});
