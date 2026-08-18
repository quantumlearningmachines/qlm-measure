/**
 * Measurement Emitter — Buffered telemetry for the open measurement layer.
 *
 * Buffers events and flushes via sendBeacon (browser) or fetch (Node).
 * Survives page unload. Configurable endpoint and buffer size.
 */
import type { MeasurementEvent } from "../schema/measurement-event.js";
export interface EmitterConfig {
    /** Base URL of the measurement service. */
    baseUrl: string;
    /** API key for authentication (optional for public endpoints). */
    apiKey?: string;
    /** Product identifier. */
    product?: string;
    /** Maximum events to buffer before auto-flush. Default: 20. */
    bufferSize?: number;
    /** Flush interval in milliseconds. Default: 5000. */
    flushIntervalMs?: number;
}
export declare class MeasurementEmitter {
    private buffer;
    private timer;
    private readonly config;
    private readonly ingestUrl;
    constructor(config: EmitterConfig);
    /** Emit a measurement event. Buffered until flush. */
    emit(event: MeasurementEvent): void;
    /** Flush all buffered events to the measurement service. */
    flush(): void;
    /** Stop the auto-flush timer. */
    destroy(): void;
}
//# sourceMappingURL=measurement-emitter.d.ts.map