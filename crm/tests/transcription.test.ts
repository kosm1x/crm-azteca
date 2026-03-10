import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// We test the transcribe function by mocking the global fetch
import { transcribe } from "../src/transcription.js";

// Mock logger to avoid noisy output
vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let tmpDir: string;
let audioFile: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "transcription-test-"));
  audioFile = path.join(tmpDir, "test.ogg");
  // Write a fake audio file (just needs to exist for the test)
  fs.writeFileSync(audioFile, Buffer.from("fake-audio-data"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("transcribe", () => {
  it("returns text and confidence on success", async () => {
    const mockResponse = {
      text: "Hola, quiero hablar de la propuesta de Coca-Cola",
      segments: [{ avg_logprob: -0.15 }, { avg_logprob: -0.2 }],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await transcribe(
      audioFile,
      "https://api.example.com/v1/audio/transcriptions",
      "test-key",
    );

    expect(result.text).toBe(
      "Hola, quiero hablar de la propuesta de Coca-Cola",
    );
    // avg_logprob = (-0.15 + -0.20) / 2 = -0.175 → confidence = 1 + (-0.175) = 0.825
    expect(result.confidence).toBeCloseTo(0.825, 2);
  });

  it("defaults confidence to 0.8 when no segments", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "Hola mundo" }),
    } as Response);

    const result = await transcribe(
      audioFile,
      "https://api.example.com/v1/audio/transcriptions",
      "test-key",
    );
    expect(result.text).toBe("Hola mundo");
    expect(result.confidence).toBe(0.8);
  });

  it("clamps confidence to 0-1 range", async () => {
    // Very high confidence (avg_logprob close to 0)
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        text: "Test",
        segments: [{ avg_logprob: -0.01 }],
      }),
    } as Response);

    const high = await transcribe(
      audioFile,
      "https://api.example.com/v1/audio/transcriptions",
      "key",
    );
    expect(high.confidence).toBeLessThanOrEqual(1);
    expect(high.confidence).toBeGreaterThanOrEqual(0);

    // Very low confidence (avg_logprob very negative)
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        text: "Test",
        segments: [{ avg_logprob: -2.0 }],
      }),
    } as Response);

    const low = await transcribe(
      audioFile,
      "https://api.example.com/v1/audio/transcriptions",
      "key",
    );
    expect(low.confidence).toBe(0);
  });

  it("throws on non-existent file", async () => {
    await expect(
      transcribe("/nonexistent/audio.ogg", "https://api.example.com", "key"),
    ).rejects.toThrow("Audio file not found");
  });

  it("throws on API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    } as Response);

    await expect(
      transcribe(
        audioFile,
        "https://api.example.com/v1/audio/transcriptions",
        "bad-key",
      ),
    ).rejects.toThrow("Whisper API 401");
  });

  it("sends correct multipart form data", async () => {
    let capturedBody: Buffer | undefined;
    let capturedHeaders: Record<string, string> | undefined;

    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_url, init) => {
      capturedBody = init?.body as Buffer;
      capturedHeaders = Object.fromEntries(
        Object.entries(init?.headers as Record<string, string>),
      );
      return {
        ok: true,
        json: async () => ({ text: "Test" }),
      } as Response;
    });

    await transcribe(
      audioFile,
      "https://api.example.com/v1/audio/transcriptions",
      "my-key",
      "whisper-large-v3",
    );

    // Check authorization header
    expect(capturedHeaders?.["Authorization"]).toBe("Bearer my-key");

    // Check multipart content type
    expect(capturedHeaders?.["Content-Type"]).toMatch(
      /^multipart\/form-data; boundary=/,
    );

    // Check body contains model name and language
    const bodyStr = capturedBody!.toString();
    expect(bodyStr).toContain("whisper-large-v3");
    expect(bodyStr).toContain('name="language"');
    expect(bodyStr).toContain("es");
    expect(bodyStr).toContain("verbose_json");
    expect(bodyStr).toContain('name="file"');
  });

  it("trims whitespace from transcription text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "  Hola mundo  \n" }),
    } as Response);

    const result = await transcribe(
      audioFile,
      "https://api.example.com/v1/audio/transcriptions",
      "key",
    );
    expect(result.text).toBe("Hola mundo");
  });

  it("handles different audio extensions", async () => {
    const mp3File = path.join(tmpDir, "test.mp3");
    fs.writeFileSync(mp3File, Buffer.from("fake"));

    let capturedBody = "";
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_url, init) => {
      capturedBody = (init?.body as Buffer).toString();
      return {
        ok: true,
        json: async () => ({ text: "Test" }),
      } as Response;
    });

    await transcribe(
      mp3File,
      "https://api.example.com/v1/audio/transcriptions",
      "key",
    );
    expect(capturedBody).toContain("audio/mpeg");
  });
});
