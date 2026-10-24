# Learnlog MCP: LinkedIn demo script

A short screen recording in three scenes. An assistant is asked what a tutoring dataset actually records about help. Then it compares the preprint's datasets. Then it looks up a misconception and what comes before it in LabPath.

No video was recorded for this script. The tool outputs below are real: they come from one run of the built server, version 0.2.0 (`node scripts/demo-run.mjs`, which starts `dist/bin.js` over stdio with the MCP SDK client, exactly as Claude Desktop does), on Kumar's Mac on October 24, 2026 (01:17 UTC). Scenes 1 and 2 ran locally. Scene 3 read QLM's public LabPath datasets from play.quantumlearningmachines.com, one request per dataset.

If you run it again, some values change in scenes 1 and 2: record IDs, salts, learner pseudonyms, the hashes that depend on them, and timestamps. Every count stays the same. Scene 3 shows whatever the LabPath datasets hold that day.

The assistant's own words aren't recorded here, because they vary from run to run. Under each prompt is what a correct answer says, taken from the outputs.

## Before recording

1. Add the server to Claude Desktop (`claude_desktop_config.json`), then restart it:

```json
{
  "mcpServers": {
    "learnlog": { "command": "npx", "args": ["-y", "@quantumkumar/learnlog-mcp"] }
  }
}
```

2. Until the package is on npm, point Claude Desktop at the local build instead: `"command": "node", "args": ["<full path to>/qlm-measure/mcp/dist/bin.js"]`.
3. In a new chat, open the tools menu and check that the eight Learnlog tools are listed.

## Scene 1: what does this tutoring dataset record about help?

**Prompt, exactly:**

> What does this tutoring dataset actually record about help? Use the TutorMoments sample that comes with Learnlog MCP. Convert it to Learnlog first, then give me the inventory and tell me what it can't show.

**Tool calls to expect:**

1. `learnlog_transform` with `{"format":"tutormoments","use_sample":true}`
2. `assistance_inventory` with `{"format":"tutormoments","use_sample":true}`

**What a correct answer says:**

- It's 2 real tutoring sessions, 310 transcript turns (168 tutor, 142 student), from Ai2's TutorMoments-Preview, CC BY 4.0. The file matched the pinned public excerpt byte for byte.
- All six help stages are **not recorded**: requested, offered, generated, transmitted, displayed and accepted. The data keeps who spoke and what they said. A tutor turn isn't a help event.
- So this dataset can't give a help count or a help rate. "Not recorded" isn't "no help happened".
- It also can't show help from outside the session, or whether any help worked.

## Scene 2: what do the preprint's three datasets record?

**Prompt, exactly:**

> Now compare that with the three datasets in the Learnlog preprint. What does each one record about help?

**Tool call to expect:** `assistance_inventory` with `{}`. With no files given, it returns the preprint's published figures and says they weren't recomputed.

**What a correct answer says:**

- The Zenodo hint study records requests and displays: 1,050 requests, 738 followed by a recorded display, 312 not (266 with an error).
- IDETrace records 59 chat queries. It has no display event; the episode rule counts a response as a display.
- Pooling the two gives 1,109 requests, 39.1% more than the 797 followed by a display.
- ASSISTments records 814,067 problems with help requested, and 110,513 problems where the system likely gave steps after a wrong answer. Those are candidates for the offered stage, not confirmed offers. Display isn't logged as its own event.
- None of this is a help rate or a learning effect.

Optional on-screen line: "Every number here is recomputed and matched exactly when you give the tool your own copies of the three datasets."

## Scene 3: which misconception might be behind passing only with hints?

**Prompt, exactly:**

> Which misconception might explain students passing force problems only with hints, and what should the teacher try?

**Tool calls to expect:**

1. `qlm_misconceptions` with `{"search":"force","domain":"physics","limit":5}`
2. `qlm_learning_graph` with `{"mode_id":"forcefield","direction":"before","kinds":["prerequisite","labpath-sequence","reinforcement"]}`, using the first misconception's first LabPath mode.

**What a correct answer says:**

- The dataset doesn't link hint use to any misconception. These are candidates to check, not a diagnosis of these students.
- 19 physics misconceptions match "force". The first is "Force means velocity" (critical, grades 6-8, 9-12): students think a constant force on an object means it moves at a constant speed. In fact, a constant net force produces constant acceleration (F = ma). The object continuously speeds up, not moves at a fixed speed.
- What to try: Use a fan cart on an air track. Students predict speed at intervals and plot velocity vs. time to see the linear increase under constant force. Source: Halloun & Hestenes 1985, Common Sense Concepts and Force; Hestenes et al 1992, Force Concept Inventory.
- It's an evaluation-tier record, so its diagnostic question and trigger patterns are withheld for benchmark integrity.
- Before LabPath's forcefield activity, the graph has 41 links of those three kinds; the tool shows the first 25. None is a prerequisite link (those would be listed first), and all 25 shown are labpath-sequence links. Only one gives a specific reason (simpleforces: "Simple forces provide the intuition that Newton's laws formalize."). The other 24 share one generic reason, and none of the 25 carries a misconception id.
- forcefield is aligned to 14 standards, from K-PS2-1 to HS-PS3-2.
- The graph is LabPath's design, not evidence that these students need a step. Every edge's priority is "high", so priority doesn't rank them.

Cite: QLM LabPath Dataset v1.0, Quantum Learning Machines, 2026, CC BY 4.0, https://doi.org/10.5281/zenodo.21800324.

## Real tool outputs

### `learnlog_transform` {"format":"tutormoments","use_sample":true}

```json
{
  "format": "tutormoments",
  "source": {
    "file": "tutormoments-real-transcripts.jsonl",
    "sha256": "7df51fda0fff9c454ba14a33a0d2964d5e94b2556eff1d3897ec4f41373c8a66",
    "kind": "verified_public_sample",
    "verified_public_sample": true,
    "provenance": {
      "citation": "TutorMoments-Preview, Albert Zhang and colleagues, Allen Institute for AI and collaborators (2026).",
      "license": "CC-BY-4.0",
      "url": "https://huggingface.co/datasets/allenai/tutormoments-preview",
      "revision": "3bb0c104d65e29facffca7ba864ef10fa22d0e78"
    }
  },
  "summary": {
    "input_rows": 2,
    "records": 2,
    "entries": 310,
    "unit": "dialogue_turns",
    "event_types": {
      "qlm_import:dialogue_turn_observed": 310
    }
  },
  "help_stages": {
    "requested": "not recorded: the adapter keeps who spoke and what they said; it doesn't classify any turn as help",
    "offered": "not recorded: the adapter keeps who spoke and what they said; it doesn't classify any turn as help",
    "generated": "not recorded: the adapter keeps who spoke and what they said; it doesn't classify any turn as help",
    "transmitted": "not recorded: the adapter keeps who spoke and what they said; it doesn't classify any turn as help",
    "displayed": "not recorded: the adapter keeps who spoke and what they said; it doesn't classify any turn as help",
    "accepted": "not recorded: the adapter keeps who spoke and what they said; it doesn't classify any turn as help"
  },
  "unknowns": [
    "Help coverage: source dialogue only no validated help classification",
    "Coverage of the mapping: partial (Selected released transcript text and offsets; no original recording or outside-help capture.)",
    "No measurement profile: these records don't define a measure",
    "No denominator: counts from these records are not rates",
    "Source event time not recorded on 310 of 310 entries",
    "Phase not recorded (unknown) on 310 of 310 entries",
    "Help policy (permission) not recorded (unknown) on 310 of 310 entries",
    "Observed help use not recorded (unknown) on 310 of 310 entries",
    "Capture coverage not recorded (unknown) on 310 of 310 entries",
    "Capture boundary not recorded on 310 of 310 entries",
    "Product version not recorded on 310 of 310 entries",
    "Model version not recorded on 310 of 310 entries"
  ],
  "warnings": [],
  "heads": {
    "fe2c4047-4182-4a3d-9cf0-8241cc1c34ab": {
      "seq": 149,
      "entry_hash": "96f8d024c9047aa9ee8dbdcb08c5e34097a7ead3cef5df23da6b28a906678c8e"
    },
    "2867dce9-6a1a-42fa-a119-63b971e586cb": {
      "seq": 161,
      "entry_hash": "d55b40332c575142d9aca45afda9671956fe81fbb5586ff41d762e4a3c83b91e"
    }
  },
  "pseudonyms": "Learner IDs are replaced with HMAC pseudonyms keyed by a random secret made when this server started. They don't match across restarts or other tools.",
  "preview": {
    "header": {
      "record_id": "fe2c4047-4182-4a3d-9cf0-8241cc1c34ab",
      "subject": "qlm:89412b78d79bd0b34787f17a00ea67d158cccb298dd409e9f5df31024b31cec5",
      "hash_alg": "sha-256",
      "created": "2026-10-24T01:17:05.129Z",
      "producer": {
        "name": "QLM-transformer research adapters",
        "version": "0.4.0-research-adapters"
      },
      "source_platform": "tutormoments",
      "source_sha256": "7df51fda0fff9c454ba14a33a0d2964d5e94b2556eff1d3897ec4f41373c8a66",
      "mapping_sha256": "204390794ea5bee215be3bad0b0908fd634449b1b2647a0d6383fae2c399c303",
      "import_mode": "dialogue",
      "source_kind": "verified_public_sample",
      "subject_scope": "dataset + tenant + key",
      "record_scope": "transcript_session",
      "semantic_profile_binding": {
        "id": "qlm:assistance-context:0.1.0",
        "version": "0.1.0",
        "sha256": "e019cdbb6692ab43df1672b3803356c8adfac26a0bb7b3d62e407315dbd283e2",
        "hash_basis": "RFC8785"
      },
      "event_schema_bindings": [
        {
          "id": "https://transformer.quantumlearningmachines.com/schemas/research-import-v2.json",
          "sha256": "26a37a0ef7476fa63c7cb7f85a9e4a4fcb4e2c85ccff6b14b06789d8330dcf31",
          "hash_basis": "RFC8785"
        }
      ],
      "semantic_mapping": {
        "contract_version": "0.1.0",
        "review": {
          "status": "implementation_checked_not_independently_reviewed",
          "scope": "Executable mapping checks do not establish semantic validity or educational effectiveness."
        },
        "original_event_time": "Preserve source timestamp or relative offsets separately. Import entry time is the importer observation time. Missing absolute source timestamps remain null.",
        "source_unit": "transcript_session",
        "target_unit": "dialogue_turn",
        "measurement_profile": null,
        "denominator": null,
        "coverage": {
          "status": "partial",
          "boundary": "Selected released transcript text and offsets; no original recording or outside-help capture."
        },
        "coding_method": "source_speaker_and_text_only_no_help_classification",
        "definition": "One released transcript turn is imported as one observed dialogue turn. Source Tutor role is not a help-delivery label.",
        "transformations": [
          "HMAC-scope known learner identifier",
          "Preserve source turn order, speaker, text and relative offsets",
          "Record importer actor and import time separately from historical speaker and unknown source clock"
        ],
        "information_loss": [
          "Known original identity columns are excluded from event data",
          "Model-generated enrichments are not imported as observations",
          "Audio fidelity and external assistance cannot be checked from released text"
        ],
        "pooling_limit": "Dialogue-turn counts cannot be combined with participant summaries or assistance-event counts. Published companion interval coding is a separate measurement profile."
      },
      "assistance_coverage": "source_dialogue_only_no_validated_help_classification",
      "event_order_basis": "source_turn_array_order",
      "source_provenance": {
        "kind": "published_research_data",
        "url": "https://huggingface.co/datasets/allenai/tutormoments-preview",
        "downloadUrl": "https://huggingface.co/datasets/allenai/tutormoments-preview/resolve/3bb0c104d65e29facffca7ba864ef10fa22d0e78/transcripts.jsonl",
        "revision": "3bb0c104d65e29facffca7ba864ef10fa22d0e78",
        "license": "CC-BY-4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "citation": "TutorMoments-Preview, Albert Zhang and colleagues, Allen Institute for AI and collaborators (2026).",
        "selectionNote": "Exact complete source JSONL lines 366 and 435, retained in source order including original newline bytes. No text, metadata, IDs, dates or events added or altered.",
        "limitations": [
          "These are transcripts of real human tutoring sessions, not simulated student conversations and not native vendor clickstream exports.",
          "Released text was transcribed by SUT (Gemini 2.5 Pro); preserve that provenance and do not call it verified verbatim audio or a perfect transcription.",
          "Publisher deidentifies free text with fabricated surrogates or tags; apparent names in the selected text are not real per publisher documentation. UUIDv5 identifiers are publisher surrogates.",
          "Absolute session dates are removed. start_seconds/end_seconds are relative source offsets; do not synthesize wall-clock event timestamps.",
          "The source anonymizes the provider as tutoring_provider_a. Do not relabel it Khan Academy, MATHia, IXL, DreamBox or ALEKS.",
          "Source enrichments are model-generated screen/pause narratives; do not convert them into observed assistance events.",
          "Ground-truth annotations are LLM-assisted and action-taxonomy labels model-generated; this sample does not include either as observed learner events.",
          "A question mark or Tutor role alone does not establish a hint request or help effectiveness. Preserve role/text conservatively; explicitly mark any semantic classification as derived.",
          "No original recording is released (has_video false). Raw transcripts and their offsets cannot independently establish fidelity to underlying audio.",
          "Data involves minors. No reidentification. Report residual PII and do not redistribute affected records per publisher guidance."
        ],
        "sampleSha256": "7df51fda0fff9c454ba14a33a0d2964d5e94b2556eff1d3897ec4f41373c8a66",
        "sourceSha256": "34b5d4483302593043f3d9be3bf37f1cde6cba5b031fd2d20d75a15d5498f276",
        "sourceRows": [
          366,
          435
        ],
        "summary": "2 transcript sessions · 310 source turns"
      }
    },
    "entries": [
      {
        "seq": 1,
        "time": "2026-10-24T01:17:05.129Z",
        "event_hash": "ab1749571662642666a01ddfb057a129d86ca57efbfe28a6739fe4da9fc0a937",
        "prev_hash": "3fbd7afb34d9e01c9b1f1f94a1085ab2510ffbd9e6b9402d3c4925405de75903",
        "entry_hash": "4ac5a2544b7111817726c42a982bb7f0437c9958644dfb0ba23c2bf5355fb4d9",
        "event": {
          "name": "qlm_import:dialogue_turn_observed",
          "salt": "6Jl1q-y54tMlmETFirNFEA",
          "data": {
            "provenance": {
              "platform": "tutormoments",
              "source_kind": "verified_public_sample",
              "source_sha256": "7df51fda0fff9c454ba14a33a0d2964d5e94b2556eff1d3897ec4f41373c8a66",
              "source_row": 1,
              "source_record_sha256": "61cbdc2ee22e5576471d7e6d1e9884b42a3cc937a27649b2fdc726c7871d8612",
              "imported_at": "2026-10-24T01:17:05.129Z",
              "mapping_sha256": "204390794ea5bee215be3bad0b0908fd634449b1b2647a0d6383fae2c399c303",
              "source_file_sha256": "34b5d4483302593043f3d9be3bf37f1cde6cba5b031fd2d20d75a15d5498f276",
              "source_file_row": 366,
              "source_field_path": "turns[0]"
            },
            "time_basis": "import_time",
            "source_time_basis": "relative_offsets_seconds",
            "dialogue": {
              "role": "Tutor",
              "text": "Hi Kayla.",
              "turn_number": 1,
              "start_seconds": 614,
              "end_seconds": 616
            },
            "raw_source_fields": {
              "turn": {
                "turn_number": 1,
                "start_seconds": 614,
                "end_seconds": 616,
                "role": "Tutor",
                "text": "Hi Kayla."
              },
              "source": "tutoring_provider_a",
              "batch": "2025-10-16",
              "has_video": false,
              "session": {
                "transcription_by": "SUT (Gemini 2.5 Pro)",
                "primary_language": "",
                "prior_session_count": 8
              }
            },
            "reported_metrics": {},
            "missing_metrics": [],
            "assistance": "tutor_utterance_recorded",
            "original_source_timestamp": null,
            "assistance_context": {
              "phase": "unknown",
              "permission": "unknown",
              "observed_use": "unknown",
              "capture": "unknown",
              "capture_boundary": null,
              "product_version": null,
              "model_version": null
            }
          },
          "activity": {
            "id": "d21c3b8f-6333-5b8f-b632-7f6aed0ef517"
          },
          "actor": {
            "role": "system",
            "kind": "software",
            "id": "QLM-transformer"
          }
        }
      }
    ]
  },
  "document_note": "Set include_document: true to get the whole Learnlog document. This tool never writes it to disk.",
  "does_not_show": [
    "Help that happened outside what the source recorded. A Learnlog record keeps what the export asserts, and nothing else.",
    "Whether the source's assertions are true. The transformer checks structure and keeps provenance; it can't check a recording against the world.",
    "Learning or the effect of help. These are records, not estimates."
  ]
}
```

### `assistance_inventory` {"format":"tutormoments","use_sample":true}

```json
{
  "kind": "learnlog_records",
  "learnlog": "draft-srivastava-learnlog-03 (IETF Internet-Draft, work in progress)",
  "sources": [
    {
      "source": "tutormoments",
      "import_mode": "dialogue",
      "source_kind": "verified_public_sample",
      "records": 2,
      "entries": 310,
      "what_is_recorded": {
        "unit": "dialogue turns",
        "sessions": 2,
        "turns": 310,
        "turns_by_speaker": {
          "Tutor": 168,
          "Student": 142
        }
      },
      "stages": {
        "requested": {
          "status": "not recorded",
          "note": "This source keeps who spoke and what they said. The adapter doesn't classify any turn as help, and a Tutor turn isn't a help event."
        },
        "offered": {
          "status": "not recorded",
          "note": "This source keeps who spoke and what they said. The adapter doesn't classify any turn as help, and a Tutor turn isn't a help event."
        },
        "generated": {
          "status": "not recorded",
          "note": "This source keeps who spoke and what they said. The adapter doesn't classify any turn as help, and a Tutor turn isn't a help event."
        },
        "transmitted": {
          "status": "not recorded",
          "note": "This source keeps who spoke and what they said. The adapter doesn't classify any turn as help, and a Tutor turn isn't a help event."
        },
        "displayed": {
          "status": "not recorded",
          "note": "This source keeps who spoke and what they said. The adapter doesn't classify any turn as help, and a Tutor turn isn't a help event."
        },
        "accepted": {
          "status": "not recorded",
          "note": "This source keeps who spoke and what they said. The adapter doesn't classify any turn as help, and a Tutor turn isn't a help event."
        }
      },
      "coverage": {
        "help_coverage": "source_dialogue_only_no_validated_help_classification",
        "mapping_coverage": {
          "status": "partial",
          "boundary": "Selected released transcript text and offsets; no original recording or outside-help capture."
        }
      }
    }
  ],
  "cannot_conclude": [
    "An inventory isn't a help rate: there is no denominator of opportunities, time or learners.",
    "A missing record isn't proof that no help was given. Not recorded is never the same as none.",
    "Each stage is its own observation. A request doesn't show that help was generated, and a display doesn't show that it was read.",
    "Counts from different sources measure different things and can't be pooled into one number."
  ],
  "does_not_show": [
    "Help outside the recorded source: other apps, devices, people or AI tools.",
    "Whether any help worked. These are records of help, not of learning.",
    "Learner identities. Learner IDs are pseudonyms and no rows are listed."
  ]
}
```

### `assistance_inventory` {}

```json
{
  "kind": "published figures, not recomputed",
  "note": "These are the preprint's published aggregate outputs, bundled with this package. Nothing was recomputed in this call. To recompute them, give your own copies of the files (zenodo_zip, idetrace_json with allow_idetrace_research: true, assistments_csv).",
  "learnlog": "draft-srivastava-learnlog-03 (IETF Internet-Draft, work in progress)",
  "inventory_table_2": {
    "zenodo": {
      "input_sha256": "5527127f0a3c939601b17ef207ef8b34df7cad9159c9617f879efbf4e989d499",
      "source_file_count": 1050,
      "native_input_count": 1060271,
      "native_assistance_log_count": 5275,
      "native_log_label_counts": {
        "Code banner shown": 735,
        "Code hint generated": 734,
        "Code hint is accepted": 300,
        "Code hint is cancelled": 18,
        "Code hint requested": 1028,
        "Dislike": 119,
        "Error banner shown": 266,
        "Error hint: An unexpected error occurred, please try again.": 265,
        "Error hint: Please check your internet connection and try again!": 1,
        "Hint banner is closed": 207,
        "Hint button is clicked": 960,
        "Hint retry is clicked": 90,
        "Like": 94,
        "Show code hint is clicked": 453,
        "Text banner shown": 2,
        "Text hint generated": 3
      },
      "assistance_request_observations": 1050,
      "help_request_subtypes": [
        {
          "label": "Hint button is clicked",
          "count": 960
        },
        {
          "label": "Hint retry is clicked",
          "count": 90
        }
      ]
    },
    "idetrace": {
      "input_sha256": "09972201c16a9f6def7d1e25a9b9e6827994601d720a37696afb0927168befc8",
      "source_file_count": 1,
      "native_input_count": 30283,
      "native_event_label_counts": {
        "CHAT_DELETE": 92,
        "CHAT_PASTE": 10,
        "CHAT_QUERY": 59,
        "CHAT_RESPONSE": 59,
        "CHAT_SELECT_INPUT": 1,
        "CHAT_TYPE": 1218,
        "CODE_COPY": 3,
        "CODE_DELETE": 815,
        "CODE_DELETE_SELECTION": 16,
        "CODE_INDENT": 65,
        "CODE_PASTE": 10,
        "CODE_SELECT": 36,
        "CODE_TYPE": 4635,
        "CODE_UNDO": 6,
        "MOUSE_CLICK": 1147,
        "MOUSE_MOVE": 21195,
        "PANEL_RESIZE": 14,
        "SESSION_START": 42,
        "TAB_STATE": 453,
        "TASK_COPY": 36,
        "TASK_SELECT": 29,
        "TERMINAL_COPY": 1,
        "TERMINAL_ERROR": 89,
        "TERMINAL_OUTPUT": 3,
        "TERMINAL_RUN": 136,
        "TERMINAL_SELECT": 4,
        "TEST_CASE_RESULT": 47,
        "TEST_SELECT": 2,
        "WINDOW_RESIZE": 60
      },
      "assistance_request_observations": 59
    },
    "total_request_observations": 1109,
    "actual_request_total": "not established: release selection and capture completeness are unknown",
    "request_rate": "not established: no comparable denominator of exposure or opportunity",
    "request_to_display_rate": "provisional only: links come from episode rules, not the sources",
    "learning_effect": "not estimated: a count of help records isn't an outcome"
  },
  "episodes_table_4": {
    "inputs": {
      "zenodo_sha256": "5527127f0a3c939601b17ef207ef8b34df7cad9159c9617f879efbf4e989d499",
      "idetrace_sha256": "09972201c16a9f6def7d1e25a9b9e6827994601d720a37696afb0927168befc8"
    },
    "zenodo": {
      "requests": 1050,
      "outcomes": {
        "shown_no_further_action_or_rating_only": 309,
        "shown_acted_accepted": 300,
        "shown_acted_revealed_not_accepted": 129,
        "not_shown_error": 266,
        "not_shown_silent": 46
      },
      "shown": 738,
      "not_shown": 312,
      "asked_again_within_300s_of_shown": 524,
      "hint_learner_folders": 22,
      "raw_activity_ids": 151,
      "raw_ids_linked_to_hint_folders": 0,
      "raw_paste_actions": 1826,
      "raw_ids_with_paste": 85
    },
    "idetrace": {
      "records": 35,
      "records_asked": 18,
      "records_never_asked": 17,
      "never_asked_and_passed_all_tests": 13,
      "requests": 59,
      "outcomes": {
        "shown_no_code_edit_within_120s": 11,
        "shown_code_edit_within_120s": 48
      },
      "shown": 59,
      "not_shown": 0,
      "asked_again_within_300s_of_shown": 41,
      "code_pastes": 10,
      "code_pastes_without_in_tool_copy_600s": 1,
      "chat_pastes": 10
    },
    "pooled": {
      "naive_requests": 1109,
      "shown": 797,
      "overstatement_pct": 39.1,
      "pooled_not_shown_pct": 28.1,
      "zenodo_not_shown_pct": 29.7,
      "zenodo_asked_again_pct": 71,
      "idetrace_asked_again_pct": 69.5
    },
    "checks": {
      "zenodo_reports_whose_first_log_row_is_a_click": 1050,
      "zenodo_clicks_per_report": {
        "1": 1050
      },
      "zenodo_reports_with_text_banner": 2,
      "zenodo_shown_rated_only": 82,
      "zenodo_asked_again_where_next_request_is_retry": 0,
      "zenodo_raw_pastes_without_copy_or_cut_in_prior_600s": 291,
      "idetrace_passrate_types": {
        "int": 47
      }
    }
  },
  "assistments_table_4": {
    "input_sha256": "1d06aee9e649c5ba9db49052fe9a86e68d0c3ccb4709a7487289d7721f5464db",
    "main_problem_opportunities": 5819737,
    "scaffolding_logs": 303533,
    "students": 46544,
    "students_who_ever_requested": 32447,
    "episodes": {
      "not requested; no help recorded": 4892597,
      "requested; hints short of the answer": 109140,
      "requested; hints to the answer (bottom-out)": 683138,
      "requested; asked for steps (scaffolding)": 21789,
      "not requested; system gave steps after a wrong first answer": 110513,
      "not requested; scaffolding present, trigger unclear": 2560
    },
    "inferred_top_state_by_request": {
      "not requested": {
        "frustrated": 588417,
        "concentrating": 3434821,
        "bored": 761276,
        "confused": 221156
      },
      "requested": {
        "bored": 139848,
        "concentrating": 573289,
        "frustrated": 94671,
        "confused": 6259
      }
    },
    "checks": {
      "rows": 6123270,
      "rows_with_all_four_affect_values": 6123270,
      "scaffolding_logs_with_hints": 54505,
      "main_problems_with_both_hint_and_first_action_steps": 0,
      "system_steps_problems_with_a_hint_inside_scaffolding": 21126,
      "students_who_ever_requested_including_hints_inside_scaffolding": 32937
    }
  },
  "stages": {
    "zenodo": {
      "requested": {
        "status": "recorded",
        "count": 1050,
        "note": "Get Hint and Retry clicks (Table 2 inventory rule). Each report holds one."
      },
      "offered": "not recorded",
      "generated": {
        "status": "not mapped",
        "native_rows": {
          "Code hint generated": 734,
          "Text hint generated": 3
        },
        "note": "The release logs generation rows, but the preprint's rules don't link them to requests, so no count is given for this stage."
      },
      "transmitted": "not recorded",
      "displayed": {
        "status": "recorded by the episode rule",
        "count": 738,
        "of_requests": 1050,
        "not_displayed": 312,
        "not_displayed_with_error": 266,
        "note": "A banner shown, or the code hint revealed or accepted, after the request. Links between stages come from the rule; the source declares none."
      },
      "accepted": {
        "status": "recorded by the episode rule",
        "count": 300,
        "revealed_only": 129,
        "note": "The product's 'Code hint is accepted' action. Accepting doesn't show use or learning."
      },
      "never_asked": "not in the release: it contains only request episodes, so going without help can't be counted here"
    },
    "idetrace": {
      "requested": {
        "status": "recorded",
        "count": 59,
        "note": "CHAT_QUERY events (Table 2 inventory rule)."
      },
      "offered": "not recorded",
      "generated": {
        "status": "not mapped",
        "note": "The release logs CHAT_RESPONSE events; the episode rule reads a response as a display, not as its own generated stage."
      },
      "transmitted": "not recorded",
      "displayed": {
        "status": "recorded by the episode rule",
        "count": 59,
        "of_requests": 59,
        "note": "No separate display event exists: a response before the next query is counted as a display. A reply that was itself an error would still count."
      },
      "accepted": "not recorded",
      "never_asked": {
        "records": 35,
        "records_never_asked": 17,
        "note": "Learner records, which may not be people: the source's population descriptions conflict."
      }
    },
    "assistments": {
      "requested": {
        "status": "recorded",
        "count": 814067,
        "with_hints": 792278,
        "asked_for_steps": 21789,
        "hints_to_the_answer": 683138,
        "note": "Counted by main problem. The last hint 'will generally contain the problem's answer' (ASSISTments' own description)."
      },
      "offered": {
        "status": "candidates only",
        "count": 110513,
        "note": "Steps the system likely gave after a wrong first answer, by rule. The release logs no initiation event and keeps only the first action, so these aren't established offers."
      },
      "generated": "not recorded",
      "transmitted": "not recorded",
      "displayed": "not recorded as its own event (asking for a hint shows it, but display isn't logged)",
      "accepted": "not recorded",
      "never_asked": {
        "students": 46544,
        "never_asked_on_main_problems": 14097,
        "never_asked_anywhere_including_hints_inside_steps": 13607
      },
      "inferred": "The four affect values are detector inferences on every row, not observations. Whether hint use was among the detectors' inputs isn't known."
    }
  },
  "datasets": [
    {
      "id": "zenodo.17551130",
      "argument": "zenodo_zip",
      "name": "JetBrains Academy next-step hint study (Zenodo 17551130 v1)",
      "records": "Hint requests, errors and displays inside 1,050 HTML scenario reports, plus a raw IDE activity file that isn't linked to them",
      "license": "CC BY 4.0",
      "bundled": false,
      "why_not_bundled": "QLM's releases carry only aggregate counts from this dataset, never its learner records (THIRD_PARTY_DATA.md).",
      "get_it": "https://zenodo.org/records/17551130 (ai_hints_interaction.zip)",
      "pinned_sha256": "5527127f0a3c939601b17ef207ef8b34df7cad9159c9617f879efbf4e989d499"
    },
    {
      "id": "tutortrace.deployment8",
      "argument": "idetrace_json",
      "name": "TutorTrace / IDETrace, deployment 8",
      "records": "Chat queries and responses, code edits and test results in an instrumented programming environment",
      "license": "CC BY 4.0, as declared in its pinned Croissant metadata (GitHub reports no repository license)",
      "bundled": false,
      "why_not_bundled": "No permission to redistribute the raw payload is inferred. Reading it here needs allow_idetrace_research: true, the same opt-in the preprint's pipeline asks for.",
      "get_it": "https://github.com/divadbaroon/TutorTrace_dataset_and_benchmark/tree/bc7990370da18a611a122255ebc3e475bd8a3fc6 (dataset/raw_telemetry/deployment_8.json)",
      "pinned_sha256": "09972201c16a9f6def7d1e25a9b9e6827994601d720a37696afb0927168befc8"
    },
    {
      "id": "assistments.2012-13",
      "argument": "assistments_csv",
      "name": "ASSISTments 2012-13 School Data with Affect",
      "records": "One row per problem: hints asked, whether the last hint was reached, the first action, scaffolding, and four affect detector confidences",
      "license": "ASSISTments terms of use",
      "bundled": false,
      "why_not_bundled": "The data were provided by the ASSISTments TestBed (WPI) and are not redistributed. Get them from ASSISTments under its terms of use.",
      "get_it": "https://sites.google.com/site/assistmentsdata/datasets/2012-13-school-data-with-affect",
      "pinned_sha256": "1d06aee9e649c5ba9db49052fe9a86e68d0c3ccb4709a7487289d7721f5464db"
    }
  ],
  "rules": {
    "inventory": "aggregate.py native filters: Zenodo Log rows 'Hint button is clicked' or 'Hint retry is clicked'; IDETrace CHAT_QUERY events. This tool recomputes the counts; it doesn't rerun the capture-schema validation and xAPI/Caliper round trips the Python pipeline also performs.",
    "episodes": "research/learnlog-episodes/cross_source.py and assistments_episodes.py at preprint v0.6 (paste rule by timestamp), ported to TypeScript and tested against the Python on the same files.",
    "source": "qlm-measure@2441968"
  },
  "cannot_conclude": [
    "1,109 is an inventory of selected released request records. It isn't a request rate, a dose of help or a learning effect.",
    "There is no shared denominator of opportunities, time or learners, so rates can't be compared across the releases.",
    "Links between stages come from the scripts' rules (Supplement S1); the sources declare none. Display shares are provisional.",
    "A missing record isn't proof that no help was given. Not recorded is never the same as none.",
    "Pooling the two programming releases hides that IDETrace has no separate display record.",
    "ASSISTments is counted by problem and is set beside the other two, never pooled with them.",
    "The mappings were written and audited by software agents; independent human review of them is still pending."
  ],
  "does_not_show": [
    "Any learner row, identity, dialogue or code. Only counts leave the files.",
    "Help outside the instrumented tools: other apps, people or AI.",
    "Whether any help worked."
  ]
}
```

### `qlm_misconceptions` {"search":"force","domain":"physics","limit":5}

```json
{
  "dataset": {
    "source": "https://play.quantumlearningmachines.com/api/labpath/dataset-export?dataset=misconceptions",
    "version": "1.0.0",
    "license": "CC-BY-4.0",
    "citation": "QLM LabPath Dataset v1.0, Quantum Learning Machines, 2026",
    "exported_at": "2026-10-24T01:17:05.513Z",
    "archived": "QLM LabPath Dataset v1.0, Zenodo, https://doi.org/10.5281/zenodo.21800324 (CC BY 4.0; the archived v1.0 holds the 423 released misconceptions)",
    "records_in_export": 437,
    "records_by_tier": {
      "evaluation": 120,
      "public": 317
    }
  },
  "total_matching": 19,
  "returned": 5,
  "misconceptions": [
    {
      "id": "phys-mech-force-velocity",
      "tier": "evaluation",
      "domain": "physics",
      "subdomain": "mechanics",
      "gradeBands": [
        "6-8",
        "9-12"
      ],
      "name": "Force means velocity",
      "studentBelief": "A constant force on an object means it moves at a constant speed.",
      "scientificReality": "A constant net force produces constant acceleration (F = ma). The object continuously speeds up, not moves at a fixed speed.",
      "counterexample": "A ball rolling down a frictionless ramp accelerates the entire way down even though gravity is constant.",
      "teacherIntervention": "Use a fan cart on an air track. Students predict speed at intervals and plot velocity vs. time to see the linear increase under constant force.",
      "researchSource": "Halloun & Hestenes 1985, Common Sense Concepts and Force; Hestenes et al 1992, Force Concept Inventory",
      "severity": "critical",
      "frequency": "very-high",
      "persistence": "deep",
      "modes": [
        "forcefield",
        "buildlab",
        "aerospacelab"
      ],
      "withheld": "triggerPatterns and diagnosticQuestion are withheld for evaluation-tier records, for benchmark integrity."
    },
    {
      "id": "phys-mech-action-reaction-cancel",
      "tier": "evaluation",
      "domain": "physics",
      "subdomain": "mechanics",
      "gradeBands": [
        "9-12"
      ],
      "name": "Action-reaction forces cancel",
      "studentBelief": "Newton's third law action-reaction pairs cancel each other out, so nothing should ever move.",
      "scientificReality": "Action-reaction pairs act on different objects, so they never cancel. Forces cancel only when they act on the same object.",
      "counterexample": "When you push off a wall, you accelerate backward. The wall pushes you (reaction) while you push the wall (action). They act on different bodies.",
      "teacherIntervention": "Use two spring scales connected together and pull from both ends. Identify which force acts on which object using free-body diagrams.",
      "researchSource": "Halloun & Hestenes 1985; Hestenes et al 1992",
      "severity": "critical",
      "frequency": "high",
      "persistence": "deep",
      "modes": [
        "forcefield",
        "buildlab"
      ],
      "withheld": "triggerPatterns and diagnosticQuestion are withheld for evaluation-tier records, for benchmark integrity."
    },
    {
      "id": "phys-mech-impetus-theory",
      "tier": "evaluation",
      "domain": "physics",
      "subdomain": "mechanics",
      "gradeBands": [
        "6-8",
        "9-12"
      ],
      "name": "Impetus theory of motion",
      "studentBelief": "A thrown object carries an internal 'impetus' or force that keeps it moving and gradually runs out.",
      "scientificReality": "Once released, no forward force acts on the object (ignoring air resistance). It continues moving due to inertia (Newton's first law), not an internal force.",
      "counterexample": "A puck sliding on an air hockey table does not slow down appreciably because there is no friction — there is no 'impetus' draining away.",
      "teacherIntervention": "Use a dry-ice puck on a smooth surface. After a single push, students observe the puck moves in a straight line at constant velocity with no 'impetus' force.",
      "researchSource": "Halloun & Hestenes 1985; McCloskey 1983, Intuitive Physics",
      "severity": "critical",
      "frequency": "very-high",
      "persistence": "deep",
      "modes": [
        "forcefield",
        "aerospacelab"
      ],
      "withheld": "triggerPatterns and diagnosticQuestion are withheld for evaluation-tier records, for benchmark integrity."
    },
    {
      "id": "phys-mech-gravity-needs-medium",
      "tier": "public",
      "domain": "physics",
      "subdomain": "mechanics",
      "gradeBands": [
        "6-8",
        "9-12"
      ],
      "name": "Gravity requires a medium",
      "studentBelief": "Gravity needs air or some medium to work; there is no gravity in space.",
      "scientificReality": "Gravity is a fundamental force that acts across a vacuum. The Moon orbits Earth through empty space purely due to gravity.",
      "counterexample": "The International Space Station orbits Earth in near-vacuum; gravity is what keeps it in orbit (astronauts are in free fall, not zero gravity).",
      "teacherIntervention": "Show ISS footage and ask students to identify the forces acting on it. Discuss why astronauts float (free fall) vs. zero gravity.",
      "researchSource": "Halloun & Hestenes 1985; Bar et al 1997, Children's Conceptions of Gravity",
      "severity": "moderate",
      "frequency": "high",
      "persistence": "moderate",
      "modes": [
        "forcefield",
        "orbitlab",
        "stellarlab"
      ],
      "diagnosticQuestion": "If gravity requires air, how does the Moon stay in orbit around Earth through the vacuum of space?",
      "triggerPatterns": [
        "no gravity in space",
        "gravity needs air",
        "gravity only on Earth"
      ]
    },
    {
      "id": "phys-mech-weight-equals-mass",
      "tier": "evaluation",
      "domain": "physics",
      "subdomain": "mechanics",
      "gradeBands": [
        "6-8",
        "9-12"
      ],
      "name": "Weight and mass are the same",
      "studentBelief": "Weight and mass are identical concepts.",
      "scientificReality": "Mass is the quantity of matter (measured in kg), while weight is the gravitational force on that mass (W = mg, measured in N). Mass is constant; weight varies with gravitational field strength.",
      "counterexample": "An astronaut has the same mass on the Moon as on Earth, but weighs about 1/6 as much on the Moon because g_Moon is approximately 1.6 m/s^2.",
      "teacherIntervention": "Have students measure the same object with a balance (mass) and a spring scale (weight). Discuss what would happen on different planets.",
      "researchSource": "Halloun & Hestenes 1985; Galili & Lehavi 2003",
      "severity": "moderate",
      "frequency": "very-high",
      "persistence": "moderate",
      "modes": [
        "forcefield",
        "orbitlab"
      ],
      "withheld": "triggerPatterns and diagnosticQuestion are withheld for evaluation-tier records, for benchmark integrity."
    }
  ],
  "available": {
    "domains": {
      "physics": 70,
      "biology": 70,
      "chemistry": 53,
      "math": 106,
      "cs": 35,
      "earth_science": 26,
      "history": 27,
      "ela": 18,
      "health": 32
    },
    "grade_bands": {
      "6-8": 282,
      "9-12": 289,
      "3-5": 89,
      "K-2": 10,
      "postsecondary": 14
    }
  },
  "does_not_show": [
    "Whether any student holds one of these. They are curated, research-based descriptions of common misconceptions, not observations of a learner.",
    "Held-out records, kept back for benchmark integrity; they aren't in the export at all.",
    "Evaluation-tier trigger patterns and diagnostic questions, withheld for benchmark integrity.",
    "How often a misconception occurs in your setting. Frequency, persistence and severity are the dataset's research-based bands."
  ]
}
```

### `qlm_learning_graph` {"mode_id":"forcefield","direction":"before","kinds":["prerequisite","labpath-sequence","reinforcement"]}

```json
{
  "modes": [
    "forcefield"
  ],
  "before": [
    {
      "from": "simpleforces",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "force",
        "push",
        "pull",
        "friction",
        "Balanced pushes leave an object still; an unbalanced push moves it toward the harder side",
        "Earth's gravity pulls objects toward its center; 'down' means toward the center, not the bottom of the picture",
        "pushes",
        "still",
        "toward",
        "forces",
        "interactions",
        "cause",
        "Cause and effect in motion",
        "moves",
        "effect",
        "direction",
        "Pushes and Pulls",
        "object",
        "Gravity and Air Resistance",
        "balanced",
        "unbalanced",
        "pulls",
        "nothing",
        "Newton's Third Law Force Pairs",
        "out",
        "Electromagnetic Induction",
        "more",
        "A repeating motion can be predicted from a few observed ticks; motion without a pattern cannot",
        "Force, mass, and acceleration",
        "data",
        "reading",
        "graph",
        "motion",
        "moving",
        "has",
        "two",
        "can",
        "use",
        "every",
        "one",
        "Force, motion, and simple machines",
        "confusing",
        "ignoring",
        "system",
        "evidence",
        "first",
        "vocabulary"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "Simple forces provide the intuition that Newton's laws formalize.",
      "student_facing_reason": "You pushed and pulled. Now diagram and calculate those forces."
    },
    {
      "from": "bioforge",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "Enzyme Kinetics",
        "Force, mass, and acceleration",
        "models",
        "analyze",
        "data",
        "always",
        "speed",
        "Pushes and Pulls",
        "determine",
        "effects",
        "need",
        "Gravity and Air Resistance",
        "than",
        "Newton's Third Law Force Pairs",
        "using",
        "reaction",
        "Electromagnetic Induction",
        "explain",
        "predict",
        "regardless"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    },
    {
      "from": "buildlab",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "A material is identified by its properties, and only when the measured properties rule out every other material",
        "Earth's gravity pulls objects toward its center; 'down' means toward the center, not the bottom of the picture",
        "its",
        "reading",
        "not",
        "Pushes and Pulls",
        "out",
        "different",
        "two",
        "Gravity and Air Resistance",
        "only",
        "when",
        "matter",
        "Newton's Third Law Force Pairs",
        "every",
        "other",
        "one",
        "Materials have properties; the test for the job, not the material's reputation, decides which one fits",
        "Force, mass, and acceleration",
        "cause",
        "effect",
        "data",
        "test",
        "objects",
        "for",
        "can",
        "have",
        "more"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    },
    {
      "from": "cellworld",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "Cell structure and function",
        "Force, mass, and acceleration",
        "systems",
        "ignoring",
        "system",
        "Plant Cell Structures",
        "Earth's gravity pulls objects toward its center; 'down' means toward the center, not the bottom of the picture",
        "argument",
        "support",
        "things",
        "not",
        "Pushes and Pulls",
        "different",
        "make",
        "Gravity and Air Resistance",
        "construct",
        "use",
        "energy",
        "knows",
        "can",
        "understands",
        "Electromagnetic Induction",
        "inside",
        "Cell Membrane Transport",
        "out",
        "rather",
        "than",
        "always",
        "move",
        "matter",
        "faster",
        "because",
        "Newton's Third Law Force Pairs",
        "relationship",
        "between",
        "stronger"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    },
    {
      "from": "climateengine",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "Climate feedback mechanisms and modeling",
        "Force, mass, and acceleration",
        "effect",
        "data",
        "systems",
        "cause",
        "always",
        "models",
        "Earth's gravity pulls objects toward its center; 'down' means toward the center, not the bottom of the picture",
        "earth",
        "things",
        "Cause and effect in motion",
        "Pushes and Pulls",
        "change",
        "has",
        "Gravity and Air Resistance",
        "energy",
        "Electromagnetic Induction"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    },
    {
      "from": "ecosystem",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "Group size changes survival, and the best size differs by animal; a claim needs more than one season",
        "Force, mass, and acceleration",
        "cause",
        "effect",
        "always",
        "Earth's gravity pulls objects toward its center; 'down' means toward the center, not the bottom of the picture",
        "claim",
        "interactions",
        "engaging",
        "argument",
        "Cause and effect in motion",
        "Pushes and Pulls",
        "size",
        "than",
        "need",
        "comparing",
        "Gravity and Air Resistance",
        "evidence",
        "Newton's Third Law Force Pairs",
        "changes",
        "more",
        "one",
        "Electromagnetic Induction",
        "Living Thing Needs",
        "things",
        "not",
        "observations",
        "change",
        "because",
        "move",
        "use",
        "construct",
        "for",
        "can",
        "only",
        "how",
        "Food Chain Energy Flow",
        "sunlight",
        "energy",
        "matter",
        "most"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    },
    {
      "from": "fluidlab",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "Fluid Pressure and Depth",
        "Force, mass, and acceleration",
        "force",
        "mass",
        "heavier",
        "always",
        "Cause and effect in motion",
        "direction",
        "Pushes and Pulls",
        "design",
        "because",
        "Gravity and Air Resistance",
        "for",
        "only",
        "gravity",
        "Newton's Third Law Force Pairs",
        "relationship",
        "more",
        "Electromagnetic Induction",
        "explain",
        "principle",
        "predict",
        "how"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    },
    {
      "from": "magnetlab",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "The strength of a magnetic pull depends on distance, current, turns and core; one variable at a time shows which",
        "Force, mass, and acceleration",
        "cause",
        "effect",
        "reading",
        "Earth's gravity pulls objects toward its center; 'down' means toward the center, not the bottom of the picture",
        "forces",
        "interactions",
        "does",
        "Cause and effect in motion",
        "motion",
        "Pushes and Pulls",
        "pull",
        "out",
        "Gravity and Air Resistance",
        "not",
        "matter",
        "can",
        "holding",
        "Newton's Third Law Force Pairs",
        "one",
        "Electromagnetic Induction",
        "magnetic",
        "current",
        "more",
        "magnet",
        "stronger",
        "A magnetic field exerts force across a gap; a reading is evidence only when what else could cause it has been ruled out",
        "force",
        "evidence",
        "has",
        "only",
        "when",
        "exerts",
        "field",
        "magnets",
        "Magnetic field interactions",
        "confusing",
        "ignoring",
        "system",
        "first",
        "vocabulary",
        "two",
        "explain"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    },
    {
      "from": "moleculeforge",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "Molecular arrangement sets material properties; a design claim binds each requirement to the reading that decides it",
        "Earth's gravity pulls objects toward its center; 'down' means toward the center, not the bottom of the picture",
        "claim",
        "reading",
        "does",
        "not",
        "Pushes and Pulls",
        "design",
        "need",
        "always",
        "Gravity and Air Resistance",
        "matter",
        "can",
        "Electromagnetic Induction",
        "properties",
        "Molecular Orbital Theory",
        "two",
        "because",
        "all",
        "construct",
        "energy",
        "for",
        "Newton's Third Law Force Pairs",
        "between",
        "its",
        "must",
        "predict",
        "magnetic",
        "based",
        "basics"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    },
    {
      "from": "opticsbench",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "Refraction and Snell's Law",
        "Force, mass, and acceleration",
        "speed",
        "measurement",
        "always",
        "Earth's gravity pulls objects toward its center; 'down' means toward the center, not the bottom of the picture",
        "its",
        "toward",
        "down",
        "does",
        "not",
        "Pushes and Pulls",
        "two",
        "different",
        "because",
        "rather",
        "than",
        "Gravity and Air Resistance",
        "use",
        "can",
        "Newton's Third Law Force Pairs",
        "law",
        "between",
        "Electromagnetic Induction",
        "explain",
        "predict",
        "properties"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    },
    {
      "from": "orbitlab",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "Orbital mechanics and gravitational systems",
        "Force, mass, and acceleration",
        "mechanics",
        "systems",
        "faster",
        "always",
        "means",
        "Earth's gravity pulls objects toward its center; 'down' means toward the center, not the bottom of the picture",
        "interactions",
        "gravity",
        "forces",
        "Cause and effect in motion",
        "Pushes and Pulls",
        "because",
        "Gravity and Air Resistance",
        "energy",
        "there",
        "space",
        "Newton's Third Law Force Pairs",
        "Electromagnetic Induction",
        "conservation"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    },
    {
      "from": "reactionlab",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "Reaction rate, yield, and energy",
        "Electromagnetic Induction",
        "rate",
        "energy",
        "investigation",
        "Whether mixing two substances makes a new substance is decided by checks, not by bubbles",
        "Force, mass, and acceleration",
        "cause",
        "effect",
        "reading",
        "means",
        "Earth's gravity pulls objects toward its center; 'down' means toward the center, not the bottom of the picture",
        "not",
        "Cause and effect in motion",
        "Pushes and Pulls",
        "two",
        "out",
        "comparing",
        "Gravity and Air Resistance",
        "matter",
        "nothing",
        "can",
        "Newton's Third Law Force Pairs",
        "Conservation of Mass in Reactions",
        "mass",
        "measurement",
        "evidence",
        "counts",
        "different",
        "because",
        "rather",
        "than",
        "when",
        "ones",
        "between",
        "changes",
        "conservation",
        "produce",
        "properties",
        "Chemical Equilibrium",
        "system",
        "models",
        "analyze",
        "always",
        "has",
        "use",
        "balanced",
        "reaction",
        "must",
        "equal",
        "principle",
        "predict",
        "explain"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    },
    {
      "from": "terramap",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "Earth's features cluster in patterns a map can show; a claim about the pattern has to match the count",
        "Force, mass, and acceleration",
        "systems",
        "data",
        "reading",
        "Earth's gravity pulls objects toward its center; 'down' means toward the center, not the bottom of the picture",
        "earth",
        "claim",
        "does",
        "not",
        "Pushes and Pulls",
        "has",
        "all",
        "need",
        "Gravity and Air Resistance",
        "can",
        "Earth's spheres interact through carriers; a model of a river valley shows how living things change what water does to rock",
        "system",
        "models",
        "cause",
        "effect",
        "things",
        "words",
        "Cause and effect in motion",
        "change",
        "two",
        "Newton's Third Law Force Pairs",
        "using",
        "each",
        "other",
        "one",
        "Electromagnetic Induction",
        "how",
        "affect",
        "Erosion, weathering, and landform formation",
        "happens",
        "surface"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    },
    {
      "from": "waveworld",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "Amplitude and wavelength are different measurements on different axes; the wave moves, the cork does not travel",
        "Force, mass, and acceleration",
        "models",
        "reading",
        "graph",
        "Earth's gravity pulls objects toward its center; 'down' means toward the center, not the bottom of the picture",
        "does",
        "not",
        "Sound as Vibration",
        "evidence",
        "objects",
        "Pushes and Pulls",
        "compare",
        "plan",
        "conduct",
        "make",
        "move",
        "Gravity and Air Resistance",
        "use",
        "provide",
        "Newton's Third Law Force Pairs",
        "one",
        "faster",
        "than",
        "Electromagnetic Induction",
        "energy",
        "always"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    },
    {
      "from": "bodyatlas",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "Body Part Functions",
        "Pushes and Pulls",
        "design",
        "solution",
        "not",
        "determine",
        "make",
        "because",
        "Gravity and Air Resistance",
        "use",
        "them",
        "construct",
        "only",
        "Electromagnetic Induction",
        "how"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    },
    {
      "from": "bodyintro",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "Body systems introduction",
        "Force, mass, and acceleration",
        "systems",
        "cause",
        "effect",
        "system",
        "confusing",
        "ignoring",
        "Earth's gravity pulls objects toward its center; 'down' means toward the center, not the bottom of the picture",
        "evidence",
        "Cause and effect in motion",
        "first",
        "Pushes and Pulls",
        "vocabulary"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    },
    {
      "from": "energytransfer",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "Every stage of an energy converter loses some energy; input equals useful output plus losses, and no stage can output more than it takes in",
        "Earth's gravity pulls objects toward its center; 'down' means toward the center, not the bottom of the picture",
        "test",
        "still",
        "not",
        "Pushes and Pulls",
        "than",
        "out",
        "two",
        "Gravity and Air Resistance",
        "energy",
        "can",
        "takes",
        "matter",
        "Newton's Third Law Force Pairs",
        "every",
        "more",
        "changes",
        "one",
        "Electromagnetic Induction",
        "Energy conservation and transfer",
        "Force, mass, and acceleration",
        "cause",
        "effect",
        "confusing",
        "ignoring",
        "system",
        "evidence",
        "Cause and effect in motion",
        "first",
        "vocabulary",
        "conservation",
        "explain"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    },
    {
      "from": "evolvesim",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "Natural Selection Mechanism",
        "Pushes and Pulls",
        "data",
        "change",
        "need",
        "all",
        "has",
        "different",
        "Gravity and Air Resistance",
        "construct",
        "explanation",
        "nothing",
        "Newton's Third Law Force Pairs",
        "using",
        "one",
        "Electromagnetic Induction",
        "based"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    },
    {
      "from": "genelab",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "Gene Expression Regulation",
        "Pushes and Pulls",
        "rather",
        "than",
        "analyze",
        "different",
        "has",
        "change",
        "Gravity and Air Resistance",
        "use",
        "can",
        "Electromagnetic Induction",
        "explain",
        "how"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    },
    {
      "from": "k2bioshell",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "Where a living thing lives depends on what it needs; parts have jobs; young are the same kind but not the same; a place that meets more needs holds more kinds",
        "Earth's gravity pulls objects toward its center; 'down' means toward the center, not the bottom of the picture",
        "not",
        "earth",
        "things",
        "Pushes and Pulls",
        "different",
        "size",
        "rather",
        "than",
        "Gravity and Air Resistance",
        "for",
        "Newton's Third Law Force Pairs",
        "have",
        "more",
        "Electromagnetic Induction"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    },
    {
      "from": "adaptationlab",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "Natural selection mechanisms",
        "Force, mass, and acceleration",
        "cause",
        "effect",
        "confusing",
        "ignoring",
        "system",
        "Earth's gravity pulls objects toward its center; 'down' means toward the center, not the bottom of the picture",
        "evidence",
        "Cause and effect in motion",
        "first",
        "Pushes and Pulls",
        "vocabulary"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    },
    {
      "from": "celldivision",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "Mitosis and meiosis",
        "Force, mass, and acceleration",
        "cause",
        "effect",
        "confusing",
        "ignoring",
        "system",
        "Earth's gravity pulls objects toward its center; 'down' means toward the center, not the bottom of the picture",
        "evidence",
        "Cause and effect in motion",
        "first",
        "Pushes and Pulls",
        "vocabulary"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    },
    {
      "from": "earthhistory",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "Geologic time and fossils",
        "Force, mass, and acceleration",
        "cause",
        "effect",
        "confusing",
        "ignoring",
        "system",
        "Earth's gravity pulls objects toward its center; 'down' means toward the center, not the bottom of the picture",
        "evidence",
        "Cause and effect in motion",
        "first",
        "Pushes and Pulls",
        "vocabulary"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    },
    {
      "from": "foodweb",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "Trophic cascades",
        "Force, mass, and acceleration",
        "cause",
        "effect",
        "confusing",
        "ignoring",
        "system",
        "Earth's gravity pulls objects toward its center; 'down' means toward the center, not the bottom of the picture",
        "evidence",
        "Cause and effect in motion",
        "first",
        "Pushes and Pulls",
        "vocabulary"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    },
    {
      "from": "geoforge",
      "to": "forcefield",
      "kind": "labpath-sequence",
      "priority": "high",
      "concepts": [
        "Rock Cycle Processes",
        "Gravity and Air Resistance",
        "evidence",
        "earth",
        "energy",
        "nothing",
        "matter",
        "Newton's Third Law Force Pairs",
        "using",
        "Electromagnetic Induction",
        "basics",
        "change",
        "being"
      ],
      "misconceptions": [],
      "teacher_facing_reason": "LabPath nodes share concept/prerequisite/misconception language, making this a candidate for accelerated sequencing.",
      "student_facing_reason": "This next lab uses a similar idea in a new situation."
    }
  ],
  "truncated": {
    "before": 41
  },
  "standards": {
    "forcefield": [
      {
        "code": "K-PS2-1",
        "description": "Plan and conduct an investigation to compare the effects of different strengths or different directions of pushes and pulls on the motion of an object.",
        "gradeBand": "K-2",
        "disciplinaryCore": "PS2.A: Forces and Motion",
        "discipline": "Physical Science"
      },
      {
        "code": "K-PS2-2",
        "description": "Analyze data to determine if a design solution works as intended to change the speed or direction of an object with a push or a pull.",
        "gradeBand": "K-2",
        "disciplinaryCore": "PS2.A: Forces and Motion",
        "discipline": "Physical Science"
      },
      {
        "code": "3-PS2-1",
        "description": "Plan and conduct an investigation to provide evidence of the effects of balanced and unbalanced forces on the motion of an object.",
        "gradeBand": "3-5",
        "disciplinaryCore": "PS2.A: Forces and Motion",
        "discipline": "Physical Science"
      },
      {
        "code": "4-PS3-1",
        "description": "Use evidence to construct an explanation relating the speed of an object to the energy of that object.",
        "gradeBand": "3-5",
        "disciplinaryCore": "PS3.A: Definitions of Energy",
        "discipline": "Physical Science"
      },
      {
        "code": "MS-PS2-1",
        "description": "Apply Newton's Third Law to design a solution to a problem involving the motion of two colliding objects.",
        "gradeBand": "6-8",
        "disciplinaryCore": "PS2.A: Forces and Motion",
        "discipline": "Physical Science"
      },
      {
        "code": "MS-PS2-2",
        "description": "Plan an investigation to provide evidence that the change in an object's motion depends on the sum of the forces acting on the object and the mass of the object.",
        "gradeBand": "6-8",
        "disciplinaryCore": "PS2.A: Forces and Motion",
        "discipline": "Physical Science"
      },
      {
        "code": "MS-PS2-4",
        "description": "Construct and present arguments using evidence to support the claim that gravitational interactions are attractive and depend on the masses of interacting objects.",
        "gradeBand": "6-8",
        "disciplinaryCore": "PS2.B: Types of Interactions",
        "discipline": "Physical Science"
      },
      {
        "code": "MS-PS3-1",
        "description": "Construct and interpret graphical displays of data to describe the relationships of kinetic energy to the mass of an object and to the speed of an object.",
        "gradeBand": "6-8",
        "disciplinaryCore": "PS3.A: Definitions of Energy",
        "discipline": "Physical Science"
      },
      {
        "code": "MS-PS3-5",
        "description": "Construct, use, and present arguments to support the claim that when the kinetic energy of an object changes, energy is transferred to or from the object.",
        "gradeBand": "6-8",
        "disciplinaryCore": "PS3.B: Conservation of Energy and Energy Transfer",
        "discipline": "Physical Science"
      },
      {
        "code": "HS-PS2-1",
        "description": "Analyze data to support the claim that Newton's second law of motion describes the mathematical relationship among the net force on a macroscopic object, its mass, and its acceleration.",
        "gradeBand": "9-12",
        "disciplinaryCore": "PS2.A: Forces and Motion",
        "discipline": "Physical Science"
      },
      {
        "code": "HS-PS2-3",
        "description": "Apply scientific and engineering ideas to design, evaluate, and refine a device that minimizes the force on a macroscopic object during a collision.",
        "gradeBand": "9-12",
        "disciplinaryCore": "PS2.A: Forces and Motion",
        "discipline": "Physical Science"
      },
      {
        "code": "HS-PS2-4",
        "description": "Use mathematical representations of Newton's Law of Gravitation and Coulomb's Law to describe and predict the gravitational and electrostatic forces between objects.",
        "gradeBand": "9-12",
        "disciplinaryCore": "PS2.B: Types of Interactions",
        "discipline": "Physical Science"
      },
      {
        "code": "HS-PS3-1",
        "description": "Create a computational model to calculate the change in the energy of one component in a system when the conditions of other components in the system change.",
        "gradeBand": "9-12",
        "disciplinaryCore": "PS3.A: Definitions of Energy",
        "discipline": "Physical Science"
      },
      {
        "code": "HS-PS3-2",
        "description": "Develop and use models to illustrate that energy at the macroscopic scale can be accounted for as a combination of energy associated with the motions of particles (objects) and energy associated with the relative positions of particles (objects).",
        "gradeBand": "9-12",
        "disciplinaryCore": "PS3.A: Definitions of Energy",
        "discipline": "Physical Science"
      }
    ],
    "simpleforces": [],
    "bioforge": [
      {
        "code": "HS-LS1-1",
        "description": "Construct an explanation based on evidence for how the structure of DNA determines the structure of proteins which carry out the essential functions of life through systems of specialized cells.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS1.A: Structure and Function",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS1-4",
        "description": "Use a model to illustrate the role of cellular division (mitosis) and differentiation in producing and maintaining complex organisms.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS1.B: Growth and Development of Organisms",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS1-6",
        "description": "Construct and revise an explanation based on evidence for how carbon, hydrogen, and oxygen from sugar molecules may combine with other elements to form amino acids and/or other large carbon-based molecules.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS1.C: Organization for Matter and Energy Flow in Organisms",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS3-1",
        "description": "Ask questions to clarify relationships about the role of DNA and chromosomes in coding the instructions for characteristic traits passed from parents to offspring.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS3.A: Inheritance of Traits",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS3-2",
        "description": "Make and defend a claim based on evidence that inheritable genetic variations may result from: (1) new genetic combinations through meiosis, (2) viable errors occurring during replication, and/or (3) mutations caused by environmental factors.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS3.B: Variation of Traits",
        "discipline": "Life Science"
      },
      {
        "code": "HS-ETS1-2",
        "description": "Design a solution to a complex real-world problem by breaking it down into smaller, more manageable problems that can be solved through engineering.",
        "gradeBand": "9-12",
        "disciplinaryCore": "ETS1.B: Developing Possible Solutions",
        "discipline": "Engineering"
      },
      {
        "code": "HS-ETS1-3",
        "description": "Evaluate a solution to a complex real-world problem based on prioritized criteria and trade-offs that account for a range of constraints, including cost, safety, reliability, and aesthetics, as well as possible social, cultural, and environmental impacts.",
        "gradeBand": "9-12",
        "disciplinaryCore": "ETS1.B: Developing Possible Solutions",
        "discipline": "Engineering"
      }
    ],
    "buildlab": [
      {
        "code": "3-5-ETS1-1",
        "description": "Define a simple design problem reflecting a need or a want that includes specified criteria for success and constraints on materials, time, or cost.",
        "gradeBand": "3-5",
        "disciplinaryCore": "ETS1.A: Defining and Delimiting Engineering Problems",
        "discipline": "Engineering"
      },
      {
        "code": "3-5-ETS1-2",
        "description": "Generate and compare multiple possible solutions to a problem based on how well each is likely to meet the criteria and constraints of the problem.",
        "gradeBand": "3-5",
        "disciplinaryCore": "ETS1.B: Developing Possible Solutions",
        "discipline": "Engineering"
      },
      {
        "code": "MS-ETS1-1",
        "description": "Define the criteria and constraints of a design problem with sufficient precision to ensure a successful solution.",
        "gradeBand": "6-8",
        "disciplinaryCore": "ETS1.A: Defining and Delimiting Engineering Problems",
        "discipline": "Engineering"
      },
      {
        "code": "MS-ETS1-3",
        "description": "Analyze data from tests to determine similarities and differences among several design solutions to identify the best characteristics of each that can be combined into a new solution to better meet the criteria for success.",
        "gradeBand": "6-8",
        "disciplinaryCore": "ETS1.B: Developing Possible Solutions",
        "discipline": "Engineering"
      },
      {
        "code": "MS-ETS1-4",
        "description": "Develop a model to generate data for iterative testing and modification of a proposed object, tool, or process such that an optimal design can be achieved.",
        "gradeBand": "6-8",
        "disciplinaryCore": "ETS1.B: Developing Possible Solutions",
        "discipline": "Engineering"
      },
      {
        "code": "HS-ETS1-1",
        "description": "Analyze a major global challenge to specify qualitative and quantitative criteria and constraints for solutions that account for societal needs and wants.",
        "gradeBand": "9-12",
        "disciplinaryCore": "ETS1.A: Defining and Delimiting Engineering Problems",
        "discipline": "Engineering"
      },
      {
        "code": "HS-ETS1-2",
        "description": "Design a solution to a complex real-world problem by breaking it down into smaller, more manageable problems that can be solved through engineering.",
        "gradeBand": "9-12",
        "disciplinaryCore": "ETS1.B: Developing Possible Solutions",
        "discipline": "Engineering"
      },
      {
        "code": "HS-ETS1-3",
        "description": "Evaluate a solution to a complex real-world problem based on prioritized criteria and trade-offs that account for a range of constraints, including cost, safety, reliability, and aesthetics, as well as possible social, cultural, and environmental impacts.",
        "gradeBand": "9-12",
        "disciplinaryCore": "ETS1.B: Developing Possible Solutions",
        "discipline": "Engineering"
      },
      {
        "code": "HS-ETS1-4",
        "description": "Use a computer simulation to model the impact of proposed solutions to a complex real-world problem with numerous criteria and constraints on interactions within and between systems relevant to the problem.",
        "gradeBand": "9-12",
        "disciplinaryCore": "ETS1.C: Optimizing the Design Solution",
        "discipline": "Engineering"
      }
    ],
    "cellworld": [
      {
        "code": "MS-LS1-1",
        "description": "Conduct an investigation to provide evidence that living things are made of cells; either one cell or many different numbers and types of cells.",
        "gradeBand": "6-8",
        "disciplinaryCore": "LS1.A: Structure and Function",
        "discipline": "Life Science"
      },
      {
        "code": "MS-LS1-2",
        "description": "Develop and use a model to describe the function of a cell as a whole and ways the parts of cells contribute to the function.",
        "gradeBand": "6-8",
        "disciplinaryCore": "LS1.A: Structure and Function",
        "discipline": "Life Science"
      },
      {
        "code": "MS-LS1-3",
        "description": "Use argument supported by evidence for how the body is a system of interacting subsystems composed of groups of cells.",
        "gradeBand": "6-8",
        "disciplinaryCore": "LS1.A: Structure and Function",
        "discipline": "Life Science"
      },
      {
        "code": "MS-LS1-5",
        "description": "Construct a scientific explanation based on evidence for how environmental and genetic factors influence the growth of organisms.",
        "gradeBand": "6-8",
        "disciplinaryCore": "LS1.B: Growth and Development of Organisms",
        "discipline": "Life Science"
      },
      {
        "code": "MS-LS1-6",
        "description": "Construct a scientific explanation based on evidence for the role of photosynthesis in the cycling of matter and flow of energy into and out of organisms.",
        "gradeBand": "6-8",
        "disciplinaryCore": "LS1.C: Organization for Matter and Energy Flow in Organisms",
        "discipline": "Life Science"
      },
      {
        "code": "MS-LS1-7",
        "description": "Develop a model to describe how food is rearranged through chemical reactions forming new molecules that support growth and/or release energy as this matter moves through an organism.",
        "gradeBand": "6-8",
        "disciplinaryCore": "LS1.C: Organization for Matter and Energy Flow in Organisms",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS1-1",
        "description": "Construct an explanation based on evidence for how the structure of DNA determines the structure of proteins which carry out the essential functions of life through systems of specialized cells.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS1.A: Structure and Function",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS1-2",
        "description": "Develop and use a model to illustrate the hierarchical organization of interacting systems that provide specific functions within multicellular organisms.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS1.A: Structure and Function",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS1-3",
        "description": "Plan and conduct an investigation to provide evidence that feedback mechanisms maintain homeostasis.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS1.A: Structure and Function",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS1-4",
        "description": "Use a model to illustrate the role of cellular division (mitosis) and differentiation in producing and maintaining complex organisms.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS1.B: Growth and Development of Organisms",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS1-5",
        "description": "Use a model to illustrate how photosynthesis transforms light energy into stored chemical energy.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS1.C: Organization for Matter and Energy Flow in Organisms",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS1-6",
        "description": "Construct and revise an explanation based on evidence for how carbon, hydrogen, and oxygen from sugar molecules may combine with other elements to form amino acids and/or other large carbon-based molecules.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS1.C: Organization for Matter and Energy Flow in Organisms",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS1-7",
        "description": "Use a model to illustrate that cellular respiration is a chemical process whereby the bonds of food molecules and oxygen molecules are broken and the bonds in new compounds are formed resulting in a net transfer of energy.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS1.C: Organization for Matter and Energy Flow in Organisms",
        "discipline": "Life Science"
      }
    ],
    "climateengine": [
      {
        "code": "MS-ESS2-6",
        "description": "Develop and use a model to describe how unequal heating and rotation of the Earth cause patterns of atmospheric and oceanic circulation that determine regional climates.",
        "gradeBand": "6-8",
        "disciplinaryCore": "ESS2.D: Weather and Climate",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "MS-ESS3-3",
        "description": "Apply scientific principles to design a method for monitoring and minimizing a human impact on the environment.",
        "gradeBand": "6-8",
        "disciplinaryCore": "ESS3.C: Human Impacts on Earth Systems",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "MS-ESS3-5",
        "description": "Ask questions to clarify evidence of the factors that have caused the rise in global temperatures over the past century.",
        "gradeBand": "6-8",
        "disciplinaryCore": "ESS3.D: Global Climate Change",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "HS-ESS2-4",
        "description": "Use a model to describe how variations in the flow of energy into and out of Earth's systems result in changes in climate.",
        "gradeBand": "9-12",
        "disciplinaryCore": "ESS2.D: Weather and Climate",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "HS-ESS2-6",
        "description": "Develop a quantitative model to describe the cycling of carbon among the hydrosphere, atmosphere, geosphere, and biosphere.",
        "gradeBand": "9-12",
        "disciplinaryCore": "ESS2.D: Weather and Climate",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "HS-ESS3-1",
        "description": "Construct an explanation based on evidence for how the availability of natural resources, occurrence of natural hazards, and changes in climate have influenced human activity.",
        "gradeBand": "9-12",
        "disciplinaryCore": "ESS3.A: Natural Resources",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "HS-ESS3-4",
        "description": "Evaluate or refine a technological solution that reduces impacts of human activities on natural systems.",
        "gradeBand": "9-12",
        "disciplinaryCore": "ESS3.C: Human Impacts on Earth Systems",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "HS-ESS3-5",
        "description": "Analyze geoscience data and the results from global climate models to make an evidence-based forecast of the current rate of global or regional climate change and associated future impacts to Earth systems.",
        "gradeBand": "9-12",
        "disciplinaryCore": "ESS3.D: Global Climate Change",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "HS-ESS3-6",
        "description": "Use a computational representation to illustrate the relationships among Earth systems and how those relationships are being modified due to human activity.",
        "gradeBand": "9-12",
        "disciplinaryCore": "ESS3.D: Global Climate Change",
        "discipline": "Earth & Space Science"
      }
    ],
    "ecosystem": [
      {
        "code": "K-LS1-1",
        "description": "Use observations to describe patterns of what plants and animals (including humans) need to survive.",
        "gradeBand": "K-2",
        "disciplinaryCore": "LS1.C: Organization for Matter and Energy Flow in Organisms",
        "discipline": "Life Science"
      },
      {
        "code": "K-ESS3-1",
        "description": "Use a model to represent the relationship between the needs of different plants or animals (including humans) and the places they live.",
        "gradeBand": "K-2",
        "disciplinaryCore": "ESS3.A: Natural Resources",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "2-LS2-1",
        "description": "Plan and conduct an investigation to determine if plants need sunlight and water to grow.",
        "gradeBand": "K-2",
        "disciplinaryCore": "LS2.A: Interdependent Relationships in Ecosystems",
        "discipline": "Life Science"
      },
      {
        "code": "2-LS4-1",
        "description": "Make observations of plants and animals to compare the diversity of life in different habitats.",
        "gradeBand": "K-2",
        "disciplinaryCore": "LS4.D: Biodiversity and Humans",
        "discipline": "Life Science"
      },
      {
        "code": "5-LS2-1",
        "description": "Develop a model to describe the movement of matter among plants, animals, decomposers, and the environment.",
        "gradeBand": "3-5",
        "disciplinaryCore": "LS2.A: Interdependent Relationships in Ecosystems",
        "discipline": "Life Science"
      },
      {
        "code": "3-LS4-3",
        "description": "Construct an argument with evidence that in a particular habitat some organisms can survive well, some survive less well, and some cannot survive at all.",
        "gradeBand": "3-5",
        "disciplinaryCore": "LS4.C: Adaptation",
        "discipline": "Life Science"
      },
      {
        "code": "MS-LS2-1",
        "description": "Analyze and interpret data to provide evidence for the effects of resource availability on organisms and populations of organisms in an ecosystem.",
        "gradeBand": "6-8",
        "disciplinaryCore": "LS2.A: Interdependent Relationships in Ecosystems",
        "discipline": "Life Science"
      },
      {
        "code": "MS-LS2-2",
        "description": "Construct an explanation that predicts patterns of interactions among organisms across multiple ecosystems.",
        "gradeBand": "6-8",
        "disciplinaryCore": "LS2.A: Interdependent Relationships in Ecosystems",
        "discipline": "Life Science"
      },
      {
        "code": "MS-LS2-3",
        "description": "Develop a model to describe the cycling of matter and flow of energy among living and nonliving parts of an ecosystem.",
        "gradeBand": "6-8",
        "disciplinaryCore": "LS2.B: Cycles of Matter and Energy Transfer in Ecosystems",
        "discipline": "Life Science"
      },
      {
        "code": "MS-LS2-4",
        "description": "Construct an argument supported by empirical evidence that changes to physical or biological components of an ecosystem affect populations.",
        "gradeBand": "6-8",
        "disciplinaryCore": "LS2.C: Ecosystem Dynamics, Functioning, and Resilience",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS2-1",
        "description": "Use mathematical and/or computational representations to support explanations of factors that affect carrying capacity of ecosystems at different scales.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS2.A: Interdependent Relationships in Ecosystems",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS2-2",
        "description": "Use mathematical representations to support and revise explanations based on evidence about factors affecting biodiversity and populations in ecosystems.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS2.A: Interdependent Relationships in Ecosystems",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS2-4",
        "description": "Use mathematical representations to support claims for the cycling of matter and flow of energy among organisms in an ecosystem.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS2.B: Cycles of Matter and Energy Transfer in Ecosystems",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS2-6",
        "description": "Evaluate the claims, evidence, and reasoning that the complex interactions in ecosystems maintain relatively consistent numbers and types of organisms in stable conditions, but changing conditions may result in a new ecosystem.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS2.C: Ecosystem Dynamics, Functioning, and Resilience",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS2-7",
        "description": "Design, evaluate, and refine a solution for reducing the impacts of human activities on the environment and biodiversity.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS2.C: Ecosystem Dynamics, Functioning, and Resilience",
        "discipline": "Life Science"
      },
      {
        "code": "MS-ESS3-3",
        "description": "Apply scientific principles to design a method for monitoring and minimizing a human impact on the environment.",
        "gradeBand": "6-8",
        "disciplinaryCore": "ESS3.C: Human Impacts on Earth Systems",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "HS-ESS3-4",
        "description": "Evaluate or refine a technological solution that reduces impacts of human activities on natural systems.",
        "gradeBand": "9-12",
        "disciplinaryCore": "ESS3.C: Human Impacts on Earth Systems",
        "discipline": "Earth & Space Science"
      }
    ],
    "fluidlab": [
      {
        "code": "MS-PS1-4",
        "description": "Develop a model that predicts and describes changes in particle motion, temperature, and state of a pure substance when thermal energy is added or removed.",
        "gradeBand": "6-8",
        "disciplinaryCore": "PS1.A: Structure and Properties of Matter",
        "discipline": "Physical Science"
      },
      {
        "code": "MS-ESS2-6",
        "description": "Develop and use a model to describe how unequal heating and rotation of the Earth cause patterns of atmospheric and oceanic circulation that determine regional climates.",
        "gradeBand": "6-8",
        "disciplinaryCore": "ESS2.D: Weather and Climate",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "HS-PS3-2",
        "description": "Develop and use models to illustrate that energy at the macroscopic scale can be accounted for as a combination of energy associated with the motions of particles (objects) and energy associated with the relative positions of particles (objects).",
        "gradeBand": "9-12",
        "disciplinaryCore": "PS3.A: Definitions of Energy",
        "discipline": "Physical Science"
      },
      {
        "code": "HS-ESS2-4",
        "description": "Use a model to describe how variations in the flow of energy into and out of Earth's systems result in changes in climate.",
        "gradeBand": "9-12",
        "disciplinaryCore": "ESS2.D: Weather and Climate",
        "discipline": "Earth & Space Science"
      }
    ],
    "magnetlab": [],
    "moleculeforge": [
      {
        "code": "5-PS1-1",
        "description": "Develop a model to describe that matter is made of particles too small to be seen.",
        "gradeBand": "3-5",
        "disciplinaryCore": "PS1.A: Structure and Properties of Matter",
        "discipline": "Physical Science"
      },
      {
        "code": "5-PS1-3",
        "description": "Make observations and measurements to identify materials based on their properties.",
        "gradeBand": "3-5",
        "disciplinaryCore": "PS1.A: Structure and Properties of Matter",
        "discipline": "Physical Science"
      },
      {
        "code": "MS-PS1-1",
        "description": "Develop models to describe the atomic composition of simple molecules and extended structures.",
        "gradeBand": "6-8",
        "disciplinaryCore": "PS1.A: Structure and Properties of Matter",
        "discipline": "Physical Science"
      },
      {
        "code": "MS-PS1-2",
        "description": "Analyze and interpret data on the properties of substances before and after the substances interact to determine if a chemical reaction has occurred.",
        "gradeBand": "6-8",
        "disciplinaryCore": "PS1.A: Structure and Properties of Matter",
        "discipline": "Physical Science"
      },
      {
        "code": "MS-PS1-4",
        "description": "Develop a model that predicts and describes changes in particle motion, temperature, and state of a pure substance when thermal energy is added or removed.",
        "gradeBand": "6-8",
        "disciplinaryCore": "PS1.A: Structure and Properties of Matter",
        "discipline": "Physical Science"
      },
      {
        "code": "MS-PS1-5",
        "description": "Develop and use a model to describe how the total number of atoms does not change in a chemical reaction and thus mass is conserved.",
        "gradeBand": "6-8",
        "disciplinaryCore": "PS1.B: Chemical Reactions",
        "discipline": "Physical Science"
      },
      {
        "code": "HS-PS1-1",
        "description": "Use the periodic table as a model to predict the relative properties of elements based on the patterns of electrons in the outermost energy level of atoms.",
        "gradeBand": "9-12",
        "disciplinaryCore": "PS1.A: Structure and Properties of Matter",
        "discipline": "Physical Science"
      },
      {
        "code": "HS-PS1-2",
        "description": "Construct and revise an explanation for the outcome of a simple chemical reaction based on the outermost electron states of atoms, trends in the periodic table, and knowledge of the patterns of chemical properties.",
        "gradeBand": "9-12",
        "disciplinaryCore": "PS1.A: Structure and Properties of Matter",
        "discipline": "Physical Science"
      },
      {
        "code": "HS-PS1-4",
        "description": "Develop a model to illustrate that the release or absorption of energy from a chemical reaction system depends upon the changes in total bond energy.",
        "gradeBand": "9-12",
        "disciplinaryCore": "PS1.B: Chemical Reactions",
        "discipline": "Physical Science"
      },
      {
        "code": "HS-PS1-7",
        "description": "Use mathematical representations to support the claim that atoms, and therefore mass, are conserved during a chemical reaction.",
        "gradeBand": "9-12",
        "disciplinaryCore": "PS1.B: Chemical Reactions",
        "discipline": "Physical Science"
      }
    ],
    "opticsbench": [
      {
        "code": "K-PS3-1",
        "description": "Make observations to determine the effect of sunlight on Earth's surface.",
        "gradeBand": "K-2",
        "disciplinaryCore": "PS3.B: Conservation of Energy and Energy Transfer",
        "discipline": "Physical Science"
      },
      {
        "code": "4-PS4-1",
        "description": "Develop a model of waves to describe patterns in terms of amplitude and wavelength and that waves can cause objects to move.",
        "gradeBand": "3-5",
        "disciplinaryCore": "PS4.A: Wave Properties",
        "discipline": "Physical Science"
      },
      {
        "code": "MS-PS4-1",
        "description": "Use mathematical representations to describe a simple model for waves that includes how the amplitude of a wave is related to the energy in a wave.",
        "gradeBand": "6-8",
        "disciplinaryCore": "PS4.A: Wave Properties",
        "discipline": "Physical Science"
      },
      {
        "code": "MS-PS4-2",
        "description": "Develop and use a model to describe that waves are reflected, absorbed, or transmitted through various materials.",
        "gradeBand": "6-8",
        "disciplinaryCore": "PS4.A: Wave Properties",
        "discipline": "Physical Science"
      },
      {
        "code": "HS-PS4-1",
        "description": "Use mathematical representations to support a claim regarding relationships among the frequency, wavelength, and speed of waves traveling in various media.",
        "gradeBand": "9-12",
        "disciplinaryCore": "PS4.A: Wave Properties",
        "discipline": "Physical Science"
      },
      {
        "code": "HS-PS4-3",
        "description": "Evaluate the claims, evidence, and reasoning behind the idea that electromagnetic radiation can be described either by a wave model or a particle model.",
        "gradeBand": "9-12",
        "disciplinaryCore": "PS4.A: Wave Properties",
        "discipline": "Physical Science"
      },
      {
        "code": "HS-PS4-5",
        "description": "Communicate technical information about how some technological devices use the principles of wave behavior and wave interactions with matter to transmit and capture information and energy.",
        "gradeBand": "9-12",
        "disciplinaryCore": "PS4.C: Information Technologies and Instrumentation",
        "discipline": "Physical Science"
      }
    ],
    "orbitlab": [
      {
        "code": "5-ESS1-1",
        "description": "Support an argument that differences in the apparent brightness of the sun compared to other stars is due to their relative distances from Earth.",
        "gradeBand": "3-5",
        "disciplinaryCore": "ESS1.A: The Universe and its Stars",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "MS-ESS1-1",
        "description": "Develop and use a model of the Earth-sun-moon system to describe the cyclic patterns of lunar phases, eclipses of the sun and moon, and seasons.",
        "gradeBand": "6-8",
        "disciplinaryCore": "ESS1.A: The Universe and its Stars",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "MS-ESS1-2",
        "description": "Develop and use a model to describe the role of gravity in the motions within galaxies and the solar system.",
        "gradeBand": "6-8",
        "disciplinaryCore": "ESS1.B: Earth and the Solar System",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "HS-ESS1-1",
        "description": "Develop a model based on evidence to illustrate the life span of the sun and the role of nuclear fusion in the sun's core to release energy that eventually transfers to Earth in the form of radiation.",
        "gradeBand": "9-12",
        "disciplinaryCore": "ESS1.A: The Universe and its Stars",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "HS-ESS1-4",
        "description": "Use mathematical or computational representations to predict the motion of orbiting objects in the solar system.",
        "gradeBand": "9-12",
        "disciplinaryCore": "ESS1.B: Earth and the Solar System",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "HS-PS2-4",
        "description": "Use mathematical representations of Newton's Law of Gravitation and Coulomb's Law to describe and predict the gravitational and electrostatic forces between objects.",
        "gradeBand": "9-12",
        "disciplinaryCore": "PS2.B: Types of Interactions",
        "discipline": "Physical Science"
      }
    ],
    "reactionlab": [
      {
        "code": "MS-PS1-2",
        "description": "Analyze and interpret data on the properties of substances before and after the substances interact to determine if a chemical reaction has occurred.",
        "gradeBand": "6-8",
        "disciplinaryCore": "PS1.A: Structure and Properties of Matter",
        "discipline": "Physical Science"
      },
      {
        "code": "MS-PS1-5",
        "description": "Develop and use a model to describe how the total number of atoms does not change in a chemical reaction and thus mass is conserved.",
        "gradeBand": "6-8",
        "disciplinaryCore": "PS1.B: Chemical Reactions",
        "discipline": "Physical Science"
      },
      {
        "code": "HS-PS1-2",
        "description": "Construct and revise an explanation for the outcome of a simple chemical reaction based on the outermost electron states of atoms, trends in the periodic table, and knowledge of the patterns of chemical properties.",
        "gradeBand": "9-12",
        "disciplinaryCore": "PS1.A: Structure and Properties of Matter",
        "discipline": "Physical Science"
      },
      {
        "code": "HS-PS1-4",
        "description": "Develop a model to illustrate that the release or absorption of energy from a chemical reaction system depends upon the changes in total bond energy.",
        "gradeBand": "9-12",
        "disciplinaryCore": "PS1.B: Chemical Reactions",
        "discipline": "Physical Science"
      },
      {
        "code": "HS-PS1-5",
        "description": "Apply scientific principles and evidence to provide an explanation about the effects of changing the temperature or concentration of the reacting particles on the rate at which a reaction occurs.",
        "gradeBand": "9-12",
        "disciplinaryCore": "PS1.B: Chemical Reactions",
        "discipline": "Physical Science"
      },
      {
        "code": "HS-PS1-7",
        "description": "Use mathematical representations to support the claim that atoms, and therefore mass, are conserved during a chemical reaction.",
        "gradeBand": "9-12",
        "disciplinaryCore": "PS1.B: Chemical Reactions",
        "discipline": "Physical Science"
      }
    ],
    "terramap": [
      {
        "code": "5-ESS2-1",
        "description": "Develop a model using an example to describe ways the geosphere, biosphere, hydrosphere, and/or atmosphere interact.",
        "gradeBand": "3-5",
        "disciplinaryCore": "ESS2.A: Earth Materials and Systems",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "MS-ESS2-1",
        "description": "Develop a model to describe the cycling of Earth's materials and the flow of energy that drives this process.",
        "gradeBand": "6-8",
        "disciplinaryCore": "ESS2.A: Earth Materials and Systems",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "MS-ESS2-2",
        "description": "Construct an explanation based on evidence for how geoscience processes have changed Earth's surface at varying time and spatial scales.",
        "gradeBand": "6-8",
        "disciplinaryCore": "ESS2.A: Earth Materials and Systems",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "MS-ESS2-6",
        "description": "Develop and use a model to describe how unequal heating and rotation of the Earth cause patterns of atmospheric and oceanic circulation that determine regional climates.",
        "gradeBand": "6-8",
        "disciplinaryCore": "ESS2.D: Weather and Climate",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "MS-ESS3-3",
        "description": "Apply scientific principles to design a method for monitoring and minimizing a human impact on the environment.",
        "gradeBand": "6-8",
        "disciplinaryCore": "ESS3.C: Human Impacts on Earth Systems",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "HS-ESS2-1",
        "description": "Develop a model to illustrate how Earth's internal and surface processes operate at different spatial and temporal scales to form continental and ocean-floor features.",
        "gradeBand": "9-12",
        "disciplinaryCore": "ESS2.A: Earth Materials and Systems",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "HS-ESS2-2",
        "description": "Analyze geoscience data to make the claim that one change to Earth's surface can create feedbacks that cause changes to other Earth systems.",
        "gradeBand": "9-12",
        "disciplinaryCore": "ESS2.A: Earth Materials and Systems",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "HS-ESS2-4",
        "description": "Use a model to describe how variations in the flow of energy into and out of Earth's systems result in changes in climate.",
        "gradeBand": "9-12",
        "disciplinaryCore": "ESS2.D: Weather and Climate",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "HS-ESS3-4",
        "description": "Evaluate or refine a technological solution that reduces impacts of human activities on natural systems.",
        "gradeBand": "9-12",
        "disciplinaryCore": "ESS3.C: Human Impacts on Earth Systems",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "CCC-7",
        "description": "Stability and Change",
        "gradeBand": "9-12",
        "disciplinaryCore": "Crosscutting Concepts",
        "discipline": "Life Science"
      }
    ],
    "waveworld": [
      {
        "code": "4-PS4-1",
        "description": "Develop a model of waves to describe patterns in terms of amplitude and wavelength and that waves can cause objects to move.",
        "gradeBand": "3-5",
        "disciplinaryCore": "PS4.A: Wave Properties",
        "discipline": "Physical Science"
      },
      {
        "code": "MS-PS4-1",
        "description": "Use mathematical representations to describe a simple model for waves that includes how the amplitude of a wave is related to the energy in a wave.",
        "gradeBand": "6-8",
        "disciplinaryCore": "PS4.A: Wave Properties",
        "discipline": "Physical Science"
      },
      {
        "code": "MS-PS4-2",
        "description": "Develop and use a model to describe that waves are reflected, absorbed, or transmitted through various materials.",
        "gradeBand": "6-8",
        "disciplinaryCore": "PS4.A: Wave Properties",
        "discipline": "Physical Science"
      },
      {
        "code": "HS-PS4-1",
        "description": "Use mathematical representations to support a claim regarding relationships among the frequency, wavelength, and speed of waves traveling in various media.",
        "gradeBand": "9-12",
        "disciplinaryCore": "PS4.A: Wave Properties",
        "discipline": "Physical Science"
      },
      {
        "code": "HS-PS4-3",
        "description": "Evaluate the claims, evidence, and reasoning behind the idea that electromagnetic radiation can be described either by a wave model or a particle model.",
        "gradeBand": "9-12",
        "disciplinaryCore": "PS4.A: Wave Properties",
        "discipline": "Physical Science"
      },
      {
        "code": "HS-PS4-5",
        "description": "Communicate technical information about how some technological devices use the principles of wave behavior and wave interactions with matter to transmit and capture information and energy.",
        "gradeBand": "9-12",
        "disciplinaryCore": "PS4.C: Information Technologies and Instrumentation",
        "discipline": "Physical Science"
      }
    ],
    "bodyatlas": [
      {
        "code": "4-LS1-1",
        "description": "Construct an argument that plants and animals have internal and external structures that function to support survival, growth, behavior, and reproduction.",
        "gradeBand": "3-5",
        "disciplinaryCore": "LS1.A: Structure and Function",
        "discipline": "Life Science"
      },
      {
        "code": "4-LS1-2",
        "description": "Use a model to describe that animals receive different types of information through their senses, process the information in their brain, and respond to the information in different ways.",
        "gradeBand": "3-5",
        "disciplinaryCore": "LS1.D: Information Processing",
        "discipline": "Life Science"
      },
      {
        "code": "MS-LS1-1",
        "description": "Conduct an investigation to provide evidence that living things are made of cells; either one cell or many different numbers and types of cells.",
        "gradeBand": "6-8",
        "disciplinaryCore": "LS1.A: Structure and Function",
        "discipline": "Life Science"
      },
      {
        "code": "MS-LS1-2",
        "description": "Develop and use a model to describe the function of a cell as a whole and ways the parts of cells contribute to the function.",
        "gradeBand": "6-8",
        "disciplinaryCore": "LS1.A: Structure and Function",
        "discipline": "Life Science"
      },
      {
        "code": "MS-LS1-3",
        "description": "Use argument supported by evidence for how the body is a system of interacting subsystems composed of groups of cells.",
        "gradeBand": "6-8",
        "disciplinaryCore": "LS1.A: Structure and Function",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS1-2",
        "description": "Develop and use a model to illustrate the hierarchical organization of interacting systems that provide specific functions within multicellular organisms.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS1.A: Structure and Function",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS1-3",
        "description": "Plan and conduct an investigation to provide evidence that feedback mechanisms maintain homeostasis.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS1.A: Structure and Function",
        "discipline": "Life Science"
      }
    ],
    "bodyintro": [],
    "energytransfer": [],
    "evolvesim": [
      {
        "code": "MS-LS4-1",
        "description": "Analyze and interpret data for patterns in the fossil record that document the existence, diversity, extinction, and change of life forms throughout the history of life on Earth.",
        "gradeBand": "6-8",
        "disciplinaryCore": "LS4.A: Evidence of Common Ancestry and Diversity",
        "discipline": "Life Science"
      },
      {
        "code": "MS-LS4-4",
        "description": "Construct an explanation based on evidence that describes how genetic variations of traits in a population increase some individuals' probability of surviving and reproducing in a specific environment.",
        "gradeBand": "6-8",
        "disciplinaryCore": "LS4.B: Natural Selection",
        "discipline": "Life Science"
      },
      {
        "code": "MS-LS4-6",
        "description": "Use mathematical representations to support explanations of how natural selection may lead to increases and decreases of specific traits in populations over time.",
        "gradeBand": "6-8",
        "disciplinaryCore": "LS4.C: Adaptation",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS4-1",
        "description": "Communicate scientific information that common ancestry and biological evolution are supported by multiple lines of empirical evidence.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS4.A: Evidence of Common Ancestry and Diversity",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS4-2",
        "description": "Construct an explanation based on evidence that the process of evolution primarily results from four factors: (1) the potential for a species to increase in number, (2) the heritable genetic variation of individuals in a species due to mutation and sexual reproduction, (3) competition for limited resources, and (4) the proliferation of those organisms that are better able to survive and reproduce in the environment.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS4.B: Natural Selection",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS4-3",
        "description": "Apply concepts of statistics and probability to support explanations that organisms with an advantageous heritable trait tend to increase in proportion to organisms lacking this trait.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS4.B: Natural Selection",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS4-4",
        "description": "Construct an explanation based on evidence for how natural selection leads to adaptation of populations.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS4.C: Adaptation",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS4-5",
        "description": "Evaluate the evidence supporting claims that changes in environmental conditions may result in: (1) increases in the number of individuals of some species, (2) the emergence of new species over time, and (3) the extinction of other species.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS4.C: Adaptation",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS4-6",
        "description": "Create or revise a simulation to test a solution to mitigate adverse impacts of human activity on biodiversity.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS4.D: Biodiversity and Humans",
        "discipline": "Life Science"
      }
    ],
    "genelab": [
      {
        "code": "MS-LS3-1",
        "description": "Develop and use a model to describe why structural changes to genes (mutations) located on chromosomes may affect proteins and may result in harmful, beneficial, or neutral effects to the structure and function of the organism.",
        "gradeBand": "6-8",
        "disciplinaryCore": "LS3.A: Inheritance of Traits",
        "discipline": "Life Science"
      },
      {
        "code": "MS-LS3-2",
        "description": "Develop and use a model to describe why asexual reproduction results in offspring with identical genetic information and sexual reproduction results in offspring with genetic variation.",
        "gradeBand": "6-8",
        "disciplinaryCore": "LS3.B: Variation of Traits",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS1-1",
        "description": "Construct an explanation based on evidence for how the structure of DNA determines the structure of proteins which carry out the essential functions of life through systems of specialized cells.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS1.A: Structure and Function",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS3-1",
        "description": "Ask questions to clarify relationships about the role of DNA and chromosomes in coding the instructions for characteristic traits passed from parents to offspring.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS3.A: Inheritance of Traits",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS3-2",
        "description": "Make and defend a claim based on evidence that inheritable genetic variations may result from: (1) new genetic combinations through meiosis, (2) viable errors occurring during replication, and/or (3) mutations caused by environmental factors.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS3.B: Variation of Traits",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS3-3",
        "description": "Apply concepts of statistics and probability to explain the variation and distribution of expressed traits in a population.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS3.B: Variation of Traits",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS4-2",
        "description": "Construct an explanation based on evidence that the process of evolution primarily results from four factors: (1) the potential for a species to increase in number, (2) the heritable genetic variation of individuals in a species due to mutation and sexual reproduction, (3) competition for limited resources, and (4) the proliferation of those organisms that are better able to survive and reproduce in the environment.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS4.B: Natural Selection",
        "discipline": "Life Science"
      },
      {
        "code": "HS-LS4-3",
        "description": "Apply concepts of statistics and probability to support explanations that organisms with an advantageous heritable trait tend to increase in proportion to organisms lacking this trait.",
        "gradeBand": "9-12",
        "disciplinaryCore": "LS4.B: Natural Selection",
        "discipline": "Life Science"
      }
    ],
    "k2bioshell": [],
    "adaptationlab": [],
    "celldivision": [],
    "earthhistory": [],
    "foodweb": [],
    "geoforge": [
      {
        "code": "5-ESS2-1",
        "description": "Develop a model using an example to describe ways the geosphere, biosphere, hydrosphere, and/or atmosphere interact.",
        "gradeBand": "3-5",
        "disciplinaryCore": "ESS2.A: Earth Materials and Systems",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "MS-ESS2-1",
        "description": "Develop a model to describe the cycling of Earth's materials and the flow of energy that drives this process.",
        "gradeBand": "6-8",
        "disciplinaryCore": "ESS2.A: Earth Materials and Systems",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "MS-ESS2-2",
        "description": "Construct an explanation based on evidence for how geoscience processes have changed Earth's surface at varying time and spatial scales.",
        "gradeBand": "6-8",
        "disciplinaryCore": "ESS2.A: Earth Materials and Systems",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "HS-ESS2-1",
        "description": "Develop a model to illustrate how Earth's internal and surface processes operate at different spatial and temporal scales to form continental and ocean-floor features.",
        "gradeBand": "9-12",
        "disciplinaryCore": "ESS2.A: Earth Materials and Systems",
        "discipline": "Earth & Space Science"
      },
      {
        "code": "HS-ESS2-2",
        "description": "Analyze geoscience data to make the claim that one change to Earth's surface can create feedbacks that cause changes to other Earth systems.",
        "gradeBand": "9-12",
        "disciplinaryCore": "ESS2.A: Earth Materials and Systems",
        "discipline": "Earth & Space Science"
      }
    ]
  },
  "priority_note": "Every edge in the export has priority \"high\", so priority doesn't rank these links.",
  "dataset": {
    "source": "https://play.quantumlearningmachines.com/api/labpath/dataset-export?dataset=learning-graph",
    "version": "1.0.0",
    "license": "CC-BY-4.0",
    "citation": "QLM LabPath Dataset v1.0, Quantum Learning Machines, 2026",
    "exported_at": "2026-10-24T01:17:05.905Z",
    "archived": "QLM LabPath Dataset v1.0, Zenodo, https://doi.org/10.5281/zenodo.21800324 (CC BY 4.0; the archived v1.0 holds the 423 released misconceptions)",
    "standards_source": "https://play.quantumlearningmachines.com/api/labpath/dataset-export?dataset=standards",
    "edges_in_export": 7737,
    "edges_by_kind": {
      "extension": 7,
      "reinforcement": 117,
      "transfer": 5486,
      "labpath-sequence": 2119,
      "prerequisite": 8
    },
    "standards_rows_in_export": 394
  },
  "does_not_show": [
    "Whether a particular student needs a step. This is LabPath's designed sequence, not evidence about a learner.",
    "How strong a link is. Priority is the export's coarse band of a tuned ranking, not a measured effect.",
    "An official alignment. Standards are LabPath's own mapping of its modes to NGSS-style codes, not a standards body's.",
    "The misconceptions themselves. Edges carry misconception ids; look them up with qlm_misconceptions."
  ]
}
```

