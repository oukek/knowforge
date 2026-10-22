"""Upload a Vite build without deleting old assets; publish HTML last."""
import mimetypes
import os
import re
from pathlib import Path, PurePosixPath
import sys


BACKEND_RESOURCES = {"runner.js", "python-runner.js"}


def signing_region(value):
    region = value.strip()
    if "_" in region:
        raise ValueError(
            f"Invalid OSS_REGION: {region!r}. Use hyphens, not underscores; "
            f"for example {region.replace('_', '-')!r}. "
            "Update the existing GitHub Actions repository Variable OSS_REGION."
        )
    if region.startswith("oss-") or not re.fullmatch(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)+", region):
        raise ValueError(
            "OSS_REGION must be a Region ID such as cn-guangzhou, "
            "without the oss- prefix, URL or Endpoint hostname."
        )
    return region


def upload_frontend(bucket, directory, prefix=""):
    root = Path(directory).resolve()
    if not (root / "index.html").is_file():
        raise ValueError("Frontend build is missing index.html")
    prefix = prefix.strip("/")
    if ".." in PurePosixPath(prefix).parts or "\\" in prefix:
        raise ValueError("Invalid OSS_PREFIX")
    files = []
    for path in root.rglob("*"):
        if path.is_symlink():
            raise ValueError("Symlinks are not supported in frontend builds")
        if path.is_file() and path.relative_to(root).as_posix() not in BACKEND_RESOURCES:
            files.append(path)
    # Keep old hashed chunks for open browser tabs and CDN caches.
    files.sort(key=lambda path: (path.name.endswith(".html"), path.relative_to(root).as_posix() == "index.html", str(path)))
    for path in files:
        relative = path.relative_to(root).as_posix()
        key = f"{prefix}/{relative}" if prefix else relative
        content_type = {
            ".js": "application/javascript",
            ".mjs": "application/javascript",
            ".wasm": "application/wasm",
        }.get(path.suffix) or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        cache = "public, max-age=31536000, immutable" if relative.startswith("assets/") else "no-cache, max-age=0, must-revalidate"
        bucket.put_object_from_file(key, str(path), headers={
            "Content-Type": content_type,
            "Cache-Control": cache,
        })
    print(f"Uploaded {len(files)} frontend files; index.html published last.")


def main():
    region = signing_region(os.environ["OSS_REGION"])
    import oss2
    from oss2.credentials import EnvironmentVariableCredentialsProvider

    auth = oss2.ProviderAuthV4(EnvironmentVariableCredentialsProvider())
    bucket = oss2.Bucket(auth, os.environ["OSS_ENDPOINT"], os.environ["OSS_BUCKET"],
                         region=region, connect_timeout=60)
    upload_frontend(bucket, sys.argv[1], os.environ.get("OSS_PREFIX", ""))


if __name__ == "__main__":
    main()
