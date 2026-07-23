/**
 * Emitter tests — verifies buffering, flush, and wire format.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MeasurementEmitter } from "../src/emitter";

// Mock fetch globally
const mockFetch = vi.fn().mockResolvedValue({ ok: true });

describe("MeasurementEmitter", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as any;
    mockFetch.mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("buffers events until flush", () => {
    const emitter = new MeasurementEmitter({
      baseUrl: "https://example.com",
      bufferSize: 100,
      flushIntervalMs: 999999,
    });

    emitter.emit({ eventType: "test", eventCategory: "system" });
    emitter.emit({ eventType: "test2", eventCategory: "learning" });

    // Not flushed yet
    expect(mockFetch).not.toHaveBeenCalled();

    emitter.flush();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    emitter.destroy();
  });

  it("auto-flushes when buffer is full", () => {
    const emitter = new MeasurementEmitter({
      baseUrl: "https://example.com",
      bufferSize: 3,
      flushIntervalMs: 999999,
    });

    emitter.emit({ eventType: "e1", eventCategory: "system" });
    emitter.emit({ eventType: "e2", eventCategory: "system" });
    expect(mockFetch).not.toHaveBeenCalled();

    emitter.emit({ eventType: "e3", eventCategory: "system" });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    emitter.destroy();
  });

  it("sends correct wire format", () => {
    const emitter = new MeasurementEmitter({
      baseUrl: "https://example.com",
      product: "test-product",
      bufferSize: 100,
    });

    emitter.emit({
      eventType: "answer_submitted",
      eventCategory: "learning",
      domain: "math",
      sessionId: "sess-1",
    });
    emitter.flush();

    const call = mockFetch.mock.calls[0];
    const url = call[0];
    const opts = call[1];
    expect(url).toBe("https://example.com/api/measurement/ingest");

    const body = JSON.parse(opts.body);
    expect(body.product).toBe("test-product");
    expect(body.events).toHaveLength(1);
    expect(body.events[0].event_type).toBe("answer_submitted");
    expect(body.events[0].event_category).toBe("learning");
    expect(body.events[0].domain).toBe("math");
    expect(body.events[0].session_id).toBe("sess-1");
    expect(body.events[0].event_id).toMatch(/^test-product-/);
    expect(body.events[0].created_at).toBeTruthy();

    emitter.destroy();
  });

  it("includes auth header when apiKey provided", () => {
    const emitter = new MeasurementEmitter({
      baseUrl: "https://example.com",
      apiKey: "my-secret-key",
    });

    emitter.emit({ eventType: "test", eventCategory: "system" });
    emitter.flush();

    const opts = mockFetch.mock.calls[0][1];
    expect(opts.headers.Authorization).toBe("Bearer my-secret-key");

    emitter.destroy();
  });

  it("does not flush when buffer is empty", () => {
    const emitter = new MeasurementEmitter({ baseUrl: "https://example.com" });
    emitter.flush();
    expect(mockFetch).not.toHaveBeenCalled();
    emitter.destroy();
  });

  it("destroy flushes remaining events", () => {
    const emitter = new MeasurementEmitter({
      baseUrl: "https://example.com",
      bufferSize: 100,
    });

    emitter.emit({ eventType: "final", eventCategory: "system" });
    emitter.destroy();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
