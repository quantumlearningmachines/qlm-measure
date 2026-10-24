# Learnlog MCP

Ask your AI assistant what learning records actually show about help, and get an answer you can check.

Learnlog MCP is a server for the Model Context Protocol (MCP), the standard way assistants like Claude call outside tools. It reads learning records in [Learnlog](https://datatracker.ietf.org/doc/draft-srivastava-learnlog/), a draft format for recording assistance, and answers questions about them. It also searches QLM's public misconception dataset and LabPath's learning graph. Every answer says what it can't show.

Learnlog keeps six kinds of help apart, from the Internet-Draft draft-srivastava-learnlog-03, Section 2.2:

| Stage | What it records |
| --- | --- |
| requested | someone asked for help |
| offered | a system or person started help on its own, like steps after a wrong answer |
| generated | a system produced help content |
| transmitted | help was sent somewhere |
| displayed | help was shown on a screen |
| accepted | the learner took the action the product calls accepting help |

Each stage is its own observation. A request doesn't mean help was shown, and a display doesn't mean it was read. A stage that wasn't captured is "not recorded", never "none".

## Install

You need Node.js 22.12 or later.

```
npx -y @qlm/learnlog-mcp
```

### Claude Desktop

Add this to `claude_desktop_config.json` (Settings, Developer, Edit Config), then restart Claude Desktop:

```json
{
  "mcpServers": {
    "learnlog": {
      "command": "npx",
      "args": ["-y", "@qlm/learnlog-mcp"]
    }
  }
}
```

Any MCP client that can start a command over stdio works the same way.

## Tools

All eight are read-only. Paths are full paths on your computer (or start with `~/`).

**`learnlog_formats`** lists the exports the transformer converts and what each one records at each stage.
> "Which exports can Learnlog MCP convert, and what does each one record about help?"

**`learnlog_transform`** turns an export into Learnlog records, keeping source and capture details. Use your own file, or `use_sample: true` for a bundled public sample.
> "Turn the TutorMoments sample into Learnlog and tell me what it keeps and what it leaves unknown."

**`learnlog_validate`** replays a Learnlog file's hash chains, checks its profile bindings, and lists the unknowns each record keeps.
> "Is ~/exports/session.learnlog.json a valid Learnlog file? What doesn't it record?"

**`assistance_inventory`** says which stages a dataset records, with counts by source and what can't be concluded.
> "What does this tutoring dataset actually record about help?"

It can also recompute the inventory and episode counts in the Learnlog preprint, *Preserving assistance meaning in cross-source learning analytics*, from your own copies of its three released datasets. When your files are the exact releases the preprint used, it checks every number against the published ones. With no input, it returns the published figures and says they weren't recomputed.

| Argument | Dataset | Where to get it |
| --- | --- | --- |
| `zenodo_zip` | JetBrains Academy next-step hint study, Zenodo 17551130 v1 | [zenodo.org/records/17551130](https://zenodo.org/records/17551130) |
| `idetrace_json` | TutorTrace / IDETrace deployment 8 (needs `allow_idetrace_research: true`) | [the pinned repository commit](https://github.com/divadbaroon/TutorTrace_dataset_and_benchmark/tree/bc7990370da18a611a122255ebc3e475bd8a3fc6) |
| `assistments_csv` | ASSISTments 2012-13 School Data with Affect | [ASSISTments datasets](https://sites.google.com/site/assistmentsdata/datasets/2012-13-school-data-with-affect) |

These datasets aren't bundled. Their learner records stay with their owners, and only counts come back. The ASSISTments file is about 3 GB. Reading it took about 70 seconds in testing, so a client with a short tool timeout may give up first.

**`verify_evidence`** replays a local evidence record or product hash chain with qlm-measure's own verifier and returns pass, or each named check that failed.
> "Can I trust this evidence record? ~/Downloads/record.json"

**`verify_credential`** checks a QLM credential with QLM's verify service. Give its ID (`urn:uuid:...`) or a link that contains one.
> "Is this credential real and current? urn:uuid:<the ID on the badge>"

It returns whether the credential verified, each check with its result, the issuer, the achievement, the date and the AI-help summary by stage. The service's report has no personal data, and the tool shows only the fields it knows.

**`qlm_misconceptions`** searches QLM's public misconception dataset by words, domain, grade band or id. Each result gives the student's belief, the scientific reality, a counterexample, a teacher intervention, the research source, severity, grade bands and the LabPath activities (modes) that address it.
> "Which misconception might explain students passing force problems only with hints, and what should the teacher try?"

Evaluation-tier records never include their trigger patterns or diagnostic question; they're kept back for benchmark integrity. Held-out records aren't in the dataset at all.

**`qlm_learning_graph`** says what comes before or after a LabPath activity, from a mode id or a standard code. It returns each link's kind (prerequisite, labpath-sequence, reinforcement, transfer, extension), the teacher-facing reason, its first 8 concepts, the misconception ids it carries, the full standards for the activity you asked about, and the standard codes of each linked activity. It shows 10 links per direction unless you ask for more.
> "What should students do before the forces activity, and which standards does it cover?"

The graph is LabPath's designed sequence, not evidence that a student needs a step. The standards are LabPath's own mapping to NGSS-style codes.

Both read [QLM's LabPath dataset export](https://play.quantumlearningmachines.com/api/labpath/dataset-export?dataset=misconceptions), CC BY 4.0, once per session. The archived v1.0 is [QLM LabPath Dataset v1.0 on Zenodo](https://doi.org/10.5281/zenodo.21800324).

## What it never does

- It never writes, changes or uploads anything. It doesn't change records, scores or credentials.
- Five tools read local files only and make no network calls.
- `verify_credential` makes one request, to `https://app.qlmdev.com/v1/verify`, sending only the credential ID. It follows no redirects.
- `qlm_misconceptions` and `qlm_learning_graph` make GET requests to `https://play.quantumlearningmachines.com/api/labpath/dataset-export` only, one per dataset per session, and send nothing about you or your files. They follow no redirects.
- It never shows sealed content, such as answer keys or sealed case variants.
- It never turns "not recorded" into "none" or zero.
- It doesn't estimate learning or say whether help worked.

## Where the code comes from

The transformer engine and the qlm-measure 0.9.0 verifier are copied unchanged from [qlm-measure](https://github.com/quantumlearningmachines/qlm-measure). `vendor/PROVENANCE.json` lists every copied file with its source path, commit and SHA-256. The preprint's counting rules are ported from its published Python scripts, and the tests run both on the same files and require identical output.

## License

Apache-2.0. See `LICENSE` and `NOTICE`. The vendored transformer files keep their MIT license (`vendor/transformer/LICENSE.txt`). The TutorMoments and OATutor sample excerpts are CC BY 4.0; their attribution and limits are in `data/THIRD_PARTY_DATA.md`. The LabPath misconception, learning-graph and standards data are CC BY 4.0 from Quantum Learning Machines; they're read from QLM's service, not bundled. Cite them as: QLM LabPath Dataset v1.0, Quantum Learning Machines, 2026, https://doi.org/10.5281/zenodo.21800324.

Made by Kumar Srivastava at [Quantum Learning Machines](https://quantumlearningmachines.com).
