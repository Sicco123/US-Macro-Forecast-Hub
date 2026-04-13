"""
Validate model metadata YAML files against the hub schema.
"""

import json
import os
import sys
from pathlib import Path

import jsonschema
import yaml

HUB_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = HUB_ROOT / "hub-config" / "model-metadata-schema.json"


def validate_metadata_file(filepath: str, schema: dict) -> list[str]:
    """Validate a single metadata YAML file. Returns list of error messages."""
    errors = []
    path = Path(filepath)

    if not path.exists():
        return [f"File not found: {filepath}"]

    try:
        with open(path) as f:
            metadata = yaml.safe_load(f)
    except yaml.YAMLError as e:
        return [f"YAML parse error in {filepath}: {e}"]

    if metadata is None:
        return [f"Empty metadata file: {filepath}"]

    # Validate against JSON Schema
    validator = jsonschema.Draft202012Validator(schema)
    for error in validator.iter_errors(metadata):
        errors.append(f"{filepath}: {error.message} (path: {list(error.absolute_path)})")

    # Check that filename matches team_abbr-model_abbr
    expected_stem = f"{metadata.get('team_abbr', '')}-{metadata.get('model_abbr', '')}"
    if path.stem != expected_stem:
        errors.append(
            f"{filepath}: filename '{path.stem}' does not match "
            f"team_abbr-model_abbr '{expected_stem}'"
        )

    return errors


def main():
    with open(SCHEMA_PATH) as f:
        schema = json.load(f)

    changed_files = os.environ.get("CHANGED_FILES", "").strip().split("\n")
    metadata_files = [
        f.strip() for f in changed_files
        if f.strip().startswith("model-metadata/") and f.strip().endswith(".yml")
    ]

    if not metadata_files:
        print("No metadata files to validate.")
        return

    all_errors = []
    for filepath in metadata_files:
        full_path = HUB_ROOT / filepath
        errors = validate_metadata_file(str(full_path), schema)
        all_errors.extend(errors)

    if all_errors:
        print("Metadata validation FAILED:")
        for error in all_errors:
            print(f"  ERROR: {error}")
        sys.exit(1)
    else:
        print(f"Metadata validation passed ({len(metadata_files)} file(s) checked).")


if __name__ == "__main__":
    main()
