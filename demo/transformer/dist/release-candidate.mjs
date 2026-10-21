import RELEASE from './release-candidate-data.mjs';

export function releaseDetails(data = RELEASE) {
  if (data.status !== 'prepared' || data.source_published !== false || data.preprint_published !== false) {
    throw new TypeError('This candidate requires an explicit unpublished release state.');
  }
  const download = data.downloads?.['qlm-transformer-airflow.zip'];
  if (!download || !/^[a-f0-9]{64}$/.test(download.sha256) || !Number.isSafeInteger(download.bytes) || download.bytes <= 0) {
    throw new TypeError('Download checksum and size are required.');
  }
  return {status:'Prepared release candidate',
    versions:`Transformer ${data.transformer_version} · Airflow pipeline ${data.pipeline_version}`,
    download:`${(download.bytes/1024).toFixed(0)} KB · SHA-256 ${download.sha256.slice(0,16)}…`,
    source:'Prepared for the QLM Measure repository. Public source release is pending.'};
}

export function mountRelease(document, data = RELEASE) {
  const view=releaseDetails(data);
  for (const [id,text] of [['release-state',view.status],['release-versions',view.versions],
    ['airflow-download-meta',view.download],['release-source-state',view.source]]) {
    const element=document.getElementById(id);if(element)element.textContent=text;
  }
}

if (typeof document !== 'undefined') {
  try { mountRelease(document); }
  catch { const element=document.getElementById('release-state');if(element)element.textContent='Release metadata unavailable'; }
}
