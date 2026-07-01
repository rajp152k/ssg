import { describe, expect, it } from 'vitest';
import { derivePostSlug, slugify } from '../src/lib/slug';

describe('slug utilities', () => {
  it('slugifies plain titles', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
    expect(slugify('  spaced   title ')).toBe('spaced-title');
  });

  it('slugifies accent characters', () => {
    expect(slugify('Cafés à la carte')).toBe('cafes-a-la-carte');
  });

  it('derives post slug from title when available', () => {
    expect(derivePostSlug('Some Title', '/tmp/posts/some-title.md')).toBe('some-title');
  });

  it('falls back to source filename when title slug empty', () => {
    expect(derivePostSlug('', '/tmp/my-post-title.md')).toBe('my-post-title');
  });
});
