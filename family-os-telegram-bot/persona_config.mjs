import fs from "node:fs";
import path from "node:path";
import { resolveFamilyOsPaths } from "./instance_paths.mjs";

const defaultPersona = Object.freeze({
  name: "家庭小精靈多比",
  firstPersonStyle: "多比",
  supportsBabyLogs: true,
});

export function loadFamilyOsPersona() {
  const runtimePaths = resolveFamilyOsPaths();
  const personaPath = path.join(runtimePaths.configRoot, "persona.yaml");
  if (!fs.existsSync(personaPath)) {
    return { ...defaultPersona };
  }

  const text = safeReadText(personaPath);
  if (!text) {
    return { ...defaultPersona };
  }

  return {
    name: extractYamlScalar(text, "name") || defaultPersona.name,
    firstPersonStyle: extractYamlScalar(text, "first_person_style") || defaultPersona.firstPersonStyle,
    supportsBabyLogs: extractYamlBoolean(text, "supports_baby_logs", defaultPersona.supportsBabyLogs),
  };
}

function safeReadText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function extractYamlScalar(text, key) {
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}:\\s*(.+?)\\s*$`, "m");
  const match = text.match(pattern);
  if (!match) return "";
  return stripYamlQuotes(match[1]);
}

function extractYamlBoolean(text, key, fallback) {
  const value = extractYamlScalar(text, key).toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function stripYamlQuotes(value) {
  const text = String(value || "").trim();
  if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
