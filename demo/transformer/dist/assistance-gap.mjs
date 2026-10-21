/**
 * Isolated, synthetic explanation of assistance-stage ambiguity.
 * No imports from the transformer, source adapters or aggregation engine.
 * These examples are not evidence about a product or a research participant.
 */
import PROFILE_BINDING_EXAMPLES from './assistance-profile-examples.mjs';

const CARRIERS = Object.freeze({
  contract: 'assistance_capture',
  xapi_statement: 'xapi_statement',
  caliper_event: 'caliper_event',
  caliper_envelope: 'caliper_envelope'
});

/** Select packaged Python output. This function performs no carrier conversion. */
export function selectBindingExample(lifecycle, carrier, packaged = PROFILE_BINDING_EXAMPLES) {
  if (!Object.hasOwn(METRICS, lifecycle) || !Object.hasOwn(CARRIERS, carrier)) {
    throw new TypeError('Unknown binding illustration or representation.');
  }
  const example = packaged?.examples?.[lifecycle];
  const value = example?.[CARRIERS[carrier]];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('The packaged binding example is unavailable.');
  }
  return value;
}
const METRICS = Object.freeze({
  requested: Object.freeze({singular:'request', plural:'requests', status:'request', explanation:'A recorded request does not establish generation, display, reading or learning.'}),
  generated: Object.freeze({singular:'generation', plural:'generations', status:'generation', explanation:'A generated response does not establish display, reading or learning.'}),
  displayed: Object.freeze({singular:'display', plural:'displays', status:'display', explanation:'A display acknowledgement does not establish reading or learning.'})
});

export const ASSISTANCE_EXAMPLES = Object.freeze([
  Object.freeze({id:'synthetic-request', label:'hint', lifecycle:'requested', synthetic:true, empiricalAggregateEligible:false,
    capture:Object.freeze({capabilities:Object.freeze(['requested']), boundary:'Help-request control only; outside assistance is not collected.'})}),
  Object.freeze({id:'synthetic-generation', label:'hint', lifecycle:'generated', synthetic:true, empiricalAggregateEligible:false,
    capture:Object.freeze({capabilities:Object.freeze(['generated']), boundary:'Server generation only; browser display and outside assistance are not collected.'})}),
  Object.freeze({id:'synthetic-display', label:'hint', lifecycle:'displayed', synthetic:true, empiricalAggregateEligible:false,
    capture:Object.freeze({capabilities:Object.freeze(['displayed']), boundary:'Interface display acknowledgement only; reading, learning and outside assistance are not collected.'})})
]);

export function assessAssistanceMetric(metric, records = ASSISTANCE_EXAMPLES) {
  if (!Object.hasOwn(METRICS, metric)) throw new TypeError('Unknown assistance metric.');
  if (!Array.isArray(records)) throw new TypeError('Illustrative records must be an array.');
  const ids = new Set();
  const observations = records.map(record => {
    if (!record || record.synthetic !== true || record.empiricalAggregateEligible !== false ||
        typeof record.id !== 'string' || !record.id || ids.has(record.id) ||
        !Object.hasOwn(METRICS, record.lifecycle) || !Array.isArray(record.capture?.capabilities) ||
        record.capture.capabilities.length !== 1 || record.capture.capabilities[0] !== record.lifecycle) {
      throw new TypeError('Expected a uniquely identified, single-hook synthetic assistance observation.');
    }
    ids.add(record.id);
    const supported = record.lifecycle === metric;
    return Object.freeze({id:record.id, state:supported ? 'observed' : 'not_collected', value:supported ? 1 : null,
      reason:supported ? `One ${METRICS[metric].singular} observation is recorded.` :
        `This instrument does not collect ${METRICS[metric].plural}; absence is not zero.`});
  });
  const observedCount = observations.filter(row => row.state === 'observed').length;
  return Object.freeze({origin:'synthetic_illustration', empiricalAggregateEligible:false, metric,
    observedCount, unknownRecordCount:observations.length-observedCount,
    totalOccurrenceCount:null, observations:Object.freeze(observations)});
}

function initializeAssistanceGap(document) {
  const explorer = document.querySelector('[data-assistance-gap]');
  if (!explorer) return;
  const count = document.getElementById('gap-supported-count');
  const detail = document.getElementById('gap-supported-detail');
  const unjustified = document.getElementById('gap-unjustified-detail');
  const render = metric => {
    const result = assessAssistanceMetric(metric);
    const term = METRICS[metric];
    count.textContent = `At least ${result.observedCount} ${result.observedCount === 1 ? term.singular : term.plural} ${result.observedCount === 1 ? 'is' : 'are'} recorded.`;
    detail.textContent = `${result.unknownRecordCount} records cannot establish ${term.status}. Their missing ${term.status} observations remain unknown, not zero. This is an observed count, not a complete total.`;
    unjustified.textContent = `Adding the three “hint” fields mixes different stages. ${term.explanation}`;
    for (const observation of result.observations) {
      const card = explorer.querySelector(`[data-gap-record="${observation.id}"]`);
      const status = card.querySelector('[data-gap-status]');
      const supported = observation.state === 'observed';
      status.textContent = supported ? `One ${term.singular} observed` : `${term.status[0].toUpperCase()+term.status.slice(1)} unknown`;
      status.classList.toggle('supported', supported);
      const record = ASSISTANCE_EXAMPLES.find(row => row.id === observation.id);
      card.querySelector('[data-gap-json]').textContent = JSON.stringify({illustration:'synthetic', representation:'illustrative_not_a_conformance_record', label:record.label,
        observed_lifecycle:record.lifecycle, capture:record.capture,
        selected_measure:{metric, state:observation.state, value:observation.value, reason:observation.reason},
        outside_assistance:{state:'not_collected'}, empirical_aggregate_eligible:false}, null, 2);
    }
  };
  explorer.addEventListener('change', event => {
    if (event.target.matches('input[name="gap-metric"]') && event.target.checked) render(event.target.value);
  });
  render(explorer.querySelector('input[name="gap-metric"]:checked').value);

  const recordPicker = document.getElementById('binding-record');
  const carrierPicker = document.getElementById('binding-carrier');
  if (!recordPicker || !carrierPicker) return;
  const renderBinding = () => {
    const lifecycle = recordPicker.value;
    const carrier = carrierPicker.value;
    const selected = selectBindingExample(lifecycle, carrier);
    const capture = selectBindingExample(lifecycle, 'contract');
    const sourceTime = capture.assistance?.event_time?.utc;
    const hostTime = selectBindingExample(lifecycle, 'xapi_statement').timestamp;
    document.getElementById('binding-source-time').textContent = sourceTime?.state === 'observed'
      ? `${sourceTime.value} — source assertion, separate from the import.`
      : `${sourceTime?.state || 'unknown'} — no source time is invented.`;
    document.getElementById('binding-host-time').textContent = `${hostTime} — software import observation.`;
    document.getElementById('binding-code').textContent = JSON.stringify(selected, null, 2);
    document.getElementById('binding-status').textContent =
      `SYNTHETIC ${lifecycle} fixture · ${carrier === 'contract' ? 'capture agreement' : 'importer observation carrier'} · excluded from the empirical aggregate.`;
  };
  recordPicker.addEventListener('change', renderBinding);
  carrierPicker.addEventListener('change', renderBinding);
  renderBinding();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initializeAssistanceGap(document), {once:true});
  else initializeAssistanceGap(document);
}
