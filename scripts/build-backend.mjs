import { build } from "esbuild";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { createHash } from "node:crypto";
import { builtinModules } from "node:module";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const output = resolve("backend-dist");
const runtimeNames = ["express", "mysql2", "pyodide", "zod"];
const dependencies = Object.fromEntries(
  runtimeNames.map((name) => [
    name,
    lock.packages[`node_modules/${name}`].version,
  ]),
);
const manifest = {
  name: "knowforge-backend",
  version: pkg.version,
  private: true,
  type: "module",
  engines: { node: ">=24" },
  scripts: { start: "node server/index.mjs" },
  dependencies,
};

// Preserve the exact root lockfile versions/integrities; never resolve fresh versions.
const packages = {
  "": {
    name: manifest.name,
    version: manifest.version,
    engines: manifest.engines,
    dependencies,
  },
};
function findPackage(parent, name) {
  let folder = parent;
  while (true) {
    const candidate = posix.join(folder, "node_modules", name);
    if (posix.basename(folder) !== "node_modules" && lock.packages[candidate])
      return candidate;
    if (!folder || folder === ".") return null;
    folder = posix.dirname(folder);
  }
}
function includePackage(parent, name, optional = false) {
  const path = findPackage(parent, name);
  if (!path) {
    if (optional) return;
    throw new Error(`Missing locked runtime dependency: ${name}`);
  }
  if (packages[path]) return;
  const entry = { ...lock.packages[path] };
  delete entry.dev;
  delete entry.devOptional;
  packages[path] = entry;
  for (const [name] of Object.entries(entry.dependencies || {}))
    includePackage(path, name, name in (entry.optionalDependencies || {}));
  for (const name of Object.keys(entry.optionalDependencies || {}))
    includePackage(path, name, true);
  for (const name of Object.keys(entry.peerDependencies || {}))
    includePackage(path, name, !!entry.peerDependenciesMeta?.[name]?.optional);
}
for (const name of runtimeNames) includePackage("", name);

rmSync(output, { recursive: true, force: true });
mkdirSync(join(output, "server"), { recursive: true });
const compiled = await build({
  entryPoints: ["server/production.mjs"],
  outdir: join(output, "server"),
  entryNames: "index",
  chunkNames: "chunks/[name]-[hash]",
  outExtension: { ".js": ".mjs" },
  splitting: true,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "external",
  minify: true,
  sourcemap: false,
  legalComments: "none",
  metafile: true,
  plugins: [
    {
      name: "external-catalog",
      setup(api) {
        api.onResolve({ filter: /data\/catalog\.json$/ }, () => ({
          path: "../data/catalog.json",
          external: true,
        }));
      },
    },
  ],
});
for (const output of Object.values(compiled.metafile.outputs)) {
  for (const item of output.imports.filter((item) => item.external)) {
    const path = item.path;
    if (
      path.startsWith("node:") ||
      builtinModules.includes(path) ||
      path === "../data/catalog.json"
    )
      continue;
    const name = path.startsWith("@")
      ? path.split("/").slice(0, 2).join("/")
      : path.split("/")[0];
    if (!runtimeNames.includes(name))
      throw new Error(`Unlisted backend runtime dependency: ${path}`);
  }
}

const resources = {
  "data/catalog.json": "data/catalog.json",
  "resources/runner.js": "client/public/runner.js",
  "resources/python-runner.js": "client/public/python-runner.js",
  "resources/handbook.md": "docs/完整学习手册.md",
  "resources/workbench.py": "examples/python/workbench.py",
};
for (const [target, source] of Object.entries(resources)) {
  mkdirSync(dirname(join(output, target)), { recursive: true });
  cpSync(source, join(output, target));
}
writeFileSync(
  join(output, "package.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
writeFileSync(
  join(output, "package-lock.json"),
  JSON.stringify(
    {
      name: manifest.name,
      version: manifest.version,
      lockfileVersion: 3,
      requires: true,
      packages,
    },
    null,
    2,
  ) + "\n",
);
mkdirSync(join(output, "runtime"));
writeFileSync(
  join(output, "build-info.json"),
  JSON.stringify(
    {
      name: manifest.name,
      version: pkg.version,
      builtAt: new Date().toISOString(),
      entry: "server/index.mjs",
      frontend: "oss",
      sourceLockSha256: createHash("sha256")
        .update(readFileSync("package-lock.json"))
        .digest("hex"),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Backend built: ${output} (one service entry, ${runtimeNames.length} direct runtime dependencies, ${Object.keys(packages).length - 1} locked packages)`,
);
