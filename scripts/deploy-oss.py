"""Upload a Vite build without deleting old assets; publish HTML last."""
import mimetypes
import os
from pathlib import Path, PurePosixPath
import sys


BACKEND_RESOURCES = {"runner.js", "python-runner.js"}


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
    import oss2
    from oss2.credentials import EnvironmentVariableCredentialsProvider

    auth = oss2.ProviderAuthV4(EnvironmentVariableCredentialsProvider())
    bucket = oss2.Bucket(auth, os.environ["OSS_ENDPOINT"], os.environ["OSS_BUCKET"],
                         region=os.environ["OSS_REGION"], connect_timeout=60)
    upload_frontend(bucket, sys.argv[1], os.environ.get("OSS_PREFIX", ""))


if __name__ == "__main__":
    main()
