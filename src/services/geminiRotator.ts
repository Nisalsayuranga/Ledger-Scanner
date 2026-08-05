// Note: Gemini API keys are now securely managed server-side via Supabase Edge Function 'ocr-proxy'.
// Client-side key rotation is deprecated to prevent key exposure in JS bundle.

export const keyRotator = {
  getAllKeys: (): string[] => [],
  getNextKey: (): string => "",
};
