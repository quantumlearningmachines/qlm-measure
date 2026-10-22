#!/usr/bin/env node
/**
 * qlm-measure CLI — verify evidence records from the command line.
 * verify makes no network calls. Records never leave your machine.
 */
/** Where the CLI writes and reads. Tests pass their own; the binary uses processIO. */
export interface CliIO {
    out(text: string): void;
    err(text: string): void;
    readStdin(): string;
}
export declare const processIO: CliIO;
/** Runs one CLI invocation and returns its exit code: 0 clean, 1 not clean, 2 usage or input error. */
export declare function main(argv: string[], io?: CliIO): number;
/** True when this module is the script node was started with, including through npm's bin symlink. */
export declare function isDirectRun(scriptPath: string | undefined, moduleUrl: string): boolean;
//# sourceMappingURL=cli.d.ts.map