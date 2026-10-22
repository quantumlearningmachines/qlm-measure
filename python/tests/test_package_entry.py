"""The package entry point: its version, the verify dispatch by schemaVersion, and the clients'
optional import."""
import importlib
import sys
from unittest import mock

import qlm_measure


def test_version_is_the_release():
    assert qlm_measure.__version__ == "0.9.0"


def test_verify_dispatches_by_schema_version():
    with mock.patch.object(qlm_measure, "verify_record_v03", return_value="v03") as v03, mock.patch.object(qlm_measure, "verify_record", return_value="v02") as v02:
        assert qlm_measure.verify({"schemaVersion": "0.3"}, strict=True) == "v03"
        assert qlm_measure.verify({"schemaVersion": "0.2"}) == "v02"
        assert qlm_measure.verify({}) == "v02"
    v03.assert_called_once_with({"schemaVersion": "0.3"}, strict=True)
    assert [c.args[0] for c in v02.call_args_list] == [{"schemaVersion": "0.2"}, {}]


def test_the_package_imports_without_the_clients_optional_dependencies():
    assert hasattr(qlm_measure, "OntologyClient")
    try:
        # A None entry in sys.modules makes `from .clients import ...` raise ImportError.
        with mock.patch.dict(sys.modules, {"qlm_measure.clients": None}):
            # The import still succeeds: the clients are optional.
            reloaded = importlib.reload(qlm_measure)
            assert reloaded.__version__ == "0.9.0"
    finally:
        importlib.reload(qlm_measure)
    assert hasattr(qlm_measure, "OntologyClient")
