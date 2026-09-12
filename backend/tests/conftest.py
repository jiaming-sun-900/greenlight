import pytest


def pytest_addoption(parser):
    parser.addoption(
        "--eval",
        action="store_true",
        default=False,
        help="Run the screening eval. Calls the live Claude API and costs money.",
    )


def pytest_configure(config):
    config.addinivalue_line(
        "markers", "eval: hits the live Claude API; only runs with --eval"
    )


def pytest_collection_modifyitems(config, items):
    if config.getoption("--eval"):
        return
    skip = pytest.mark.skip(reason="needs --eval (calls the live Claude API)")
    for item in items:
        if "eval" in item.keywords:
            item.add_marker(skip)
