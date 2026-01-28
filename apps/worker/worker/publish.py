from __future__ import annotations

import io
import zipfile
from datetime import datetime, timezone

from minio import Minio


def _minio_client() -> Minio:
    # Worker env: S3_ENDPOINT=http://minio:9000 ; S3_ACCESS_KEY ; S3_SECRET_KEY
    import os
    endpoint = os.environ["S3_ENDPOINT"].replace("http://", "").replace("https://", "")
    secure = os.environ["S3_ENDPOINT"].startswith("https://")
    return Minio(
        endpoint,
        access_key=os.environ["S3_ACCESS_KEY"],
        secret_key=os.environ["S3_SECRET_KEY"],
        secure=secure,
    )


def guess_mime_type(path: str) -> str:
    p = path.lower()
    if p.endswith(".html") or p.endswith(".htm"):
        return "text/html; charset=utf-8"
    if p.endswith(".js"):
        return "application/javascript; charset=utf-8"
    if p.endswith(".css"):
        return "text/css; charset=utf-8"
    if p.endswith(".json"):
        return "application/json; charset=utf-8"
    if p.endswith(".svg"):
        return "image/svg+xml"
    if p.endswith(".png"):
        return "image/png"
    if p.endswith(".jpg") or p.endswith(".jpeg"):
        return "image/jpeg"
    if p.endswith(".webp"):
        return "image/webp"
    if p.endswith(".gif"):
        return "image/gif"
    if p.endswith(".txt"):
        return "text/plain; charset=utf-8"
    if p.endswith(".woff"):
        return "font/woff"
    if p.endswith(".woff2"):
        return "font/woff2"
    return "application/octet-stream"


def upload_zip_to_prefix(zip_bytes: bytes, bucket: str, prefix: str) -> dict:
    """
    Unzip bytes and upload all files to:
      s3://{bucket}/{prefix}/{relative_path}
    """
    client = _minio_client()
    uploaded = 0

    # Normalize prefix (no trailing slash)
    prefix = prefix.strip("/")

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue

            name = info.filename.replace("\\", "/")
            name = name.lstrip("./")  # remove ./ prefix if present
            if not name:
                continue

            object_name = f"{prefix}/{name}".replace("//", "/")

            with zf.open(info, "r") as f:
                data = f.read()

            # Upload
            data_stream = io.BytesIO(data)
            client.put_object(
                bucket_name=bucket,
                object_name=object_name,
                data=data_stream,
                length=len(data),
                content_type=guess_mime_type(object_name),
            )
            uploaded += 1

    return {
        "uploaded": uploaded,
        "bucket": bucket,
        "prefix": prefix,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
