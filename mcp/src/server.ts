/**
 * The Learnlog MCP server: six read-only tools over stdio. Five run on this machine and read local
 * files only. verify_credential sends one request to app.qlmdev.com. Nothing is uploaded or written.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { NAME, VERSION } from "./package.js";
import { guard } from "./respond.js";
import { LEARNLOG_DRAFT } from "./stages.js";
import { learnlogFormats } from "./tools/formats.js";
import { assistanceInventory } from "./tools/inventory.js";
import { learnlogTransform } from "./tools/transform.js";
import { learnlogValidate } from "./tools/validate.js";
import { verifyCredential } from "./tools/verify-credential.js";
import { verifyEvidence } from "./tools/verify-evidence.js";
import { FORMAT_IDS } from "./transformer.js";

export const TOOL_NAMES = ["learnlog_formats", "learnlog_transform", "learnlog_validate", "assistance_inventory", "verify_evidence", "verify_credential"] as const;

const INSTRUCTIONS = `Learnlog MCP answers questions about what learning records actually show about help, using Learnlog (${LEARNLOG_DRAFT}). Keep the six assistance stages apart: requested, offered, generated, transmitted, displayed, accepted. One never implies the next. A stage that wasn't captured is "not recorded", never "none" or zero. Every answer has a does_not_show list: pass those limits on to the person. All tools are read-only. Five read local files only; verify_credential sends one request to app.qlmdev.com.`;

const LOCAL = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const path = (what: string) => z.string().describe(`Full path to ${what} on this computer (absolute, or starting with ~/).`);

export function createServer(options: { fetch?: typeof fetch } = {}): McpServer {
  const server = new McpServer({ name: NAME, version: VERSION }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "learnlog_formats",
    {
      title: "Learnlog formats",
      description: "Which exports can I convert to Learnlog? Lists the transformer's source formats, what each one records at each of the six assistance stages, its bundled public sample, and the three released datasets the Learnlog preprint uses. No input.",
      inputSchema: {},
      annotations: LOCAL,
    },
    async () => guard(() => learnlogFormats()),
  );

  server.registerTool(
    "learnlog_transform",
    {
      title: "Transform to Learnlog",
      description: "Turn an export into Learnlog records, keeping source and capture details. Give a format (see learnlog_formats) and either a local file path or use_sample: true for the format's bundled public sample. Returns a summary, the records' hash-chain heads, the unknowns they keep and a preview; set include_document for the whole Learnlog document. Nothing is written to disk.",
      inputSchema: {
        format: z.enum(FORMAT_IDS).describe("The source format."),
        path: path("the export file").optional(),
        use_sample: z.boolean().optional().describe("Use the format's bundled public sample instead of a file."),
        tenant: z.string().min(1).max(200).optional().describe("A scope name for the learner pseudonyms. Default: local."),
        include_document: z.boolean().optional().describe("Return the whole Learnlog document."),
      },
      annotations: LOCAL,
    },
    async (args) => guard(() => learnlogTransform(args)),
  );

  server.registerTool(
    "learnlog_validate",
    {
      title: "Validate Learnlog",
      description: "Is this a valid Learnlog file? Replays each record's hash chain and checks the transformer's profile bindings, then lists errors, warnings and the unknowns each record keeps (for example source time, capture coverage or model version not recorded).",
      inputSchema: { path: path("the Learnlog JSON file") },
      annotations: LOCAL,
    },
    async (args) => guard(() => learnlogValidate(args)),
  );

  server.registerTool(
    "assistance_inventory",
    {
      title: "Assistance inventory",
      description:
        "What does this dataset actually record about help? Reports, for each source, which of the six assistance stages are recorded (requested, offered, generated, transmitted, displayed, accepted), the counts, and what can't be concluded. Three ways to use it: (1) an export: format with path or use_sample: true; (2) a Learnlog file: learnlog_path; (3) the Learnlog preprint's released datasets, from your own copies: zenodo_zip, idetrace_json (with allow_idetrace_research: true), assistments_csv, which recomputes the preprint's inventory and episode counts and compares them with the published numbers when the files are the pinned releases. With no input it returns the preprint's published figures, labeled as not recomputed.",
      inputSchema: {
        format: z.enum(FORMAT_IDS).optional().describe("The export's format, with path or use_sample."),
        path: path("the export file").optional(),
        use_sample: z.boolean().optional().describe("Use the format's bundled public sample."),
        tenant: z.string().min(1).max(200).optional(),
        learnlog_path: path("a Learnlog JSON file").optional(),
        zenodo_zip: path("the Zenodo 17551130 archive (ai_hints_interaction.zip)").optional(),
        idetrace_json: path("IDETrace dataset/raw_telemetry/deployment_8.json").optional(),
        allow_idetrace_research: z.boolean().optional().describe("Required to read the IDETrace file: it holds learner telemetry with unclear redistribution terms. Only counts are returned."),
        assistments_csv: path("the ASSISTments 2012-13 School Data with Affect CSV").optional(),
      },
      annotations: LOCAL,
    },
    async (args) => guard(() => assistanceInventory(args)),
  );

  server.registerTool(
    "verify_evidence",
    {
      title: "Verify evidence",
      description: "Can I trust this result? Replays a local evidence record or product hash chain with qlm-measure's own verifier and returns pass, or each named check that failed and where. kind: record (default), chain (with family or scheme), or list_schemes.",
      inputSchema: {
        path: path("the evidence record or chain JSON").optional(),
        kind: z.enum(["record", "chain", "list_schemes"]).optional(),
        family: z.string().min(1).optional().describe("Chain family, for example tpc/clinical."),
        scheme: z.string().min(1).optional().describe("Exact chain scheme, for example tpc/clinical-v2."),
        allow_mixed: z.boolean().optional().describe("Allow a chain that mixes scheme versions."),
      },
      annotations: LOCAL,
    },
    async (args) => guard(() => verifyEvidence(args)),
  );

  server.registerTool(
    "verify_credential",
    {
      title: "Verify a QLM credential",
      description: "Is this QLM credential real and current? Give its ID (urn:uuid:...) or a link that contains it. Sends one request to https://app.qlmdev.com/v1/verify and returns whether it verified, each check with its result, the issuer, the achievement, the date and the AI-help summary by stage. The report has no personal data.",
      inputSchema: { credential: z.string().min(1).max(2048).describe("The credential ID, or a link containing it.") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => guard(() => verifyCredential(args, options.fetch)),
  );

  return server;
}

export async function start(): Promise<void> {
  await createServer().connect(new StdioServerTransport());
}
