// Versioned application profile. JSON companion must remain byte-semantically equal (tested).
export const ASSISTANCE_CONTEXT_PROFILE = {
  "$id": "https://transformer.quantumlearningmachines.com/schemas/assistance-context-v0.1.0.json",
  "profile_id": "qlm:assistance-context:0.1.0",
  "version": "0.1.0",
  "status": "proposed_application_profile_not_ietf_standard",
  "context_fields": {
    "phase": {
      "values": [
        "practice",
        "assessment",
        "other",
        "unknown"
      ],
      "default": "unknown",
      "definition": "Declared activity phase; not inferred from task content or scores."
    },
    "permission": {
      "values": [
        "permitted",
        "prohibited",
        "restricted",
        "unknown"
      ],
      "default": "unknown",
      "definition": "Declared assistance policy; permission is not observation of use."
    },
    "observed_use": {
      "values": [
        "recorded",
        "not_recorded",
        "unknown"
      ],
      "default": "unknown",
      "definition": "Source assertion about recording assistance use within its capture boundary; not_recorded is not proof of absence."
    },
    "capture": {
      "values": [
        "complete_within_boundary",
        "partial",
        "unknown"
      ],
      "default": "unknown",
      "definition": "Declared instrument coverage within an explicit boundary; outside help remains unobserved."
    },
    "capture_boundary": {
      "type": "nullable_string",
      "default": null,
      "definition": "Source-declared system, event classes and period within which coverage is asserted.",
      "max_length": 2000
    },
    "product_version": {
      "type": "nullable_string",
      "default": null,
      "definition": "Version reported by source; absence remains unknown.",
      "max_length": 2000
    },
    "model_version": {
      "type": "nullable_string",
      "default": null,
      "definition": "AI model version reported by source; absence remains unknown.",
      "max_length": 2000
    }
  },
  "event_types": {
    "help_requested": "Source explicitly records a request; no delivery is inferred.",
    "help_generated": "Source explicitly records creation of assistance; transmission is not inferred.",
    "help_transmitted": "Source explicitly records transmission; display is not inferred.",
    "help_displayed": "Source explicitly records display; reading, understanding and learning are not inferred.",
    "learner_response_observed": "Source explicitly records a subsequent learner action; causal benefit and understanding are not inferred."
  },
  "semantics": {
    "tutormoments": {
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
    "oatutor": {
      "contract_version": "0.1.0",
      "review": {
        "status": "implementation_checked_not_independently_reviewed",
        "scope": "Executable mapping checks do not establish semantic validity or educational effectiveness."
      },
      "original_event_time": "Preserve source timestamp or relative offsets separately. Import entry time is the importer observation time. Missing absolute source timestamps remain null.",
      "source_unit": "participant_summary",
      "target_unit": "participant_summary",
      "measurement_profile": null,
      "denominator": null,
      "coverage": {
        "status": "unknown",
        "boundary": "Participant summary table; no individual assistance timeline."
      },
      "coding_method": "source_assigned_condition_and_reported_metric_strings",
      "definition": "One participant table row is imported as one observed summary. Assigned hint condition is not observed use.",
      "transformations": [
        "HMAC-scope known learner identifier",
        "Retain original reported metric strings and missing values",
        "Record importer observation time; original event clock is unknown"
      ],
      "information_loss": [
        "Known participant identifier is excluded from event data",
        "No help requests, generated hints, transmissions or displays are recoverable from summary rows"
      ],
      "pooling_limit": "Assigned conditions and reported outcomes do not enter assistance-event or coded-interval denominators."
    },
    "explicit-assistance-events": {
      "contract_version": "0.1.0",
      "review": {
        "status": "implementation_checked_not_independently_reviewed",
        "scope": "Executable mapping checks do not establish semantic validity or educational effectiveness."
      },
      "original_event_time": "Preserve source timestamp or relative offsets separately. Import entry time is the importer observation time. Missing absolute source timestamps remain null.",
      "source_unit": "explicit_source_event",
      "target_unit": "assistance_lifecycle_event",
      "measurement_profile": "qlm:explicit-assistance-lifecycle-counts:0.1.0",
      "denominator": "Distinct native event identities within one declared capture boundary and active source revision; counts stratified by event_type.",
      "coverage": {
        "status": "source_declared",
        "boundary": null
      },
      "coding_method": "explicit_source_event_type_no_text_classifier",
      "definition": "One explicit source lifecycle assertion is imported as one observation. Lifecycle states remain separate; no state implies a later one.",
      "transformations": [
        "Scope learner pseudonym to adapter, source_id, tenant and key",
        "Preserve source event_id, revision, lifecycle type, assistance/request links and optional timestamp",
        "Normalize declared context with unknown defaults; no text-based inference"
      ],
      "information_loss": [
        "Known learner source identifier is not copied into event data",
        "Unknown source fields are excluded",
        "A matching input shape establishes neither source authenticity nor measurement validity"
      ],
      "pooling_limit": "Requires independently reviewed compatible source mappings, lifecycle definitions, units, denominators, coding and capture coverage. Synthetic fixtures cannot support empirical product claims."
    }
  },
  "pooling": "Compatibility is a conservative descriptive screen, not a transportability proof, independence assumption or causal inference license."
};
export const IMPORT_EVENT_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://transformer.quantumlearningmachines.com/schemas/research-import-v2.json",
  "title": "QLM research-import event extension, version 2",
  "description": "Importer observations of historical source records. Actor is the importer; historical speaker stays in dialogue. Source absolute time is null when unreported. Integrity bindings do not establish semantic validity.",
  "type": "object",
  "required": [
    "name",
    "salt",
    "data",
    "activity",
    "actor"
  ],
  "properties": {
    "name": {
      "enum": [
        "qlm_import:dialogue_turn_observed",
        "qlm_import:participant_summary_observed"
      ]
    },
    "salt": {
      "type": "string",
      "minLength": 1
    },
    "actor": {
      "type": "object",
      "required": [
        "role",
        "kind",
        "id"
      ],
      "properties": {
        "role": {
          "const": "system"
        },
        "kind": {
          "const": "software"
        },
        "id": {
          "const": "QLM-transformer"
        }
      },
      "additionalProperties": false
    },
    "activity": {
      "type": "object",
      "required": [
        "id"
      ],
      "properties": {
        "id": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "data": {
      "type": "object",
      "required": [
        "provenance",
        "time_basis",
        "raw_source_fields",
        "reported_metrics",
        "missing_metrics",
        "assistance",
        "original_source_timestamp",
        "assistance_context"
      ],
      "properties": {
        "provenance": {
          "type": "object",
          "required": [
            "platform",
            "source_sha256",
            "source_row",
            "imported_at",
            "mapping_sha256"
          ],
          "properties": {
            "platform": {
              "enum": [
                "tutormoments",
                "oatutor"
              ]
            },
            "source_sha256": {
              "$ref": "#/$defs/hash"
            },
            "mapping_sha256": {
              "$ref": "#/$defs/hash"
            },
            "source_record_sha256": {
              "$ref": "#/$defs/hash"
            },
            "source_file_sha256": {
              "$ref": "#/$defs/hash"
            },
            "source_row": {
              "type": "integer",
              "minimum": 1
            },
            "source_file_row": {
              "type": "integer",
              "minimum": 1
            },
            "imported_at": {
              "type": "string",
              "format": "date-time"
            },
            "source_field_path": {
              "type": "string"
            },
            "source_kind": {
              "enum": [
                "verified_public_sample",
                "unverified_user_input"
              ]
            }
          }
        },
        "time_basis": {
          "const": "import_time"
        },
        "source_time_basis": {
          "const": "relative_offsets_seconds"
        },
        "raw_source_fields": {
          "type": "object"
        },
        "reported_metrics": {
          "type": "object"
        },
        "missing_metrics": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "uniqueItems": true
        },
        "assistance": {
          "enum": [
            "tutor_utterance_recorded",
            "student_utterance_recorded",
            "assigned_condition_only"
          ]
        },
        "dialogue": {
          "type": "object",
          "required": [
            "role",
            "text",
            "turn_number",
            "start_seconds",
            "end_seconds"
          ],
          "additionalProperties": false,
          "properties": {
            "role": {
              "enum": [
                "Student",
                "Tutor"
              ]
            },
            "text": {
              "type": "string"
            },
            "turn_number": {
              "type": "integer",
              "minimum": 1
            },
            "start_seconds": {
              "type": "number",
              "minimum": 0
            },
            "end_seconds": {
              "type": "number",
              "minimum": 0
            }
          }
        },
        "help_evidence": {
          "type": "object",
          "required": [
            "condition",
            "actual_help_use"
          ],
          "properties": {
            "condition": {
              "enum": [
                "ChatGPT",
                "Human tutor",
                "No-hint control"
              ]
            },
            "actual_help_use": {
              "enum": [
                "not_reported_in_participant_table",
                "not_established_by_this_adapter"
              ]
            }
          }
        },
        "original_source_timestamp": {
          "type": "null"
        },
        "assistance_context": {
          "type": "object",
          "required": [
            "phase",
            "permission",
            "observed_use",
            "capture",
            "capture_boundary",
            "product_version",
            "model_version"
          ],
          "additionalProperties": false,
          "properties": {
            "phase": {
              "enum": [
                "practice",
                "assessment",
                "other",
                "unknown"
              ]
            },
            "permission": {
              "enum": [
                "permitted",
                "prohibited",
                "restricted",
                "unknown"
              ]
            },
            "observed_use": {
              "enum": [
                "recorded",
                "not_recorded",
                "unknown"
              ]
            },
            "capture": {
              "enum": [
                "complete_within_boundary",
                "partial",
                "unknown"
              ]
            },
            "capture_boundary": {
              "type": [
                "string",
                "null"
              ],
              "minLength": 1,
              "maxLength": 2000
            },
            "product_version": {
              "type": [
                "string",
                "null"
              ],
              "minLength": 1,
              "maxLength": 2000
            },
            "model_version": {
              "type": [
                "string",
                "null"
              ],
              "minLength": 1,
              "maxLength": 2000
            }
          },
          "allOf": [
            {
              "if": {
                "properties": {
                  "capture": {
                    "const": "complete_within_boundary"
                  }
                }
              },
              "then": {
                "properties": {
                  "capture_boundary": {
                    "type": "string",
                    "minLength": 1
                  }
                }
              }
            }
          ]
        }
      }
    }
  },
  "$defs": {
    "hash": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    }
  },
  "allOf": [
    {
      "if": {
        "properties": {
          "name": {
            "const": "qlm_import:dialogue_turn_observed"
          }
        }
      },
      "then": {
        "properties": {
          "data": {
            "required": [
              "dialogue",
              "source_time_basis"
            ],
            "properties": {
              "assistance": {
                "enum": [
                  "tutor_utterance_recorded",
                  "student_utterance_recorded"
                ]
              },
              "reported_metrics": {
                "maxProperties": 0
              },
              "missing_metrics": {
                "maxItems": 0
              }
            }
          }
        }
      }
    },
    {
      "if": {
        "properties": {
          "name": {
            "const": "qlm_import:participant_summary_observed"
          }
        }
      },
      "then": {
        "properties": {
          "data": {
            "required": [
              "help_evidence"
            ],
            "properties": {
              "assistance": {
                "enum": [
                  "assigned_condition_only"
                ]
              }
            }
          }
        }
      }
    }
  ]
};
export const LIFECYCLE_EVENT_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://transformer.quantumlearningmachines.com/schemas/assistance-lifecycle-v1.json",
  "title": "Explicit assistance lifecycle import, version 1",
  "description": "Importer observation of an explicit source lifecycle assertion. Display is not reading or learning. Fixtures are not research data.",
  "type": "object",
  "required": [
    "name",
    "salt",
    "actor",
    "activity",
    "data"
  ],
  "properties": {
    "name": {
      "const": "qlm_import:assistance_lifecycle_observed"
    },
    "salt": {
      "type": "string",
      "minLength": 1
    },
    "actor": {
      "type": "object",
      "required": [
        "role",
        "kind",
        "id"
      ],
      "properties": {
        "role": {
          "const": "system"
        },
        "kind": {
          "const": "software"
        },
        "id": {
          "const": "QLM-transformer"
        }
      },
      "additionalProperties": false
    },
    "activity": {
      "type": "object",
      "required": [
        "id"
      ],
      "properties": {
        "id": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "data": {
      "type": "object",
      "required": [
        "provenance",
        "time_basis",
        "original_source_timestamp",
        "raw_source_fields",
        "reported_metrics",
        "missing_metrics",
        "assistance",
        "lifecycle",
        "assistance_context"
      ],
      "properties": {
        "time_basis": {
          "const": "import_time"
        },
        "original_source_timestamp": {
          "type": [
            "string",
            "null"
          ],
          "format": "date-time"
        },
        "assistance": {
          "enum": [
            "help_requested",
            "help_generated",
            "help_transmitted",
            "help_displayed",
            "learner_response_observed"
          ]
        },
        "lifecycle": {
          "type": "object",
          "required": [
            "source_id",
            "event_id",
            "source_revision",
            "event_type",
            "source_timestamp",
            "assistance_id",
            "request_event_id",
            "request_origin",
            "native_hint_depth",
            "delivery_order"
          ],
          "properties": {
            "source_id": {
              "type": "string",
              "minLength": 1
            },
            "event_id": {
              "type": "string",
              "minLength": 1
            },
            "source_revision": {
              "type": "integer",
              "minimum": 0
            },
            "event_type": {
              "enum": [
                "help_requested",
                "help_generated",
                "help_transmitted",
                "help_displayed",
                "learner_response_observed"
              ]
            },
            "source_timestamp": {
              "type": [
                "string",
                "null"
              ],
              "format": "date-time"
            },
            "assistance_id": {
              "type": [
                "string",
                "null"
              ]
            },
            "request_event_id": {
              "type": [
                "string",
                "null"
              ]
            },
            "content": {
              "type": "string"
            },
            "request_origin": {
              "enum": [
                "requested",
                "unsolicited",
                "unknown"
              ],
              "description": "Explicit declared origin; absent request link does not establish unsolicited help."
            },
            "native_hint_depth": {
              "type": [
                "string",
                "integer",
                "null"
              ],
              "minimum": 0,
              "description": "Source depth or label; never mapped to Learnlog delivery order."
            },
            "delivery_order": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 1,
              "description": "Source-declared delivery sequence; not inferred from native hint depth."
            }
          },
          "additionalProperties": false
        },
        "assistance_context": {
          "type": "object",
          "required": [
            "phase",
            "permission",
            "observed_use",
            "capture",
            "capture_boundary",
            "product_version",
            "model_version"
          ],
          "additionalProperties": false,
          "properties": {
            "phase": {
              "enum": [
                "practice",
                "assessment",
                "other",
                "unknown"
              ]
            },
            "permission": {
              "enum": [
                "permitted",
                "prohibited",
                "restricted",
                "unknown"
              ]
            },
            "observed_use": {
              "enum": [
                "recorded",
                "not_recorded",
                "unknown"
              ]
            },
            "capture": {
              "enum": [
                "complete_within_boundary",
                "partial",
                "unknown"
              ]
            },
            "capture_boundary": {
              "type": [
                "string",
                "null"
              ],
              "minLength": 1,
              "maxLength": 2000
            },
            "product_version": {
              "type": [
                "string",
                "null"
              ],
              "minLength": 1,
              "maxLength": 2000
            },
            "model_version": {
              "type": [
                "string",
                "null"
              ],
              "minLength": 1,
              "maxLength": 2000
            }
          },
          "allOf": [
            {
              "if": {
                "properties": {
                  "capture": {
                    "const": "complete_within_boundary"
                  }
                }
              },
              "then": {
                "properties": {
                  "capture_boundary": {
                    "type": "string",
                    "minLength": 1
                  }
                }
              }
            }
          ]
        },
        "provenance": {
          "type": "object"
        },
        "reported_metrics": {
          "type": "object",
          "maxProperties": 0
        },
        "missing_metrics": {
          "type": "array",
          "maxItems": 0
        },
        "raw_source_fields": {
          "type": "object"
        }
      }
    }
  }
};


function deepFreeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))deepFreeze(child);Object.freeze(value);}return value;}
deepFreeze(ASSISTANCE_CONTEXT_PROFILE);deepFreeze(IMPORT_EVENT_SCHEMA);deepFreeze(LIFECYCLE_EVENT_SCHEMA);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const copy=value=>JSON.parse(JSON.stringify(value));
export const SEMANTIC_PROFILE_ID=ASSISTANCE_CONTEXT_PROFILE.profile_id;
export const SEMANTIC_PROFILE_VERSION=ASSISTANCE_CONTEXT_PROFILE.version;
export const ASSISTANCE_EVENT_TYPES=Object.keys(ASSISTANCE_CONTEXT_PROFILE.event_types);
/** Normalize declared context only. No inference from assignment, wording or scores. */
export function normalizeContext(input={}) {
  if(!object(input))throw new Error('Assistance context must be an object.');
  const output={};
  for(const key of Object.keys(input))if(!Object.hasOwn(ASSISTANCE_CONTEXT_PROFILE.context_fields,key))throw new Error('Unsupported assistance context field: '+key+'.');
  for(const [key,definition]of Object.entries(ASSISTANCE_CONTEXT_PROFILE.context_fields)){
    const value=Object.hasOwn(input,key)?input[key]:definition.default;
    if(definition.values){if(!definition.values.includes(value))throw new Error('Unsupported assistance context '+key+'.');}
    else if(value!==null&&(typeof value!=='string'||!value.trim()||Array.from(value).length>2000))throw new Error('Assistance context '+key+' must be nonempty text or null.');
    output[key]=value;
  }
  if(output.capture==='complete_within_boundary'&&!output.capture_boundary)throw new Error('Complete capture requires an explicit capture_boundary.');
  return output;
}
export function getSemanticContract(profileId) {
  const contract=ASSISTANCE_CONTEXT_PROFILE.semantics[profileId];
  if(!contract)throw new Error('No versioned semantic mapping for this adapter.');
  return copy(contract);
}
function poolingInputs(items){
  return items.map((item,index)=>{
    if(!object(item))return {source_id:null,invalid_descriptor:true};
    if(item.profile){
      const contexts=(Array.isArray(item.records)?item.records:[]).flatMap(record=>(Array.isArray(record.entries)?record.entries:[]).map(entry=>entry.event?.data?.assistance_context));
      const first=contexts[0]||normalizeContext();
      const consistent=contexts.every(context=>JSON.stringify(context)===JSON.stringify(first));
      return {source_id:item.sourceNamespace||item.profile.id,source_kind:item.sourceKind,mapping:item.semanticContract||(ASSISTANCE_CONTEXT_PROFILE.semantics[item.profile.id]?getSemanticContract(item.profile.id):{}),context:first,context_consistent:consistent};
    }
    return {...item,source_id:item.source_id??null};
  });
}
/** A conservative, explicit screen. It cannot establish causal comparability. */
export function assessPoolingCompatibility(items) {
  if(!Array.isArray(items))throw new Error('Pooling inputs must be an array.');
  const sources=poolingInputs(items),reasons=[],strata=[];
  const fields=['measurement_profile','target_unit','denominator','coding_method','definition'];
  let reference=null;
  for(const source of sources){
    const mapping=object(source.mapping)?source.mapping:{},local=[];
    if(source.invalid_descriptor||!object(source.mapping))local.push({code:'invalid_descriptor',detail:'A structured mapping descriptor is required.'});
    if(typeof source.source_id!=='string'||!source.source_id.trim())local.push({code:'source_id_unknown',detail:'A nonempty source stratum identity is required.'});
    if(source.source_kind==='synthetic_fixture')local.push({code:'synthetic_fixture',detail:'Synthetic contract fixtures cannot enter empirical pooled measurement.'});
    if(source.context_consistent===false)local.push({code:'context_mixed',detail:'Input contexts vary; stratify before considering pooling.'});
    if(!object(mapping.review)||mapping.review.status!=='independently_reviewed')local.push({code:'mapping_unreviewed',detail:'Mapping has not been independently reviewed for semantic validity.'});
    else if(!['reviewer','scope','reference'].every(key=>typeof mapping.review[key]==='string'&&mapping.review[key].trim())||!/^https:\/\//.test(mapping.review.reference))local.push({code:'review_documentation_missing',detail:'An independent review declaration requires reviewer, scope and an HTTPS review-record reference.'});
    for(const key of ['source_unit'])if(typeof mapping[key]!=='string'||!mapping[key].trim())local.push({code:key+'_unknown',detail:'Mapping '+key+' must be defined explicitly.'});
    for(const key of ['transformations','information_loss'])if(!Array.isArray(mapping[key])||(key==='transformations'&&!mapping[key].length)||mapping[key].some(value=>typeof value!=='string'||!value.trim()))local.push({code:key+'_unknown',detail:'Mapping '+key+' must be an explicit list of nonempty descriptions.'});
    for(const field of fields)if(typeof mapping[field]!=='string'||!mapping[field].trim())local.push({code:field+'_unknown',detail:'A shared '+field+' is not established.'});
    if(!object(mapping.coverage)||mapping.coverage.status!=='complete_within_boundary'||typeof mapping.coverage.boundary!=='string'||!mapping.coverage.boundary.trim())local.push({code:'coverage_not_established',detail:'Comparable capture coverage within an explicit boundary is not established.'});
    const signature=Object.fromEntries(fields.map(field=>[field,mapping[field]??null]));
    signature.coverage=object(mapping.coverage)?{status:mapping.coverage.status??null,boundary:mapping.coverage.boundary??null}:null;
    if(source.context){
      try{const context=normalizeContext(source.context);
      signature.context={phase:context.phase,permission:context.permission,observed_use:context.observed_use,capture:context.capture,capture_boundary:context.capture_boundary};
      if(context.phase==='unknown'||context.permission==='unknown'||context.observed_use==='unknown'||context.capture!=='complete_within_boundary')local.push({code:'context_unknown',detail:'Phase, permitted assistance, observed-use scope and bounded capture must be established or explicitly stratified.'});
      }catch{local.push({code:'context_invalid',detail:'Declared assistance context is malformed.'});}
    }else local.push({code:'context_unknown',detail:'No activity and assistance context was supplied.'});
    if(reference){
      for(const field of fields)if(signature[field]!==reference[field])local.push({code:field+'_incompatible',detail:field+' differs from the first selected source.'});
      if(JSON.stringify(signature.coverage)!==JSON.stringify(reference.coverage))local.push({code:'coverage_incompatible',detail:'Capture boundaries or coverage declarations differ.'});
      if(JSON.stringify(signature.context)!==JSON.stringify(reference.context))local.push({code:'context_incompatible',detail:'Activity or assistance contexts differ; preserve source/context strata.'});
    }else reference=signature;
    const stratum={source_id:source.source_id,source_kind:source.source_kind||'unverified_user_input',mapping_review:mapping.review?.status||'unknown',signature,reasons:local};
    strata.push(stratum);for(const reason of local)reasons.push({source_id:source.source_id,...reason});
  }
  if(new Set(sources.map(source=>source.source_id).filter(value=>typeof value==='string'&&value.trim())).size<2)reasons.push({source_id:null,code:'multiple_sources_required',detail:'At least two distinct source strata are required for a pooling decision.'});
  const eligible=sources.length>=2&&reasons.length===0;
  return {profile_id:'qlm:pooling-compatibility:0.1.0',eligible,status:eligible?'eligible_for_descriptive_pooling':'blocked',source_strata:strata,reasons,limitations:['This screen checks declared compatibility; it does not validate declarations or mappings.','Eligibility does not establish independent observations, equivalent learning constructs, transportability or causal effects.','Do not add heterogeneous counts or treat missing assistance data as zero.']};
}
