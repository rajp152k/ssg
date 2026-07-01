export interface RawPostFrontmatter {
  title?: string;
  date?: string | number;
  slug?: string;
}

export interface PostMetadata {
  title: string;
  date: Date;
  isoDate: string;
  slug: string;
  source: string;
}

export interface Post {
  metadata: PostMetadata;
  bodyHtml: string;
  rawContent: string;
}
