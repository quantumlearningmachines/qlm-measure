"""Standards-specific regression cases, using synthetic source assertions only."""
from copy import deepcopy
from pathlib import Path
import unittest

try:
    from build_examples import example
    def capture():
        return example("requested")
except ModuleNotFoundError:
    from test_aggregate import fixture as capture
    import aggregate
    aggregate.load_contract(Path(__file__).parent / "vendor_contract")

from carrier_bindings import xapi_statement, extract_xapi, validate_xapi, IMPORT

TIME = "2026-10-20T00:00:00.000Z"
HOME = "https://example.org/synthetic/account-system"


class XapiMetadataRegressionTests(unittest.TestCase):
    def encoded(self, **kwargs):
        return xapi_statement(capture(), "urn:synthetic:importer", TIME,
                              account_homepage=kwargs.get("homepage", HOME),
                              account_name=kwargs.get("name", "synthetic-importer"))

    def test_account_homepage_and_name_are_required(self):
        with self.assertRaises(TypeError):
            xapi_statement(capture(), "urn:synthetic:importer", TIME)

    def test_urn_software_identity_is_separate_from_homepage(self):
        item = self.encoded()
        self.assertEqual(HOME, item["actor"]["account"]["homePage"])
        self.assertEqual("urn:synthetic:importer", item["context"]["extensions"][IMPORT]["importer_id"])
        self.assertEqual(capture(), extract_xapi(item))

    def test_urn_is_not_an_account_homepage(self):
        with self.assertRaisesRegex(ValueError, "homepage URL"):
            self.encoded(homepage="urn:synthetic:account-system")

    def test_bounded_homepage_locator_and_nonempty_name(self):
        for value in ["relative", "https:///missing-host", "https://example.org:bad", "https://user:password@example.org"]:
            with self.subTest(homepage=value), self.assertRaises(ValueError):
                self.encoded(homepage=value)
        with self.assertRaises(ValueError):
            self.encoded(name=" ")
        self.assertEqual("http://example.org/accounts", self.encoded(homepage="http://example.org/accounts")["actor"]["account"]["homePage"])

    def test_lrs_statement_versions_do_not_equal_http_patch_version(self):
        item = self.encoded()
        self.assertNotIn("version", item)
        for value in ["1.0.0", "1.0.3", "1.0.17"]:
            item["version"] = value
            self.assertEqual(capture(), extract_xapi(item))
        for value in ["2.0.0", "1.1.0", "1.0.01", 1, None]:
            item["version"] = value
            with self.subTest(version=value), self.assertRaises(ValueError):
                validate_xapi(item)

    def test_account_metadata_and_actor_must_agree(self):
        item = self.encoded()
        item["actor"]["account"]["name"] = "different-account"
        with self.assertRaises(ValueError):
            validate_xapi(item)

    def test_account_changes_binding_identity(self):
        first = self.encoded()
        second = self.encoded(name="different-declared-account")
        self.assertNotEqual(first["id"], second["id"])
        self.assertEqual(first["object"], second["object"])

    def test_authority_account_also_requires_homepage_locator(self):
        item = self.encoded()
        item["authority"] = {"objectType": "Agent", "account": {"homePage": "urn:synthetic:lrs", "name": "synthetic-lrs"}}
        with self.assertRaises(ValueError):
            validate_xapi(item)


if __name__ == "__main__":
    unittest.main()
