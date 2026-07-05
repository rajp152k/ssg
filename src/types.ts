export type PostPaneId = string;

export interface RawPostPaneConfig {
  id: PostPaneId;
  title?: string;
  file?: string;
  generated?: 'index' | 'annotations';
  source?: PostPaneId;
}

export interface RawPostLayoutConfig {
  preset?: 'canvas';
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
}

export interface PostMetadata {
  title: string;
  date: Date;
  isoDate: string;
  createdAt: Date;
  updatedAt: Date;
  contentHash: string;
  shortHash: string;
  authoredDate?: Date;
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
}
