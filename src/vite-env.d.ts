/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_GEMINI_KEY_1?: string;
  readonly VITE_GEMINI_KEY_2?: string;
  readonly VITE_GEMINI_KEY_3?: string;
  readonly VITE_GEMINI_KEY_4?: string;
  readonly VITE_GEMINI_KEY_5?: string;
  readonly VITE_GEMINI_KEY_6?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
