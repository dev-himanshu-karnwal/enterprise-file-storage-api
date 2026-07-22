import hashlib
from functools import lru_cache
from typing import BinaryIO

import boto3
from botocore.client import BaseClient
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, status

from config import get_settings

settings = get_settings()


class S3StorageError(Exception):
    pass


@lru_cache
def get_s3_client() -> BaseClient:
    if not settings.s3_configured:
        raise S3StorageError(
            "S3 is not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, "
            "AWS_REGION, and S3_BUCKET in your .env file."
        )

    kwargs: dict = {
        "service_name": "s3",
        "region_name": settings.aws_region,
        "aws_access_key_id": settings.aws_access_key_id,
        "aws_secret_access_key": settings.aws_secret_access_key,
    }
    if settings.s3_endpoint_url:
        kwargs["endpoint_url"] = settings.s3_endpoint_url

    return boto3.client(**kwargs)


def build_storage_key(
    *,
    organization_id: str,
    project_id: str,
    file_id: str,
    version: int,
    filename: str,
) -> str:
    safe_name = filename.replace("\\", "_").replace("/", "_")
    return f"{organization_id}/{project_id}/{file_id}/v{version}/{safe_name}"


def upload_fileobj(
    *,
    fileobj: BinaryIO,
    storage_key: str,
    content_type: str,
    content_length: int | None = None,
) -> None:
    try:
        client = get_s3_client()
        extra = {"ContentType": content_type}
        client.upload_fileobj(
            fileobj,
            settings.s3_bucket,
            storage_key,
            ExtraArgs=extra,
        )
    except (BotoCoreError, ClientError, S3StorageError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to upload to S3: {exc}",
        ) from exc


def create_presigned_get_url(storage_key: str, *, filename: str | None = None) -> str:
    try:
        client = get_s3_client()
        params: dict = {
            "Bucket": settings.s3_bucket,
            "Key": storage_key,
        }
        if filename:
            params["ResponseContentDisposition"] = f'attachment; filename="{filename}"'
        return client.generate_presigned_url(
            "get_object",
            Params=params,
            ExpiresIn=settings.s3_presign_expire_seconds,
        )
    except (BotoCoreError, ClientError, S3StorageError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to create download URL: {exc}",
        ) from exc


def delete_object(storage_key: str) -> None:
    """Best-effort delete; soft-delete flows may leave objects until a purge job."""
    try:
        client = get_s3_client()
        client.delete_object(Bucket=settings.s3_bucket, Key=storage_key)
    except (BotoCoreError, ClientError, S3StorageError):
        return


def head_bucket() -> bool:
    client = get_s3_client()
    client.head_bucket(Bucket=settings.s3_bucket)
    return True


def sha256_fileobj(fileobj: BinaryIO) -> tuple[str, int]:
    """Compute checksum and size; resets file pointer to start afterward."""
    digest = hashlib.sha256()
    total = 0
    while True:
        chunk = fileobj.read(1024 * 1024)
        if not chunk:
            break
        digest.update(chunk)
        total += len(chunk)
    fileobj.seek(0)
    return digest.hexdigest(), total
