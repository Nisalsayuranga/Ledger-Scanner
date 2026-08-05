// Supabase Edge Function: ocr-proxy
// Handles Gemini API OCR calls using PAID API key with high throughput

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "gemini-3.6-flash";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, imageInput, base64Data, mimeType } = await req.json();

    if (!imageInput && !base64Data) {
      return new Response(
        JSON.stringify({ error: "Missing imageInput or base64Data in request payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // PAID API key (primary) — 2000 RPM, loaded securely from Supabase secrets
    const PAID_KEY = Deno.env.get("GEMINI_PAID_KEY");

    if (!PAID_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_PAID_KEY secret is not set in Supabase Edge Functions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanBase64 = base64Data || (imageInput ? imageInput.replace(/^data:image\/\w+;base64,/, "") : "");
    const imageMime = mimeType || "image/jpeg";

    let prompt = "";
    if (action === "extract_date") {
      prompt = `
      You are an expert OCR date detector. Look closely at this handwritten Sri Lankan pawning daily ledger page.
      Locate the date stamp (e.g. "31 OCT 2025", "28 OCT 2025", "15/10/2025").
      Return JSON:
      {
        "date": "YYYY-MM-DD"
      }
      If the date is missing, unreadable, or blurry, return {"date": null}.
      `;
    } else {
      prompt = `
      You are an expert handwriting financial auditor. Extract all ledger details from this Daily Ledger page into JSON matching this schema:

      {
        "meta": {
          "date": "YYYY-MM-DD",
          "branch": "Branch Name",
          "staff": "Staff Name",
          "cp_balance": 0.00
        },
        "transactions": [
          {
            "loan_code": "Code e.g. A / 3M",
            "loan_number": "1234",
            "cash_loan": 0.00,
            "insurance": 0.00,
            "wt_g": 0.00,
            "wt_mg": 0.00,
            "item_code": "Item e.g. PP / BRC / CAR",
            "redeem_code": "Redeem Code e.g. R",
            "redeem_number": "5678",
            "interest": 0.00,
            "cash_rdm": 0.00,
            "transaction_type": "Type e.g. PR",
            "fs_status": "F/S status",
            "row_order": 1
          }
        ],
        "summary": {
          "opening_balance": 0.00,
          "cash_in": 0.00,
          "cash_out": 0.00,
          "total_loan": 0.00,
          "total_redeem": 0.00,
          "receive": 0.00,
          "recovery": 0.00,
          "insurance": 0.00,
          "expenses": 0.00,
          "closing_balance": 0.00,
          "actual_cash_count": 0.00,
          "variance": 0.00
        }
      }

      Parse clean float/int values for numeric fields (omit currency symbols and commas).
      `;
    }

    let lastError = "";
    
    // With paid key: 2000 RPM, so simple retry with short waits is fine
    const MAX_ATTEMPTS = 3;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${PAID_KEY}`;

      try {
        const res = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: imageMime,
                      data: cleanBase64
                    }
                  }
                ]
              }
            ],
            generationConfig: { responseMimeType: "application/json" }
          })
        });

        if (!res.ok) {
          const errText = await res.text();
          lastError = `HTTP ${res.status}: ${errText.substring(0, 300)}`;
          console.warn(`Attempt ${attempt + 1} failed:`, lastError);

          if (res.status === 429) {
            const retryMatch = errText.match(/retry in ([\d.]+)s/i);
            const waitMs = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) + 500 : 2000;
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }

        const geminiJson = await res.json();
        const rawText = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text;

        if (rawText) {
          const parsedResult = JSON.parse(rawText);

          if (action === "extract_date") {
            if (parsedResult.date && typeof parsedResult.date === "string" && parsedResult.date.length >= 8) {
              return new Response(
                JSON.stringify({ date: parsedResult.date }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
            lastError = "Date not recognized in image";
            continue;
          }

          return new Response(
            JSON.stringify({ result: parsedResult }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else {
          lastError = "Gemini returned empty content";
          console.warn(lastError);
          await new Promise((r) => setTimeout(r, 1000));
        }
      } catch (err: any) {
        lastError = err?.message || String(err);
        console.warn(`Attempt ${attempt + 1} exception:`, lastError);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    if (action === "extract_date") {
      return new Response(
        JSON.stringify({ date: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `OCR failed after ${MAX_ATTEMPTS} attempts. Last error: ${lastError}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || "Internal server error in ocr-proxy Edge Function" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
