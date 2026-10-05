"""Private Cloudflare R2 access for textbook assets; Supabase remains the auth provider."""
from functools import lru_cache
import os
from pathlib import Path
import re
import threading
from urllib.error import HTTPError
from urllib.parse import quote


def load_local_storage_settings():
    """Python entrypoints do not automatically load Next.js .env.local files."""
    if os.environ.get("VERCEL") or "TEXTBOOK_STORAGE_BACKEND" in os.environ:
        return
    folder = Path(__file__).resolve().parent
    if folder.name == "api":
        folder = folder.parent
    path = folder / ".env.local"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if "=" not in line or line.lstrip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key == "TEXTBOOK_STORAGE_BACKEND" or key.startswith("R2_"):
            os.environ.setdefault(key, value.strip().strip("\"'"))


load_local_storage_settings()


def uses_r2():
    backend = os.environ.get("TEXTBOOK_STORAGE_BACKEND", "supabase").lower()
    if backend not in {"r2", "supabase"}:
        raise ValueError("TEXTBOOK_STORAGE_BACKEND must be r2 or supabase")
    return backend == "r2"


_client_lock = threading.Lock()


@lru_cache(maxsize=1)
def _client():
    import boto3
    from botocore.config import Config
    endpoint = os.environ["R2_ENDPOINT_URL"].rstrip("/")
    if not re.fullmatch(r"https://[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com", endpoint):
        raise ValueError("R2_ENDPOINT_URL must be a Cloudflare R2 S3 endpoint")
    return boto3.client("s3", endpoint_url=endpoint, region_name="auto",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4", max_pool_connections=16,
            connect_timeout=10, read_timeout=30, retries={"max_attempts": 3, "mode": "standard"},
            request_checksum_calculation="when_required", response_checksum_validation="when_required"))


def r2_client():
    # Boto3 session/client creation is not thread safe; the resulting client is shared.
    with _client_lock:
        return _client()


def fetch_r2_object(key):
    from botocore.exceptions import ClientError
    bucket = os.environ["R2_BUCKET"]
    try:
        response = r2_client().get_object(Bucket=bucket, Key=key)
        with response["Body"] as body:
            return body.read()
    except ClientError as exc:
        status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode", 502)
        # Preserve existing missing-image handling without leaking credentials/signatures.
        raise HTTPError("r2://" + bucket + "/" + quote(key, safe="/"), status,
            "Cloudflare R2 asset download failed", {}, None) from None


def upload_r2_temporary(key, data, content_type, download_filename=None):
    bucket = os.environ["R2_BUCKET"]
    client = r2_client()
    client.put_object(Bucket=bucket, Key=key, Body=data, ContentType=content_type)
    params = {"Bucket": bucket, "Key": key, "ResponseContentType": content_type}
    if download_filename:
        encoded = quote(download_filename, safe="")
        params["ResponseContentDisposition"] = f"attachment; filename*=UTF-8''{encoded}"
    return client.generate_presigned_url("get_object", Params=params, ExpiresIn=1800)
