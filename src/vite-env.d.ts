/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_BO_FISCAL_FN?: string;
  readonly VITE_BO_FISCAL_URL?: string;
  readonly VITE_DEV_PREVIEW?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
