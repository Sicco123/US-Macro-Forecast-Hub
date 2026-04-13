"""
Validate that changed files in a PR follow the expected directory and naming
conventions for the Macro Forecast Hub.

Expected paths:
  model-output/{team_abbr}-{model_abbr}/YYYY-MM-DD-{team_abbr}-{model_abbr}.csv
  model-metadata/{team_abbr}-{model_abbr}.yml
"""

import os
import re
import sys

FORECAST_PATTERN = re.compile(
    r"^model-output/"
    r"(?P<dir_team>[a-zA-Z0-9_]+)-(?P<dir_model>[a-zA-Z0-9_]+)/"
    r"(?P<date>\d{4}-\d{2}-\d{2})-(?P<file_team>[a-zA-Z0-9_]+)-(?P<file_model>[a-zA-Z0-9_]+)\.csv$"
)

METADATA_PATTERN = re.compile(
    r"^model-metadata/(?P<team>[a-zA-Z0-9_]+)-(?P<model>[a-zA-Z0-9_]+)\.yml$"
)


def main():
    changed_files = os.environ.get("CHANGED_FILES", "").strip().split("\n")
    changed_files = [f.strip() for f in changed_files if f.strip()]

    errors = []

    for filepath in changed_files:
        if filepath.startswith("model-output/"):
            if filepath.endswith(".gitkeep"):
                continue
            match = FORECAST_PATTERN.match(filepath)
            if not match:
                errors.append(
                    f"Invalid forecast file path: {filepath}\n"
                    f"  Expected: model-output/TEAM-MODEL/YYYY-MM-DD-TEAM-MODEL.csv"
                )
                continue

            if match.group("dir_team") != match.group("file_team"):
                errors.append(
                    f"Team abbreviation mismatch in {filepath}: "
                    f"directory '{match.group('dir_team')}' != "
                    f"filename '{match.group('file_team')}'"
                )
            if match.group("dir_model") != match.group("file_model"):
                errors.append(
                    f"Model abbreviation mismatch in {filepath}: "
                    f"directory '{match.group('dir_model')}' != "
                    f"filename '{match.group('file_model')}'"
                )

        elif filepath.startswith("model-metadata/"):
            match = METADATA_PATTERN.match(filepath)
            if not match:
                errors.append(
                    f"Invalid metadata file path: {filepath}\n"
                    f"  Expected: model-metadata/TEAM-MODEL.yml"
                )

    if errors:
        print("Path validation FAILED:")
        for error in errors:
            print(f"  ERROR: {error}")
        sys.exit(1)
    else:
        print("Path validation passed.")


if __name__ == "__main__":
    main()
