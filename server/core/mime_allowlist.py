"""Allowed upload MIME types and extensions (PRD §4 File Upload)."""

from __future__ import annotations

from pathlib import PurePosixPath

# Categories used by `file_type` filters and MIME validation.
ALLOWED_MIME_TYPES: frozenset[str] = frozenset(
    {
        # Images
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/svg+xml",
        "image/bmp",
        "image/tiff",
        # PDF
        "application/pdf",
        # Videos
        "video/mp4",
        "video/webm",
        "video/quicktime",
        "video/x-msvideo",
        "video/x-matroska",
        # ZIP / archives
        "application/zip",
        "application/x-zip-compressed",
        "application/x-7z-compressed",
        "application/gzip",
        "application/x-tar",
        # Documents
        "text/plain",
        "text/csv",
        "text/markdown",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/rtf",
        "application/vnd.oasis.opendocument.text",
        "application/vnd.oasis.opendocument.spreadsheet",
    }
)

ALLOWED_EXTENSIONS: frozenset[str] = frozenset(
    {
        "jpg",
        "jpeg",
        "png",
        "gif",
        "webp",
        "svg",
        "bmp",
        "tif",
        "tiff",
        "pdf",
        "mp4",
        "webm",
        "mov",
        "avi",
        "mkv",
        "zip",
        "7z",
        "gz",
        "tar",
        "txt",
        "csv",
        "md",
        "doc",
        "docx",
        "xls",
        "xlsx",
        "ppt",
        "pptx",
        "rtf",
        "odt",
        "ods",
    }
)

# Map PRD-style file_type filters → MIME prefixes / exact types / extensions.
FILE_TYPE_MIME_PREFIXES: dict[str, tuple[str, ...]] = {
    "image": ("image/",),
    "video": ("video/",),
}

FILE_TYPE_MIME_EXACT: dict[str, frozenset[str]] = {
    "pdf": frozenset({"application/pdf"}),
    "zip": frozenset(
        {
            "application/zip",
            "application/x-zip-compressed",
            "application/x-7z-compressed",
            "application/gzip",
            "application/x-tar",
        }
    ),
    "document": frozenset(
        {
            "text/plain",
            "text/csv",
            "text/markdown",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/rtf",
            "application/vnd.oasis.opendocument.text",
            "application/vnd.oasis.opendocument.spreadsheet",
        }
    ),
}

FILE_TYPE_EXTENSIONS: dict[str, frozenset[str]] = {
    "image": frozenset({"jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "tif", "tiff"}),
    "pdf": frozenset({"pdf"}),
    "video": frozenset({"mp4", "webm", "mov", "avi", "mkv"}),
    "zip": frozenset({"zip", "7z", "gz", "tar"}),
    "document": frozenset(
        {"txt", "csv", "md", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "rtf", "odt", "ods"}
    ),
}


def normalize_extension(filename: str) -> str:
    return PurePosixPath(filename).suffix.lstrip(".").lower()


def is_allowed_upload(*, filename: str, content_type: str) -> bool:
    mime = (content_type or "").strip().lower().split(";")[0].strip()
    ext = normalize_extension(filename)
    if mime in ALLOWED_MIME_TYPES:
        return True
    # Some browsers send empty/octet-stream; fall back to extension.
    if mime in {"", "application/octet-stream"} and ext in ALLOWED_EXTENSIONS:
        return True
    return False


def allowlist_error_detail() -> str:
    return (
        "Unsupported file type. Allowed: images, PDFs, videos, ZIP/archives, "
        "and office/text documents."
    )
