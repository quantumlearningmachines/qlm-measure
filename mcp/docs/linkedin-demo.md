# Learnlog MCP: LinkedIn demo script

A short screen recording. An assistant is asked what a tutoring dataset actually records about help. It calls the transformer and the inventory, and answers with the counts and what they can't show.

No video was recorded for this script. The tool outputs below are real: they come from one local run of the built server (`node scripts/demo-run.mjs`, which starts `dist/bin.js` over stdio with the MCP SDK client, exactly as Claude Desktop does) in the Linux workspace on Kumar's Mac (Node 22) on October 23, 2026. Run it again and only these values change: record IDs, salts, learner pseudonyms, hashes that depend on them, and timestamps. Every count stays the same.

The assistant's own words are not recorded here, because they vary from run to run. Under each prompt is what a correct answer says, taken from the outputs.

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
3. In a new chat, open the tools menu and check that the six Learnlog tools are listed.

## Scene 1: what does this tutoring dataset record about help?

**Prompt, exactly:**

> What does this tutoring dataset actually record about help? Use the TutorMoments sample that comes with Learnlog MCP. Convert it to Learnlog first, then give me the inventory and tell me what it can't show.

**Tool calls to expect:**

1. `learnlog_transform` with `{"format":"tutormoments","use_sample":true}`
2. `assistance_inventory` with `{"format":"tutormoments","use_sample":true}`

**What a correct answer says** (from the outputs below):

- It's 2 real tutoring sessions, 310 transcript turns (168 tutor, 142 student), from Ai2's TutorMoments-Preview, CC BY 4.0. The file matched the pinned public excerpt byte for byte.
- All six help stages are **not recorded**: requested, offered, generated, transmitted, displayed and accepted. The data keeps who spoke and what they said. A tutor turn isn't a help event.
- So this dataset can't give a help count or a help rate. "Not recorded" isn't "no help happened".
- It also can't show help from outside the session, or whether any help worked.

## Scene 2: what do the preprint's three datasets record?

**Prompt, exactly:**

> Now compare that with the three datasets in the Learnlog preprint. What does each one record about help?

**Tool call to expect:** `assistance_inventory` with `{}`. With no files given, it returns the preprint's published figures and says they weren't recomputed.

**What a correct answer says** (from the output below):

- The Zenodo hint study records requests and displays: 1,050 requests, 738 followed by a recorded display, 312 not (266 with an error).
- IDETrace records 59 chat queries. It has no display event; the episode rule counts a response as a display.
- Pooling the two gives 1,109 requests, 39.1% more than the 797 followed by a display.
- ASSISTments records 814,067 problems with help requested, and 110,513 problems where the system likely gave steps after a wrong answer. Those are candidates for the offered stage, not confirmed offers. Display isn't logged as its own event.
- None of this is a help rate or a learning effect.

Optional on-screen line: "Every number here is recomputed and matched exactly when you give the tool your own copies of the three datasets."

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
    "a4b58baf-4640-42ad-9620-29b618661372": {
      "seq": 149,
      "entry_hash": "f6364380949b992abdcc1c7bd86b496caa324af94350902555d59ed034b1c3c3"
    },
    "f6c4c3d8-fe08-4fef-a87f-1f5774f5e898": {
      "seq": 161,
      "entry_hash": "2ecfe9ea533e33730f3c53ed6c85e9deab1eaf4ecfd13c777738ad10da00c1e0"
    }
  },
  "pseudonyms": "Learner IDs are replaced with HMAC pseudonyms keyed by a random secret made when this server started. They don't match across restarts or other tools.",
  "preview": {
    "header": {
      "record_id": "a4b58baf-4640-42ad-9620-29b618661372",
      "subject": "qlm:a2ef2b4aec518063ccec31c53bae959c86673c588eefd72b6cf5ec7e41ab5075",
      "hash_alg": "sha-256",
      "created": "2026-10-24T00:13:21.021Z",
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
        "time": "2026-10-24T00:13:21.021Z",
        "event_hash": "1bcffbd21d17a4ccdbdd8063a03938c8220aaf231442344afb7a08104bebb132",
        "prev_hash": "8a2ca4ec4ca681ff2464344344ef21263320802aeceaa99b5738b9c5bf0c1319",
        "entry_hash": "e4b13a253a7cbc1079fdf0e2b710346f2227409026bd83e83081112108b7820a",
        "event": {
          "name": "qlm_import:dialogue_turn_observed",
          "salt": "2ze33I_usP28sMNiJ8bF2w",
          "data": {
            "provenance": {
              "platform": "tutormoments",
              "source_kind": "verified_public_sample",
              "source_sha256": "7df51fda0fff9c454ba14a33a0d2964d5e94b2556eff1d3897ec4f41373c8a66",
              "source_row": 1,
              "source_record_sha256": "61cbdc2ee22e5576471d7e6d1e9884b42a3cc937a27649b2fdc726c7871d8612",
              "imported_at": "2026-10-24T00:13:21.021Z",
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

