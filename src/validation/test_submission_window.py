"""Minimal check for the 24-hour registration window logic."""

from datetime import datetime
from zoneinfo import ZoneInfo

from validate_forecast import ET, within_submission_window


def test_window():
    o = "2026-07-17"
    assert within_submission_window(o, datetime(2026, 7, 17, 0, 0, tzinfo=ET))
    assert within_submission_window(o, datetime(2026, 7, 17, 23, 59, tzinfo=ET))
    assert not within_submission_window(o, datetime(2026, 7, 18, 0, 0, tzinfo=ET))
    assert not within_submission_window(o, datetime(2026, 7, 16, 23, 59, tzinfo=ET))
    # naive datetimes are treated as ET
    assert within_submission_window(o, datetime(2026, 7, 17, 12, 0))
    # a UTC instant that is still the 17th in ET
    assert within_submission_window(o, datetime(2026, 7, 18, 3, 0, tzinfo=ZoneInfo("UTC")))


if __name__ == "__main__":
    test_window()
    print("ok")
