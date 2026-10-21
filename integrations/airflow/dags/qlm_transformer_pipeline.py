"""Apache Airflow 3 TaskFlow entry point. Artifact data never enters XCom."""
import hashlib
import os
from datetime import datetime, timezone
from pathlib import Path

from airflow.sdk import Variable, dag, get_current_context, task
from qlm_airflow.pipeline import aggregate, plan, transform_dataset


@dag(dag_id="qlm_transformer_exports", start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
     schedule=None, catchup=False, max_active_runs=1, tags=["qlm", "learnlog", "local-demo"])
def qlm_transformer_exports():
    @task(multiple_outputs=False)
    def prepare():
        root = os.environ.get("QLM_PIPELINE_ROOT")
        if not root or not Path(root).is_absolute():
            raise ValueError("set QLM_PIPELINE_ROOT to the absolute extracted package directory")
        context = get_current_context()
        dag_run = context.get("dag_run")
        configuration = getattr(dag_run, "conf", None) or {}
        if not isinstance(configuration, dict) or any(name != "manifest" for name in configuration):
            raise ValueError("DAG run configuration accepts only a relative manifest path")
        manifest = configuration.get("manifest", os.environ.get("QLM_PIPELINE_MANIFEST", "config/demo.json"))
        # Filename-safe opaque run identifier; secrets and rows are never returned.
        run_id = hashlib.sha256(context["run_id"].encode()).hexdigest()[:24]
        return {"root": root, "manifest": manifest, "run_id": run_id, "dataset_ids": plan(root, manifest)}

    @task(multiple_outputs=False, retries=2)
    def convert(config, dataset_id):
        # Variable.get is deferred until task execution and can use a configured
        # Airflow Secrets Backend. The value stays in this worker process.
        return transform_dataset(config["root"], config["manifest"], config["run_id"], dataset_id,
                                 key_provider=lambda: Variable.get("qlm_transformer_pseudonym_key_b64"))

    @task(multiple_outputs=False)
    def dataset_ids(config):
        return config["dataset_ids"]

    @task(multiple_outputs=False)
    def combine(config, artifacts):
        return aggregate(config["root"], config["manifest"], config["run_id"], list(artifacts))

    prepared = prepare()
    converted = convert.partial(config=prepared).expand(dataset_id=dataset_ids(prepared))
    combine(prepared, converted)


qlm_transformer_exports()
