import { describe, expect, it } from 'vitest';
import { escapeHtml, formatDate, renderTemplate } from '../src/lib/template';

describe('template utilities', () => {
  it('renders known placeholders', () => {
    const rendered = renderTemplate('Hello, {{name}}!', { name: 'Reader' });

    expect(rendered).toBe('Hello, Reader!');
  });

  it('keeps unknown placeholders untouched', () => {
    const rendered = renderTemplate('Hello, {{name}} {{missing}}', { name: 'Reader' });

    expect(rendered).toBe('Hello, Reader {{missing}}');
  });

  it('escapes HTML correctly', () => {
    const escaped = escapeHtml(`<tag attr="x">& 'quote'</tag>`);

    expect(escaped).toBe('&lt;tag attr=&quot;x&quot;&gt;&amp; &#39;quote&#39;&lt;/tag&gt;');
  });

  it('formats dates to yyyy-mm-dd', () => {
    expect(formatDate(new Date('2026-07-02T10:00:00.000Z'))).toBe('2026-07-02');
  });
});
