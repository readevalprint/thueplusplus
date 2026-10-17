#!/usr/bin/env python3
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from frontmatter import FrontmatterError, parse_frontmatter


class FrontmatterTest(unittest.TestCase):
    def test_reads_flat_fields_and_body(self) -> None:
        fields, body = parse_frontmatter("---\nruleset: direct\nentry: solution.tpp\nauthor: Ada <ada@example.com>\n---\n\nNotes.\n", "README.md")
        self.assertEqual(fields["ruleset"], "direct")
        self.assertEqual(body, "Notes.\n")

    def test_rejects_limits(self) -> None:
        with self.assertRaises(FrontmatterError):
            parse_frontmatter("---\nruleset: direct\nlimits: 1\n---\n\nNotes.\n", "README.md")

    def test_rejects_a_missing_opener(self) -> None:
        with self.assertRaises(FrontmatterError):
            parse_frontmatter("# Title\n", "README.md")


if __name__ == "__main__":
    unittest.main()
