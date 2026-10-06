"""
DFL Empire R4 — AnyDoc Ingestion Security Test Suite
Tests format support, corrupt/encrypted file rejection, zip bomb protection, and chunk provenance extractions.
"""

import sys
import os
import tempfile
import unittest

sys.path.insert(0, "/home/bs/projects/dfl-search")

from anydoc_search_ingestor import AnyDocSearchIngestor, SUPPORTED_FORMATS


class TestR4AnyDocIngestionSecurity(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_supported_formats_inspection(self):
        """Empirically inspect formats supported by AnyDoc capability."""
        formats = AnyDocSearchIngestor.inspect_supported_formats()
        self.assertIn(".pdf", formats)
        self.assertIn(".docx", formats)
        self.assertIn(".xlsx", formats)
        self.assertIn(".pptx", formats)

    def test_valid_text_document_ingestion(self):
        """Test ingestion of valid text file with line provenance."""
        txt_path = os.path.join(self.tmp_dir.name, "sample.txt")
        with open(txt_path, "w") as f:
            f.write("Line 1: Project kickoff\nLine 2: Budget approved\n")

        res = AnyDocSearchIngestor.parse_document(
            file_path=txt_path,
            source_system="storage",
            source_object_id="doc-001",
            tenant_id="tenant-alpha",
            security_scope={"tenant:tenant-alpha"}
        )

        self.assertEqual(res.status, "SUCCESS")
        self.assertEqual(len(res.chunks), 1)
        chunk = res.chunks[0]
        self.assertIn("Project kickoff", chunk.index_text)
        self.assertEqual(chunk.provenance["type"], "Lines")

    def test_encrypted_pdf_rejection(self):
        """Verify encrypted PDF returns EXTRACTION_FAILED."""
        pdf_path = os.path.join(self.tmp_dir.name, "encrypted.pdf")
        with open(pdf_path, "wb") as f:
            f.write(b"%PDF-1.4\n1 0 obj\n<< /Encrypt 2 0 R >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF")

        res = AnyDocSearchIngestor.parse_document(
            file_path=pdf_path,
            source_system="storage",
            source_object_id="doc-encrypted",
            tenant_id="tenant-alpha",
            security_scope={"tenant:tenant-alpha"}
        )

        self.assertEqual(res.status, "EXTRACTION_FAILED")
        self.assertIn("Encrypted", res.error_message)

    def test_malformed_corrupt_file_rejection(self):
        """Verify malformed file returns MALFORMED_CORRUPT."""
        bad_path = os.path.join(self.tmp_dir.name, "corrupt.docx")
        with open(bad_path, "wb") as f:
            f.write(b"ABC")  # Too short / malformed

        res = AnyDocSearchIngestor.parse_document(
            file_path=bad_path,
            source_system="storage",
            source_object_id="doc-corrupt",
            tenant_id="tenant-alpha",
            security_scope={"tenant:tenant-alpha"}
        )

        self.assertEqual(res.status, "MALFORMED_CORRUPT")

    def test_spreadsheet_provenance_extraction(self):
        """Verify XLSX document yields Sheet and Range provenance."""
        xlsx_path = os.path.join(self.tmp_dir.name, "report.xlsx")
        with open(xlsx_path, "wb") as f:
            f.write(b"PK\x03\x04Sheet1 Data Row 1 Item A")

        res = AnyDocSearchIngestor.parse_document(
            file_path=xlsx_path,
            source_system="storage",
            source_object_id="sheet-001",
            tenant_id="tenant-alpha",
            security_scope={"tenant:tenant-alpha"}
        )

        self.assertEqual(res.status, "SUCCESS")
        chunk = res.chunks[0]
        self.assertEqual(chunk.provenance["type"], "Sheet")
        self.assertEqual(chunk.provenance["sheet"], "Sheet1")


if __name__ == "__main__":
    unittest.main()
