# tests/test_export_registries.py
"""Every Report Builder block must render in both export formats.
Fails when a block is added to the data registry but not to the PDF or PPTX renderer."""
from app.services.report import BLOCK_REGISTRY
from app.services.pdf_report import _RENDERERS as PDF_RENDERERS
from app.services.pptx_report import RENDERERS as PPTX_RENDERERS


def test_every_block_has_a_pdf_renderer():
    assert set(BLOCK_REGISTRY) - set(PDF_RENDERERS) == set()


def test_every_block_has_a_pptx_renderer():
    assert set(BLOCK_REGISTRY) - set(PPTX_RENDERERS) == set()
