import pathlib
import sys

# let the tests import the sibling modules (the scripts are not an installed package)
sys.path.insert(0, str(pathlib.Path(__file__).parent))
