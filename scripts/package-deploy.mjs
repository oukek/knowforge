import {
  appendFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const root = process.cwd();
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
if (!/^[a-zA-Z0-9.+-]+$/.test(pkg.version))
  throw new Error("Invalid package version");
const artifact = resolve(root, "backend-dist");
const included = [
  "server",
  "data",
  "resources",
  "package.json",
  "package-lock.json",
  "build-info.json",
];
for (const path of [...included, "server/index.mjs"])
  if (!existsSync(join(artifact, path)))
    throw new Error(
      `Missing backend-dist/${path}; run npm run build:backend first`,
    );

function includeFile(path) {
  const name = basename(path);
  if (
    name === "node_modules" ||
    name === "__pycache__" ||
    name === ".DS_Store" ||
    name === ".env" ||
    name.startsWith(".env.") ||
    /\.(sqlite(?:-(?:wal|shm))?|db|log|pyc|pyo)$/.test(name)
  )
    return false;
  if (lstatSync(path).isSymbolicLink())
    throw new Error(`Symlinks are not allowed in deployment files: ${path}`);
  return true;
}

const stage = mkdtempSync(join(tmpdir(), "knowforge-package-"));
try {
  const destination = join(stage, "knowforge");
  mkdirSync(destination);
  for (const path of included) {
    const target = join(destination, path);
    mkdirSync(resolve(target, ".."), { recursive: true });
    cpSync(join(artifact, path), target, {
      recursive: true,
      filter: includeFile,
    });
  }
  mkdirSync(join(destination, "runtime"));
  let commit = process.env.GITHUB_SHA || null;
  if (!commit) {
    try {
      commit = execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {}
  }
  const info = JSON.parse(
    readFileSync(join(destination, "build-info.json"), "utf8"),
  );
  writeFileSync(
    join(destination, "build-info.json"),
    JSON.stringify(
      {
        ...info,
        commit,
        buildNode: process.version,
        runId: process.env.GITHUB_RUN_ID || null,
      },
      null,
      2,
    ) + "\n",
  );
  mkdirSync(resolve(root, "release"), { recursive: true });
  const archiveName = `knowforge-${pkg.version}-deploy.tar.gz`;
  const archivePath = resolve(root, "release", archiveName);
  execFileSync("tar", ["-czf", archivePath, "-C", stage, "knowforge"], {
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  const checksumPath = `${archivePath}.sha256`;
  const digest = createHash("sha256")
    .update(readFileSync(archivePath))
    .digest("hex");
  writeFileSync(checksumPath, `${digest}  ${archiveName}\n`);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `archive_name=${archiveName}\narchive_path=${archivePath}\nchecksum_path=${checksumPath}\n`,
    );
  console.log(`Deployment package: ${archivePath}\nSHA-256: ${digest}`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
