import pytest
from allotment import categorize


@pytest.mark.parametrize("value", ["Alloted", "Allotted", "Aloted", "Alotted", "Alloted.", "ALLOTTED", " Alloted "])
def test_allotted_spellings(value):
    assert categorize(value) == "allotted"


@pytest.mark.parametrize("value", ["Not Allotted", "Unallotted", "Vacant", "Vaccant", "not alloted"])
def test_not_allotted_spellings(value):
    assert categorize(value) == "notAllotted"


@pytest.mark.parametrize("value", [None, "", "   ", "Select", "Allotment"])
def test_blank_and_placeholders_are_not_set(value):
    assert categorize(value) == "notSet"


@pytest.mark.parametrize("value", ["Park", "Building"])
def test_other_values_are_kept_apart(value):
    assert categorize(value) == "other"


def test_unallotted_is_not_mistaken_for_allotted():
    # "Unallotted" contains "allot" - the prefix rule must win
    assert categorize("Unallotted") == "notAllotted"
