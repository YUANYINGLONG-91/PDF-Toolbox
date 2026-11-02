from pdf_toolbox.core.capabilities import detect_capabilities


def test_required_backends_available():
    caps = detect_capabilities()
    assert caps.ocr_ready
    assert caps.word_ready
    assert {"chi_sim", "eng"}.issubset(caps.languages)
    assert caps.ghostscript is not None
