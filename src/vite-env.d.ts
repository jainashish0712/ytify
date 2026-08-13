/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const Build: string;
declare const Locales: string[];

interface ImportMetaEnv {
  readonly YOUTUBE_API_KEY?: string;
  readonly VITE_YOUTUBE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

