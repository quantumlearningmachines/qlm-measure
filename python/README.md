# @qlm/measure

Open measurement SDK for education AI — evidence events, record verification, and dataset clients.

**v0.1.0 · Apache-2.0 · [Documentation](https://play.quantumlearningmachines.com/developer) · [Manifesto](https://play.quantumlearningmachines.com/resources/open-measurement-layer)**

## Limitations (read first)

- This SDK is the **public interface layer**, not the measurement engine. The estimation service (Bayesian posteriors, IRT ability estimation, calibration) is QLM's hosted engine.
- The verifier checks **bookkeeping integrity**, not estimation correctness. It can tell you if a record was tampered with. It cannot tell you if the posteriors are accurate. That distinction is the design.
- Evidence event schemas are **v0.1** and may change in minor versions. Pin your dependency.
- The ontology client requires the QLM API to be reachable. No offline mode.
- Classifier runners require model weights downloaded separately from Hugging Face.

## What it is

1. **Typed evidence-event vocabulary** (`ObservationEvent`) — a schema any tool can emit to describe a student interaction, with scaffold level, depth, epistemic mode.
2. **Buffered telemetry emitter** (`MeasurementEmitter`) — sends events to the measurement service with sendBeacon fallback.
3. **Evidence record format + replay verifier** (`verifyRecord`, `replayToVersion`) — audits a record's hash-chain and posterior-chain integrity without containing any estimation mathematics.
4. **Dataset clients** (`OntologyClient`) — typed wrappers over the public misconception ontology, learning graph, and standards alignment APIs.
5. **Engine client** (`EngineClient`) — commercial boundary for the hosted measurement service.

## What it is NOT

- Not the estimation engine (that runs server-side at QLM)
- Not a standalone learning analytics system
- Not a replacement for the measurement service
- Not a classifier or scorer (those are separate open-weights releases)

## Install

```bash
npm install @qlm/measure
```

## Quickstart

### 1. Query the misconception ontology (no auth)

```typescript
import { OntologyClient } from "@qlm/measure/clients";

const client = new OntologyClient();
const misconceptions = await client.getMisconceptions("math");
console.log(`${misconceptions.length} math misconceptions`);
```

### 2. Emit measurement events

```typescript
import { MeasurementEmitter } from "@qlm/measure/emitter";

const emitter = new MeasurementEmitter({
  baseUrl: "https://play.quantumlearningmachines.com",
  product: "my-tool",
});

emitter.emit({
  eventType: "answer_submitted",
  eventCategory: "learning",
  domain: "math",
  topic: "fractions",
  payload: { questionId: "q1", correct: true },
});
```

### 3. Verify an evidence record (tamper detection)

```typescript
import { verifyRecord } from "@qlm/measure/verifier";

const result = verifyRecord(record);
if (!result.valid) {
  for (const v of result.violations) {
    console.log(`[${v.category}] v${v.version}: ${v.message}`);
  }
}
```

## Schema Reference

### ObservationEvent (evidence input)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| studentId | string | yes | Pseudonymous ID (no PII) |
| sessionId | string | yes | Session identifier |
| source | string | yes | Source system |
| timestamp | string | yes | ISO 8601 |
| correct | boolean | yes | Was the response correct? |
| responseTimeMs | number | yes | Response time in ms |
| domain | string | yes | Subject domain |
| scaffoldType | ScaffoldType | no | What preceded this response |
| misconceptionId | string | no | Detected misconception ID |
| classifierConfidence | number | no | Classifier confidence (0-1) |
| skillId | string | no | Skill being assessed |
| score | number | no | Response score (0-1) |
| difficulty | number | no | Item difficulty (0-1) |
| epistemicMode | EpistemicMode | no | How student arrived at answer |
| ext | Record | no | Extension namespace |

### Enums

**ScaffoldType:** `none`, `socratic`, `probing`, `metacognitive`, `scaffolding`, `explain`, `hint`, `demonstrate`

**EpistemicMode:** `experience`, `inference`, `analogy`, `testimony`

**DepthLevel:** `surface`, `conceptual`, `transfer`, `integration`

**TriageResult:** `correct`, `slip`, `misconception`, `disengagement`, `ambiguous`

## Verifier

The verifier checks:
- Schema validity (required fields, correct types)
- Strictly monotonic version numbers
- Timestamp monotonicity (configurable tolerance)
- Hash-chain integrity (prevHash linkage, entryHash recompute)
- Posterior chain consistency (each prior = previous updated)
- Compaction-boundary integrity
- Enum validity

What it deliberately **cannot** check:
- Whether posteriors are correctly computed (that requires the engine)
- Whether evidential weights are appropriate (those are calibrated server-side)
- Whether triage classifications are accurate (those use rules not in this package)

This is the design: **verify instead of trust**.

## Privacy

- `studentId` MUST be a pseudonymous identifier. Never include names, emails, or other PII.
- Events are buffered locally and sent via sendBeacon/fetch. No cookies are set.
- The SDK does not store any data persistently.

## Versioning

- Semver from 0.1.0.
- Schema changes in minor versions (0.2, 0.3).
- Breaking changes in major versions (1.0).
- Pin your dependency version.

## Links

- [Developer portal](https://play.quantumlearningmachines.com/developer)
- [Open Measurement Manifesto](https://play.quantumlearningmachines.com/resources/open-measurement-layer)
- [Misconception ontology](https://play.quantumlearningmachines.com/developer)
- [Model cards on Hugging Face](https://huggingface.co/QuantumLearningMachines)

## License

Apache-2.0. See [LICENSE](./LICENSE).
