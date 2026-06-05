"""Test per le funzioni helper di register_society."""
import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from api import to_slug


class TestToSlug:
    def test_basic(self):
        assert to_slug("Oderzo Basket") == "oderzo-basket"

    def test_accenti(self):
        assert to_slug("Società Sportiva") == "societa-sportiva"

    def test_spazi_multipli(self):
        assert to_slug("  Basket   Club  ") == "basket-club"

    def test_caratteri_speciali(self):
        assert to_slug("ASD Basket & Co.") == "asd-basket-co"

    def test_gia_slug(self):
        assert to_slug("oderzo-basket") == "oderzo-basket"

    def test_numeri(self):
        assert to_slug("Basket 2026") == "basket-2026"

    def test_uppercase(self):
        assert to_slug("TREVISO BASKET") == "treviso-basket"
