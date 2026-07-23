"""
Dataset and engine clients — Python mirror.
"""

from __future__ import annotations
import json
from typing import Any, Optional
from urllib.request import urlopen, Request
from urllib.parse import urlencode


class OntologyClient:
    """Typed wrapper over the QLM dataset export API. Zero-auth."""

    def __init__(self, base_url: str = "https://play.quantumlearningmachines.com"):
        self.base_url = base_url

    def fetch_dataset(
        self,
        dataset: str,
        domain: Optional[str] = None,
        fmt: Optional[str] = None,
    ) -> Any:
        params = {"dataset": dataset}
        if domain:
            params["domain"] = domain
        if fmt:
            params["format"] = fmt

        url = f"{self.base_url}/api/labpath/dataset-export?{urlencode(params)}"
        req = Request(url, headers={"Accept": "application/json"})
        with urlopen(req) as resp:
            return json.loads(resp.read().decode())

    def get_misconceptions(self, domain: Optional[str] = None) -> list[dict]:
        data = self.fetch_dataset("misconceptions", domain=domain)
        return data.get("misconceptions", data) if isinstance(data, dict) else data

    def get_learning_graph(self, domain: Optional[str] = None) -> list[dict]:
        data = self.fetch_dataset("learning-graph", domain=domain)
        return data.get("learningGraph", data) if isinstance(data, dict) else data

    def get_standards(self, domain: Optional[str] = None) -> list[dict]:
        data = self.fetch_dataset("standards", domain=domain)
        return data.get("standardsAlignment", data) if isinstance(data, dict) else data


class EngineClient:
    """
    Commercial boundary for the QLM measurement engine.

    The estimation service is QLM's hosted engine. This client wraps
    the API for submitting observations and retrieving state.
    """

    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url
        self.api_key = api_key

    def _request(self, method: str, path: str, body: Optional[dict] = None) -> dict:
        url = f"{self.base_url}{path}"
        data = json.dumps(body).encode() if body else None
        req = Request(
            url,
            data=data,
            method=method,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
        )
        with urlopen(req) as resp:
            return json.loads(resp.read().decode())

    def update_student_model(self, observation: dict) -> dict:
        return self._request("POST", "/api/student-model/update", observation)

    def get_state(self, student_id: str) -> dict:
        return self._request("GET", f"/api/student-model/state?studentId={student_id}")
