"""Airflow 3 TaskFlow workflow for the corrected assistance capture analysis."""
from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path

from airflow.sdk import dag, get_current_context, task
from qlm_airflow.capture_pipeline import execute


@dag(dag_id='learnlog_recorded_requests', start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
     schedule=None, catchup=False, max_active_runs=1, tags=['learnlog', 'assistance-capture'])
def learnlog_recorded_requests():
    @task
    def prepare():
        root = os.environ.get('QLM_PIPELINE_ROOT')
        if not root or not Path(root).is_absolute():
            raise ValueError('Set QLM_PIPELINE_ROOT to an absolute pipeline directory')
        context = get_current_context()
        conf = getattr(context.get('dag_run'), 'conf', None) or {}
        if not isinstance(conf, dict) or set(conf) - {'manifest'}:
            raise ValueError('Run configuration accepts only a relative manifest path')
        return {'root': root, 'manifest': conf.get('manifest', 'config/capture-synthetic.json'),
                'run_id': hashlib.sha256(context['run_id'].encode()).hexdigest()[:24]}

    @task(retries=2)
    def transform_and_analyze(config):
        return execute(**config)

    @task
    def check_summary(summary):
        if summary.get('shared_query_results_identical') is not True:
            raise ValueError('Shared query verification failed')
        return summary

    check_summary(transform_and_analyze(prepare()))


learnlog_recorded_requests()
