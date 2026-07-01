export type PostPaneId = 'human' | 'agent' | 'abstract' | 'view' | string;

export interface RawPostFrontmatter {
  title?: string;
  date?: string | number;
  slug?: string;
}

export interface RawPostPaneConfig {
  id: PostPaneId;
  title?: string;
  file?: string;
}

export interface RawPostLayoutConfig {
  preset?: '1x3+1' | '4x1' | '1x4';
  columns?: string;
  rows?: string;
  areas?: string[][];
}

export interface RawPostConfig {
  title?: string;
  date?: string | number;
  slug?: string;
  panes?: RawPostPaneConfig[];
  layout?: RawPostLayoutConfig;
  sync?: {
    enabled?: boolean;
    source?: PostPaneId;
  };
}

export interface PostMetadata {
  title: string;
  date: Date;
  isoDate: string;
  slug: string;
  source: string;
}

export interface PostPane {
  id: PostPaneId;
  title: string;
  file: string;
  rawContent: string;
  bodyHtml: string;
  missing: boolean;
}

export interface PostLayout {
  columns: string;
  rows: string;
  areas: string[][];
}

export interface Post {
  metadata: PostMetadata;
  bodyHtml: string;
  rawContent: string;
  panes: PostPane[];
  layout: PostLayout;
  sync: {
    enabled: boolean;
    source: PostPaneId;
  };
}
