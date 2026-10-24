/** learnlog_formats: which exports the transformer converts, and what each one records, stage by stage. */
import { VENDORED_FROM } from "../package.js";
import { LEARNLOG_DRAFT, STAGES } from "../stages.js";
import { engine, formatStages } from "../transformer.js";
import { PREPRINT_DATASETS } from "./preprint.js";

const UNIT: Record<string, string> = { dialogue: "transcript turns", summary: "participant summaries", assistance_events: "explicit lifecycle assertions", annotated_dialogue: "Sandpiper utterances" };

export function learnlogFormats(): Record<string, unknown> {
  return {
    learnlog: LEARNLOG_DRAFT,
    stages: STAGES,
    formats: engine.ADAPTER_PROFILES.map((p) => {
      const contract = engine.getSemanticContract(p.id);
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        observation_unit: UNIT[p.mode],
        status: p.status,
        what_one_record_is: contract.definition,
        coverage: contract.coverage,
        help_stages: formatStages(p),
        ...(p.mode === "assistance_events" ? { also_recorded: "learner_response_observed: a later learner action the source asserts. It is kept apart from the draft's accepted stage." } : {}),
        limitations: p.source.limitations,
        sample: { bundled: true, file: `data/samples/${p.sampleName}`, summary: p.source.summary, license: p.source.license, citation: p.source.citation, source: p.source.url },
        input: "CSV, a JSON array or JSON Lines; 1 to 5,000 rows; up to 2 MB (the transformer's limits)",
      };
    }),
    preprint_datasets: PREPRINT_DATASETS,
    transformer: { engine_version: engine.ENGINE_VERSION, vendored_from: `${VENDORED_FROM} demo/transformer/dist/engine.mjs`, license: "MIT" },
    does_not_show: [
      "Whether a product's own exports match these formats. The adapters cover published research releases, an explicit lifecycle contract and Sandpiper's documented utterance export, not vendor integrations.",
      "Anything about your data. This lists formats only; run learnlog_transform or assistance_inventory on a file to see what it records.",
    ],
  };
}
