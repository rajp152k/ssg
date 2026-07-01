export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function derivePostSlug(title: string, sourcePath: string): string {
  const base = slugify(title);
  if (base.length > 0) {
    return base;
  }

  const fallback = (sourcePath.split('/').pop() || 'post')
    .replace(/\.(md|mdx)$/i, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return fallback || 'post';
}
