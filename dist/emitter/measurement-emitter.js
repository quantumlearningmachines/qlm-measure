/**
 * Measurement Emitter — Buffered telemetry for the open measurement layer.
 *
 * Buffers events and flushes via sendBeacon (browser) or fetch (Node).
 * Survives page unload. Configurable endpoint and buffer size.
 */
function generateEventId(product) {
    return `${product}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
export class MeasurementEmitter {
    buffer = [];
    timer = null;
    config;
    ingestUrl;
    constructor(config) {
        this.config = {
            baseUrl: config.baseUrl,
            apiKey: config.apiKey ?? "",
            product: config.product ?? "external",
            bufferSize: config.bufferSize ?? 20,
            flushIntervalMs: config.flushIntervalMs ?? 5000,
        };
        this.ingestUrl = `${this.config.baseUrl}/api/measurement/ingest`;
        // Auto-flush on page visibility change (browser only)
        if (typeof window !== "undefined") {
            window.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "hidden")
                    this.flush();
            });
            window.addEventListener("pagehide", () => this.flush());
        }
    }
    /** Emit a measurement event. Buffered until flush. */
    emit(event) {
        this.buffer.push({
            ...event,
            event_id: generateEventId(this.config.product),
            created_at: new Date().toISOString(),
        });
        if (this.buffer.length >= this.config.bufferSize) {
            this.flush();
        }
        if (!this.timer) {
            this.timer = setInterval(() => this.flush(), this.config.flushIntervalMs);
        }
    }
    /** Flush all buffered events to the measurement service. */
    flush() {
        if (this.buffer.length === 0)
            return;
        const batch = this.buffer.splice(0);
        const body = JSON.stringify({
            product: this.config.product,
            events: batch.map((e) => ({
                event_id: e.event_id,
                event_type: e.eventType,
                event_category: e.eventCategory,
                session_id: e.sessionId ?? null,
                classroom_id: e.classroomId ?? null,
                domain: e.domain ?? null,
                topic: e.topic ?? null,
                mode: e.mode ?? null,
                difficulty: e.difficulty ?? null,
                payload: e.payload ?? {},
                quality_signal: e.qualitySignal ?? null,
                confidence: e.confidence ?? null,
                duration_ms: e.durationMs ?? null,
                parent_event_id: e.parentEventId ?? null,
                created_at: e.created_at,
            })),
        });
        const headers = { "Content-Type": "application/json" };
        if (this.config.apiKey) {
            headers["Authorization"] = `Bearer ${this.config.apiKey}`;
        }
        // sendBeacon in browser (survives page unload)
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
            navigator.sendBeacon(this.ingestUrl, new Blob([body], { type: "application/json" }));
        }
        else {
            fetch(this.ingestUrl, {
                method: "POST",
                headers,
                body,
                keepalive: true,
            }).catch(() => { });
        }
    }
    /** Stop the auto-flush timer. */
    destroy() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.flush();
    }
}
//# sourceMappingURL=measurement-emitter.js.map