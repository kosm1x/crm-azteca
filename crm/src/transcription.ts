/**
 * Voice Transcription Provider
 *
 * OpenAI Whisper-compatible API client. Works with:
 * - OpenAI (api.openai.com/v1/audio/transcriptions)
 * - Groq (api.groq.com/openai/v1/audio/transcriptions)
 * - Local Whisper (any OpenAI-compatible endpoint)
 *
 * Sends audio as multipart/form-data, returns { text, confidence }.
 */

import fs from "fs";
import path from "path";
import { logger } from "./logger.js";

export interface TranscriptionResult {
  text: string;
  /** 0.0–1.0 confidence score (estimated from avg_logprob when available) */
  confidence: number;
}

interface WhisperVerboseResponse {
  text: string;
  segments?: Array<{ avg_logprob?: number }>;
}

const WHISPER_TIMEOUT_MS = 30_000;

/**
 * Transcribe an audio file using a Whisper-compatible API.
 *
 * @param filepath Absolute path to the audio file
 * @param apiUrl   Whisper endpoint (e.g. https://api.openai.com/v1/audio/transcriptions)
 * @param apiKey   Bearer token
 * @param model    Model name (default: whisper-1)
 */
export async function transcribe(
  filepath: string,
  apiUrl: string,
  apiKey: string,
  model = "whisper-1",
): Promise<TranscriptionResult> {
  if (!fs.existsSync(filepath)) {
    throw new Error(`Audio file not found: ${filepath}`);
  }

  const fileBuffer = fs.readFileSync(filepath);
  const filename = path.basename(filepath);
  const ext = path.extname(filepath).slice(1);

  // Map extension to MIME type
  const mimeMap: Record<string, string> = {
    ogg: "audio/ogg",
    opus: "audio/ogg",
    mp4: "audio/mp4",
    m4a: "audio/mp4",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    webm: "audio/webm",
  };
  const mimeType = mimeMap[ext] || "audio/ogg";

  // Build multipart/form-data manually (no external dependency)
  const boundary = `----whisper${Date.now()}${Math.random().toString(36).slice(2)}`;

  const parts: Buffer[] = [];

  // file field
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
  );
  parts.push(fileBuffer);
  parts.push(Buffer.from("\r\n"));

  // model field
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}\r\n`,
    ),
  );

  // language hint (Spanish)
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nes\r\n`,
    ),
  );

  // response_format: verbose_json (includes segments with avg_logprob)
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\nverbose_json\r\n`,
    ),
  );

  // closing boundary
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WHISPER_TIMEOUT_MS);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Whisper API ${response.status}: ${errorText.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as WhisperVerboseResponse;

    // Estimate confidence from avg_logprob across segments
    let confidence = 0.8; // default when no segments
    if (data.segments?.length) {
      const avgLogprob =
        data.segments.reduce((sum, s) => sum + (s.avg_logprob ?? -0.3), 0) /
        data.segments.length;
      // Convert log probability to 0-1 scale
      // avg_logprob of 0 = perfect, -1 = very uncertain
      confidence = Math.max(0, Math.min(1, 1 + avgLogprob));
    }

    logger.info(
      {
        filepath: path.basename(filepath),
        textLen: data.text.length,
        confidence: Math.round(confidence * 100) / 100,
      },
      "Audio transcribed",
    );

    return { text: data.text.trim(), confidence };
  } finally {
    clearTimeout(timer);
  }
}
