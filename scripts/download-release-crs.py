#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import sys
from pathlib import Path

CRS_KEY_FILES = {
    "prover_keys.rkyv",
    "preprocess_keys.rkyv",
    "verifier_keys.rkyv",
}
CRS_PAYLOAD_FILES = CRS_KEY_FILES | {
    "crs_provenance.json",
}
TAU_FOLDER_NAME = "tau_sequence"
TAU_PROVENANCE_KEY = "tau_sequence.rkyv"
FOLDER_MIME_TYPE = "application/vnd.google-apps.folder"
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


def compatible_version(package_version: str) -> str:
    if re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)", package_version) is None:
        raise ValueError(f"package version must be canonical MAJOR.MINOR.PATCH, got {package_version!r}")
    return ".".join(package_version.split(".")[:2])


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def require_unique(entries: list[dict], name: str, is_folder: bool) -> dict | None:
    matches = [entry for entry in entries if entry.get("name") == name]
    if len(matches) > 1:
        raise ValueError(f"duplicate Drive entry: {name}")
    if not matches:
        return None
    entry = matches[0]
    if (entry.get("mimeType") == FOLDER_MIME_TYPE) != is_folder:
        raise ValueError(f"wrong Drive entry type: {name}")
    return entry


def provenance_artifact_digests(provenance_bytes: bytes) -> dict[str, str]:
    try:
        artifacts = json.loads(provenance_bytes)["artifacts"]
    except (KeyError, TypeError, json.JSONDecodeError) as error:
        raise ValueError(f"CRS provenance does not declare artifact digests: {error}") from error
    if not isinstance(artifacts, dict):
        raise ValueError("CRS provenance artifact digests must be an object")
    required = CRS_KEY_FILES | {TAU_PROVENANCE_KEY}
    digests = {name: artifacts.get(name) for name in required}
    invalid = sorted(name for name, digest in digests.items() if not isinstance(digest, str) or SHA256_PATTERN.fullmatch(digest) is None)
    if invalid:
        raise ValueError(f"CRS provenance has invalid SHA-256 digests: {invalid}")
    return digests


def validate_version_entries(entries: list[dict]) -> None:
    names = {entry.get("name") for entry in entries}
    missing = sorted(CRS_PAYLOAD_FILES - names)
    if missing:
        raise ValueError(f"CRS version directory is missing required files: {missing}")
    for name in CRS_PAYLOAD_FILES:
        require_unique(entries, name, False)


def list_children(service, parent_id: str) -> list[dict]:
    entries: list[dict] = []
    page_token = None
    while True:
        response = service.files().list(
            q=f"'{parent_id}' in parents and trashed = false",
            pageSize=100,
            pageToken=page_token,
            fields="nextPageToken,files(id,name,mimeType,size,sha256Checksum)",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        ).execute()
        entries.extend(response.get("files", []))
        page_token = response.get("nextPageToken")
        if not page_token:
            return entries


def download_drive_file(service, entry: dict) -> bytes:
    from googleapiclient.http import MediaIoBaseDownload

    output = io.BytesIO()
    downloader = MediaIoBaseDownload(
        output,
        service.files().get_media(fileId=entry["id"], supportsAllDrives=True),
        chunksize=64 * 1024 * 1024,
    )
    done = False
    while not done:
        _, done = downloader.next_chunk()
    payload = output.getvalue()
    declared = entry.get("sha256Checksum")
    if declared is not None and declared != sha256_bytes(payload):
        raise ValueError(f"Drive SHA-256 mismatch for {entry['name']}")
    return payload


def download_exact_file(service, entry: dict, output: Path, expected_digest: str | None = None) -> bytes:
    payload = download_drive_file(service, entry)
    if expected_digest is not None and sha256_bytes(payload) != expected_digest:
        raise ValueError(f"CRS SHA-256 mismatch for {entry['name']}")
    output.write_bytes(payload)
    return payload


def resolve_drive_layout(service, package_version: str, root_id: str, output: Path) -> bool:
    compatibility = compatible_version(package_version)
    root_entries = list_children(service, root_id)
    version_folder = require_unique(root_entries, compatibility, True)
    tau_folder = require_unique(root_entries, TAU_FOLDER_NAME, True)
    if version_folder is None:
        if tau_folder is not None:
            raise ValueError("shared tau folder exists without the compatible CRS directory")
        return False
    if tau_folder is None:
        raise ValueError("compatible CRS directory exists without the shared tau folder")
    version_entries = list_children(service, version_folder["id"])
    validate_version_entries(version_entries)
    output.mkdir(parents=True, exist_ok=False)
    provenance = download_exact_file(
        service,
        require_unique(version_entries, "crs_provenance.json", False),
        output / "crs_provenance.json",
    )
    digests = provenance_artifact_digests(provenance)
    tau_name = f"{digests[TAU_PROVENANCE_KEY]}.rkyv"
    tau = require_unique(list_children(service, tau_folder["id"]), tau_name, False)
    if tau is None:
        raise ValueError(f"shared tau file is missing: {tau_name}")
    download_exact_file(service, tau, output / TAU_PROVENANCE_KEY, digests[TAU_PROVENANCE_KEY])
    for name in sorted(CRS_PAYLOAD_FILES - {"crs_provenance.json"}):
        download_exact_file(service, require_unique(version_entries, name, False), output / name, digests[name])
    return True


def service_account_drive(credential_path: str):
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    credentials = service_account.Credentials.from_service_account_file(
        credential_path,
        scopes=["https://www.googleapis.com/auth/drive.readonly"],
    )
    return build("drive", "v3", credentials=credentials, cache_discovery=False)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    folder_id = os.environ.get("TOKAMAK_MPC_DRIVE_FOLDER_ID", "").strip()
    credential_path = os.environ.get("TOKAMAK_MPC_DRIVE_SERVICE_ACCOUNT_JSON_PATH", "").strip()
    if not folder_id or not credential_path:
        raise ValueError("Drive folder configuration and service-account credential path are required")
    found = resolve_drive_layout(service_account_drive(credential_path), args.version, folder_id, args.output)
    if not found:
        raise ValueError(f"No canonical CRS directory exists for compatibility {compatible_version(args.version)}")
    print(json.dumps({"found": True, "compatibility": compatible_version(args.version)}))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(f"[release-crs] {error}", file=sys.stderr)
        sys.exit(1)
