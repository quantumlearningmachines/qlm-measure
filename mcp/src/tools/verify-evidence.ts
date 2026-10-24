/**
 * verify_evidence: can I trust this result? Runs qlm-measure's own verifier (vendored 0.9.0 build,
 * unchanged) on a local evidence record or a product hash chain, the way its CLI does, and reports
 * pass, or each named check that failed. The CLI's --report option, which writes a file, is never used.
 */
import { CATALOG, CATALOG_V03 } from "../../vendor/qlm-measure/checks.js";
import { main } from "../../vendor/qlm-measure/cli.js";
import { Refusal, localFile } from "../files.js";
import { VENDORED_FROM } from "../package.js";

type Obj = Record<string, unknown>;

export interface VerifyEvidenceInput {
  path?: string | undefined;
  kind?: "record" | "chain" | "list_schemes" | undefined;
  family?: string | undefined;
  scheme?: string | undefined;
  allow_mixed?: boolean | undefined;
}

const CHECK = new Map([...CATALOG_V03, ...CATALOG].map((c) => [c.id, c]));

/** The verifier's stdin reader. This tool only ever passes file paths, so it is never asked to read stdin. */
export function noStdin(): string {
  throw new Refusal("verify_evidence reads files, not standard input.");
}

function run(argv: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const code = main(argv, { out: (t) => (out += t), err: (t) => (err += t), readStdin: noStdin });
  if (code === 2) throw new Refusal(`The verifier stopped: ${err.trim()}`);
  return { code, out, err };
}

const DOES_NOT_SHOW = [
  "Whether the estimates in a record are right. The verifier checks bookkeeping integrity (hashes, order, schema, how posteriors chain), not how anything was estimated.",
  "Whether the recorded events happened as described. A clean chain shows the records weren't changed after they were sealed.",
  "Who the learner is.",
];

export function verifyEvidence(input: VerifyEvidenceInput): Obj {
  const kind = input.kind ?? "record";
  const verifier = `qlm-measure 0.9.0 (vendored from ${VENDORED_FROM})`;
  if (kind === "list_schemes") {
    const schemes = run(["verify-chain", "--list"]).out.trim().split("\n").map((line) => {
      const [id, family, since, fields] = line.split("\t") as [string, string, string, string];
      return { id, family, since: since.replace(/^since /, ""), fields };
    });
    return { verifier, schemes, does_not_show: ["Anything about a file. This lists the chain schemes the verifier knows."] };
  }
  const { path } = localFile(input.path, "path", 100_000_000);
  if (kind === "chain") {
    if (input.family === undefined && input.scheme === undefined) throw new Refusal("Name the chain's family (for example tpc/clinical) or its exact scheme (for example tpc/clinical-v2). verify_evidence with kind list_schemes lists them.");
    const argv = ["verify-chain", path, ...(input.scheme !== undefined ? ["--scheme", input.scheme] : ["--family", input.family!]), "--format", "json", ...(input.allow_mixed ? ["--allow-mixed"] : [])];
    const { code, out } = run(argv);
    const report = JSON.parse(out) as { errors: string[] };
    return { verdict: code === 0 ? "pass" : "fail", verifier, failed_checks: report.errors, report, does_not_show: DOES_NOT_SHOW };
  }
  const { code, out } = run(["verify", path, "--format", "json"]);
  const report = JSON.parse(out) as { records: { checks: { id: string; status: string; failures: number; first_failure?: unknown }[] }[] };
  const failed = report.records.flatMap((r, i) =>
    r.checks.filter((c) => c.status === "fail").map((c) => ({ record: i + 1, check: c.id, failures: c.failures, first_failure: c.first_failure, what_it_checks: CHECK.get(c.id)?.description, how_to_pass: CHECK.get(c.id)?.howToPass })),
  );
  return { verdict: code === 0 ? "pass" : "fail", verifier, records_checked: report.records.length, failed_checks: failed, report, does_not_show: DOES_NOT_SHOW };
}
