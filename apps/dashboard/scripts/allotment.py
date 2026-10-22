"""Classification of the free-text plot `allotment` column.

The column is typed by hand ("Alloted", "Allotted", "Aloted", "Vaccant", "Select", blank ...), so the
dashboard needs one agreed mapping onto four statuses. Kept in its own module so it is unit-tested
(test_allotment.py) and shared by build-map-data.py.
"""
import re


def categorize(value):
    """Return 'allotted', 'notAllotted', 'notSet' or 'other' for one raw database value (or None)."""
    if value is None:
        return "notSet"
    v = re.sub(r"[^a-z]", "", value.lower())
    if v in ("", "select", "allotment"):        # blank / drop-down placeholder / label typed by mistake
        return "notSet"
    if v.startswith(("not", "un")) or v in ("vacant", "vaccant"):
        return "notAllotted"
    if re.fullmatch(r"al+ot+e?d", v):
        return "allotted"
    return "other"                               # e.g. Park, Building
