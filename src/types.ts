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
}

export interface RawPostConfig {
  title?: string;
  createdAt?: string;
  slug?: string;
  panes?: RawPostPaneConfig[];
  layout?: RawPostLayoutConfig;
}

export interface PostMetadata {
  title: string;
  createdAt?: Date;
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

export interface Meditation {
  title: string;
  date: Date;
  slug: string;
  source: string;
  bodyHtml: string;
  rawContent: string;
}
