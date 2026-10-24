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
import { EDGE_KINDS, qlmLearningGraph } from "./tools/learning-graph.js";
import { qlmMisconceptions } from "./tools/misconceptions.js";
import { DatasetClient } from "./tools/qlm-datasets.js";
import { FORMAT_IDS } from "./transformer.js";

export const TOOL_NAMES = ["learnlog_formats", "learnlog_transform", "learnlog_validate", "assistance_inventory", "verify_evidence", "verify_credential", "qlm_misconceptions", "qlm_learning_graph"] as const;

const INSTRUCTIONS = `Learnlog MCP answers questions about what learning records actually show about help, using Learnlog (${LEARNLOG_DRAFT}). Keep the six assistance stages apart: requested, offered, generated, transmitted, displayed, accepted. One never implies the next. A stage that wasn't captured is "not recorded", never "none" or zero. Every answer has a does_not_show list: pass those limits on to the person. All tools are read-only. Five read local files only. verify_credential sends one request to app.qlmdev.com; qlm_misconceptions and qlm_learning_graph read QLM's public LabPath datasets from play.quantumlearningmachines.com.`;

const LOCAL = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const path = (what: string) => z.string().describe(`Full path to ${what} on this computer (absolute, or starting with ~/).`);

export function createServer(options: { fetch?: typeof fetch } = {}): McpServer {
  const server = new McpServer({ name: NAME, version: VERSION }, { instructions: INSTRUCTIONS });
  const datasets = new DatasetClient(options.fetch);
  const NETWORK = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

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
      description: "Turn an export into Learnlog records, keeping source and capture details. Give a format (see learnlog_formats) and either a local file path or use_sample: true for the format's bundled public sample. Returns a summary, the records' hash-chain heads, the unknowns they keep and a preview; set include_document for the whole Learnlog document, which comes back only when it fits in one answer (small exports). Nothing is written to disk.",
      inputSchema: {
        format: z.enum(FORMAT_IDS).describe("The source format."),
        path: path("the export file").optional(),
        use_sample: z.boolean().optional().describe("Use the format's bundled public sample instead of a file."),
        tenant: z.string().min(1).max(200).optional().describe("A scope name for the learner pseudonyms. Default: local."),
        include_document: z.boolean().optional().describe("Return the whole Learnlog document if it fits in one answer; otherwise its size is reported instead."),
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
      annotations: NETWORK,
    },
    async (args) => guard(() => verifyCredential(args, options.fetch)),
  );

  server.registerTool(
    "qlm_misconceptions",
    {
      title: "QLM misconceptions",
      description: "Which student misconception might be behind this? Searches QLM's public, research-based misconception dataset (LabPath Dataset v1.0, CC BY 4.0) by search words, domain, grade band or id. Returns each misconception's student belief, the scientific reality, a counterexample, a teacher intervention, its research source, severity, grade bands and LabPath modes, with the citation. Reads https://play.quantumlearningmachines.com once per session.",
      inputSchema: {
        search: z.string().max(200).optional().describe("Words that must all appear, for example: force motion."),
        domain: z.string().max(50).optional().describe("For example physics, chemistry, biology, math, cs, health."),
        grade_band: z.string().max(30).optional().describe("For example K-2, 3-5, 6-8, 9-12, postsecondary."),
        id: z.string().max(50).optional().describe("A misconception id, for example from qlm_learning_graph."),
        limit: z.number().int().min(1).max(50).optional().describe("How many to return. Default 10."),
      },
      annotations: NETWORK,
    },
    async (args) => guard(() => qlmMisconceptions(args, datasets)),
  );

  server.registerTool(
    "qlm_learning_graph",
    {
      title: "QLM learning graph",
      description: "What comes before or after this LabPath activity? Give a LabPath mode id (from qlm_misconceptions) or a standard code. Returns the linked activities in LabPath's designed learning graph, with the teacher-facing reason for each link, its first 8 concepts, the misconception ids it carries, the full standards for the asked-about activity, and the standard codes of each linked one. Reads https://play.quantumlearningmachines.com once per session.",
      inputSchema: {
        mode_id: z.string().min(1).max(100).optional().describe("A LabPath mode id, for example from a misconception's modes."),
        standard: z.string().min(1).max(50).optional().describe("A standard code, for example HS-PS2-1."),
        direction: z.enum(["before", "after", "both"]).optional().describe("Default both."),
        kinds: z.array(z.enum(EDGE_KINDS)).min(1).optional().describe("Edge kinds to include. Default all."),
        limit: z.number().int().min(1).max(50).optional().describe("Most edges per direction. Default 10. Lowered, and said so, if the answer would not fit."),
      },
      annotations: NETWORK,
    },
    async (args) => guard(() => qlmLearningGraph(args, datasets)),
  );

  return server;
}

export async function start(): Promise<void> {
  await createServer().connect(new StdioServerTransport());
}
