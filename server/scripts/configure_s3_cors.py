"""Apply browser-upload CORS rules to the configured S3 bucket.

Run from the server/ directory (so .env is loaded):

    python scripts/configure_s3_cors.py

IAM user needs: s3:PutBucketCors, s3:GetBucketCors on the bucket ARN.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow `python scripts/configure_s3_cors.py` from server/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from botocore.exceptions import ClientError

from config import get_settings
from core.s3 import get_s3_client


def main() -> int:
    settings = get_settings()
    if not settings.s3_configured:
        print("S3 is not configured. Set AWS_* and S3_BUCKET in .env first.")
        return 1

    origins = settings.cors_origin_list or [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    cors = {
        "CORSRules": [
            {
                "AllowedHeaders": ["*"],
                "AllowedMethods": ["GET", "PUT", "HEAD"],
                "AllowedOrigins": origins,
                "ExposeHeaders": ["ETag", "x-amz-request-id", "x-amz-version-id"],
                "MaxAgeSeconds": 3000,
            }
        ]
    }

    client = get_s3_client()
    try:
        client.put_bucket_cors(Bucket=settings.s3_bucket, CORSConfiguration=cors)
        current = client.get_bucket_cors(Bucket=settings.s3_bucket)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        print(f"Failed to set bucket CORS: {exc}")
        if code in {"AccessDenied", "AccessDeniedException"}:
            print(
                "\nAdd this IAM permission for your API user on "
                f"arn:aws:s3:::{settings.s3_bucket} :\n"
                '  "s3:PutBucketCors", "s3:GetBucketCors"'
            )
        return 1

    print(f"CORS applied on s3://{settings.s3_bucket}")
    print(f"AllowedOrigins: {origins}")
    print(f"Current rules: {current.get('CORSRules')}")
    print("\nHard-refresh the app and try upload again.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
