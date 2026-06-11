import fs from "node:fs";
import path from "node:path";
import { ensureRuntimeDirectories, resolveFamilyOsPaths } from "./instance_paths.mjs";

const runtimePaths = resolveFamilyOsPaths();
ensureRuntimeDirectories(runtimePaths);
const workspace = runtimePaths.workspaceRoot;
const pluginRoot = path.join(workspace, "plugins-staging", "family-os-bb-inventory");
const sourceRoot = path.join(pluginRoot, "skills");
const runtimeConfigPath = runtimePaths.runtimeConfigPath;
const targetRoot = runtimePaths.skillsRoot;
const skillNames = readSkillNames(runtimeConfigPath);

fs.mkdirSync(targetRoot, { recursive: true });
for (const skillName of skillNames) {
  const source = path.join(sourceRoot, skillName);
  const target = path.join(targetRoot, skillName);
  if (!fs.existsSync(path.join(source, "SKILL.md"))) {
    throw new Error(`Missing staged V2 skill: ${source}`);
  }
  copyDirectory(source, target);
}

console.log(`Synced ${skillNames.length} BB + inventory + task V2 skills from ${runtimeConfigPath} to ${targetRoot}`);

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      if (!sameFileContents(sourcePath, targetPath)) {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }
}

function sameFileContents(left, right) {
  if (!fs.existsSync(right)) return false;
  const leftText = normalizeFileText(fs.readFileSync(left, "utf8"));
  const rightText = normalizeFileText(fs.readFileSync(right, "utf8"));
  return leftText === rightText;
}

function normalizeFileText(text) {
  return String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n");
}

function readSkillNames(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing Telegram runtime config: ${filePath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const names = Array.isArray(parsed?.skill_names)
    ? parsed.skill_names.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
  if (names.length === 0) {
    throw new Error(`Telegram runtime config does not define skill_names: ${filePath}`);
  }
  return names;
}
