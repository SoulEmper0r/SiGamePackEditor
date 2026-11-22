#!/usr/bin/env node
"use strict";

/*
 * Deterministic, dependency-aware bundler for the browser's classic-script entry point.
 * Source files remain ordinary ES modules. The generated app.bundle.js is never edited by hand.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = __dirname;
const HTML_FILE = path.join(ROOT, "..", "index.html");
const OUTPUT_FILE = path.join(ROOT, "app.bundle.js");
const TEMP_FILE = path.join(ROOT, "app.bundle.tmp.js");

const MODULE_ORDER = [
  "zip.js",
  "pack-model.js",
  "siq-reader.js",
  "validator.js",
  "siq-writer.js",
  "pack-commands.js",
  "quality-limits.js",
  "filename-normalizer.js",
  "resource-manager.js",
  "html-preview.js",
  "cross-pack-copy.js",
  "package-explorer.js",
  "question-types.js",
  "round-types.js",
  "question-preview.js",
  "session-history.js",
  "app.js"
];

function fail(message) {
  console.error("[build] ERROR: " + message);
  throw new Error(message);
}

function readUtf8(filePath) {
  if (!fs.existsSync(filePath)) fail("Required file not found: " + filePath);
  return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

function parseImports(source, moduleName) {
  const imports = [];
  const transformed = source.replace(
    /^\s*import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?\s*$/gm,
    (_whole, specifierText, request) => {
      if (!request.startsWith("./")) {
        fail(moduleName + ": only relative named imports are supported (" + request + ")");
      }
      const dependency = path.posix.basename(request);
      const specifiers = specifierText.split(",").map((part) => part.trim()).filter(Boolean);
      if (specifiers.length === 0) fail(moduleName + ": empty import from " + request);
      imports.push({ dependency, specifiers });
      return "";
    }
  );

  if (/^\s*import\b/m.test(transformed)) {
    fail(moduleName + ": unsupported or unparsed import syntax remains");
  }
  return { source: transformed, imports };
}

function collectAndStripExports(source, moduleName) {
  const exports = new Set();

  for (const match of source.matchAll(
    /\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g
  )) {
    exports.add(match[1]);
  }

  source = source.replace(
    /^\s*export\s+\{([^}]+)\};?\s*$/gm,
    (_whole, list) => {
      for (const part of list.split(",")) {
        const item = part.trim();
        if (!item) continue;
        const alias = item.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
        if (!alias) fail(moduleName + ": unsupported export item: " + item);
        exports.add(alias[1]);
      }
      return "";
    }
  );

  source = source.replace(
    /\bexport\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/g,
    ""
  );

  if (/^\s*export\b/m.test(source)) {
    fail(moduleName + ": unsupported or unparsed export syntax remains");
  }
  return { source, exports: [...exports] };
}

function parseModule(moduleName) {
  const filePath = path.join(ROOT, moduleName);
  let source = readUtf8(filePath);
  source = source.replace(/\r\n/g, "\n");

  const parsedImports = parseImports(source, moduleName);
  const parsedExports = collectAndStripExports(parsedImports.source, moduleName);

  return {
    name: moduleName,
    source: parsedExports.source.trim(),
    imports: parsedImports.imports,
    exports: parsedExports.exports
  };
}

function validateGraph(modules) {
  const byName = new Map(modules.map((module) => [module.name, module]));
  const position = new Map(MODULE_ORDER.map((name, index) => [name, index]));

  for (const module of modules) {
    for (const imported of module.imports) {
      const dependency = byName.get(imported.dependency);
      if (!dependency) fail(module.name + ": dependency not listed in build order: " + imported.dependency);
      if (position.get(imported.dependency) >= position.get(module.name)) {
        fail(module.name + ": dependency must be built before importer: " + imported.dependency);
      }

      const exported = new Set(dependency.exports);
      for (const specifier of imported.specifiers) {
        const match = specifier.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
        if (!match) fail(module.name + ": unsupported import specifier: " + specifier);
        if (!exported.has(match[1])) {
          fail(module.name + ": " + imported.dependency + " does not export " + match[1]);
        }
      }
    }
  }
}

function renderModule(module) {
  const dependencyLines = [];
  for (const imported of module.imports) {
    for (const specifier of imported.specifiers) {
      const match = specifier.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      const importedName = match[1];
      const localName = match[2] || match[1];
      dependencyLines.push(
        "  const " + localName + " = __modules[" + JSON.stringify(imported.dependency) + "]." + importedName + ";"
      );
    }
  }

  const exportsObject = module.exports.length
    ? "{ " + module.exports.join(", ") + " }"
    : "{}";

  return [
    "__modules[" + JSON.stringify(module.name) + "] = (() => {",
    ...dependencyLines,
    module.source.split("\n").map((line) => line ? "  " + line : "").join("\n"),
    "  return " + exportsObject + ";",
    "})();"
  ].join("\n");
}

function validateHtmlContract() {
  const html = readUtf8(HTML_FILE);
  const requiredIds = [
    "siqFile",
    "exportBtn",
    "output",
    "details",
    "tree",
    "selectionTitle",
    "selectionInfo",
    "actions",
    "statusBar",
    "checkUpdatesBtn",
    "appVersionLabel"
  ];

  for (const id of requiredIds) {
    const escaped = id.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
    const matches = html.match(new RegExp("\\bid\\s*=\\s*([\"'])" + escaped + "\\1", "g")) || [];
    if (matches.length !== 1) fail("index.html must contain exactly one element with id=\"" + id + "\"");
  }

  if (!/<script\b[^>]*src=["']\.\/js\/app\.bundle\.js["'][^>]*>\s*<\/script>/i.test(html)) {
    fail("index.html must load ./js/app.bundle.js as a classic script");
  }
  if (/<script\b[^>]*type=["']module["'][^>]*src=["']\.\/js\/app\.bundle\.js["']/i.test(html)) {
    fail("app.bundle.js is a classic script and must not be loaded as type=module");
  }

  const picker = html.match(/<input\b[^>]*\bid=["']siqFile["'][^>]*>/i)?.[0] || "";
  if (!/\btype=["']file["']/i.test(picker)) fail("#siqFile must remain a file input");
  if (!/\baccept=["'][^"']*\.siq/i.test(picker)) fail("#siqFile must accept .siq files");
}

function main() {
  validateHtmlContract();

  const modules = MODULE_ORDER.map(parseModule);
  validateGraph(modules);

  const bundle = [
    "/* GENERATED FILE. DO NOT EDIT. Source: build-bundle.cjs + app modules. */",
    '"use strict";',
    "const __modules = Object.create(null);",
    ...modules.map(renderModule),
    "__modules[\"app.js\"];",
    ""
  ].join("\n");

  if (/^\s*(?:import|export)\b/m.test(bundle)) {
    fail("Generated classic bundle still contains an import/export statement");
  }

  fs.writeFileSync(TEMP_FILE, bundle, { encoding: "utf8", flag: "w" });

  const check = spawnSync(process.execPath, ["--check", TEMP_FILE], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true
  });

  if (check.status !== 0) {
    try { fs.unlinkSync(TEMP_FILE); } catch {}
    console.error(check.stdout || "");
    console.error(check.stderr || "");
    fail("node --check rejected the generated bundle; existing app.bundle.js was preserved");
  }

  fs.renameSync(TEMP_FILE, OUTPUT_FILE);
  console.log("[build] OK");
  console.log("[build] Modules: " + MODULE_ORDER.join(" -> "));
  console.log("[build] Output: " + OUTPUT_FILE);
  console.log("[build] UTF-8, classic-script, HTML contract and syntax checks passed.");
}

try {
  main();
} catch (error) {
  if (error && error.stack) console.error(error.stack);
  process.exitCode = 1;
}
