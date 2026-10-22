// ScoreSnap — OCR Scorecard Processor
// Accepts a base64-encoded scorecard image and returns extracted player scores
// using the Anthropic Claude Vision API.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Max payload size: 10MB (base64 image)
const MAX_PAYLOAD_SIZE = 10 * 1024 * 1024;

interface OcrRequest {
  imageData: string;
  mediaType?: "image/jpeg" | "image/png";
}

interface OcrResponse {
  players: Array<{
    name: string;
    scores: number[];
    confidence: number[];
    nameConfidence: number;
  }>;
  par?: number[];
}

serve(async (req) => {
  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  // Check API key is configured
  if (!ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not configured");
    return new Response(
      JSON.stringify({ error: "OCR service not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Verify authentication
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Missing authorization header" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // Validate JWT token
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: authHeader },
    },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired token" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // Parse request body
  let body: OcrRequest;
  try {
    const text = await req.text();
    
    // Check payload size
    if (text.length > MAX_PAYLOAD_SIZE) {
      return new Response(
        JSON.stringify({ error: "Payload too large. Maximum size is 10MB." }),
        { status: 413, headers: { "Content-Type": "application/json" } }
      );
    }

    body = JSON.parse(text);
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON payload" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Validate required fields
  if (!body.imageData || typeof body.imageData !== "string") {
    return new Response(
      JSON.stringify({ error: "Missing or invalid imageData field" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const mediaType = body.mediaType || "image/jpeg";
  if (mediaType !== "image/jpeg" && mediaType !== "image/png") {
    return new Response(
      JSON.stringify({ error: "Invalid mediaType. Must be 'image/jpeg' or 'image/png'." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Call Anthropic API
  try {
    const anthropicResponse = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250514",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: body.imageData,
                },
              },
              {
                type: "text",
                text: `Extract all player names and their 18-hole golf scores from this scorecard image.

Return ONLY a JSON object in this exact format (no other text):
{
  "players": [
    {
      "name": "Player Name",
      "scores": [4, 5, 3, 4, 5, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4],
      "confidence": [0.95, 0.9, 0.95, 0.85, 0.9, 0.95, 0.9, 0.95, 0.9, 0.95, 0.9, 0.95, 0.9, 0.85, 0.9, 0.95, 0.9, 0.95]
    }
  ],
  "par": [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4]
}

Rules:
- Each player must have exactly 18 scores (use 0 for missing holes)
- Each player must have exactly 18 confidence values (0.0-1.0)
- Confidence should reflect how certain you are of each score read
- Lower confidence (< 0.7) for unclear, smudged, or ambiguous values
- Include the par row if visible on the scorecard
- If fewer than 18 holes are visible, fill remaining with 0 and confidence 0
- Names should match exactly what's written (initials, abbreviations, etc.)`,
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      console.error(`Anthropic API error: ${anthropicResponse.status} — ${errorText}`);
      return new Response(
        JSON.stringify({
          error: `OCR service error: ${anthropicResponse.status}`,
          details: errorText,
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await anthropicResponse.json();
    const content = data.content?.[0]?.text || "";

    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(
        JSON.stringify({ error: "Could not extract valid JSON from OCR response" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and normalize response
    const players = (parsed.players || []).map((p: any) => ({
      name: String(p.name || "Unknown"),
      scores: ensureArray(p.scores, 18, 0),
      confidence: ensureArray(p.confidence, 18, 0.8),
      nameConfidence: calculateNameConfidence(String(p.name || "")),
    }));

    const response: OcrResponse = {
      players,
      par: parsed.par ? ensureArray(parsed.par, 18, 4) : undefined,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("OCR processing error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to process scorecard image",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

/**
 * Ensure an array has exactly `length` elements, padding with `fill`.
 */
function ensureArray(arr: any, length: number, fill: number): number[] {
  if (!Array.isArray(arr)) return new Array(length).fill(fill);
  const result = arr.slice(0, length).map((v: any) => {
    const n = Number(v);
    return isNaN(n) ? fill : n;
  });
  while (result.length < length) result.push(fill);
  return result;
}

/**
 * Calculate confidence for a player name based on its structure.
 */
function calculateNameConfidence(name: string): number {
  if (!name || name.trim().length === 0) return 0;

  // Full name (first + last)
  if (/^[A-Za-z]+ [A-Za-z]+/.test(name)) return 0.95;

  // First name + initial (e.g., "Mike T.")
  if (/^[A-Za-z]+ [A-Z]\.?$/.test(name)) return 0.85;

  // Single name
  if (/^[A-Za-z]+$/.test(name)) return 0.75;

  // Initials only (e.g., "M.T.")
  if (/^[A-Z]\.?[A-Z]?\.?$/.test(name)) return 0.5;

  // Anything else
  return 0.6;
}
