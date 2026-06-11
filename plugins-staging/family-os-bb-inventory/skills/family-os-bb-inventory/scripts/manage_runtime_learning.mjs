import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRuntimeDir = path.resolve(scriptDir, "..", "..", "..", "runtime");
const learnedKnowledgePathName = "learned-knowledge.json";
const learningConflictsPathName = "learning-conflicts.json";
const allowedDomains = new Set(["bb_log", "inventory"]);
const allowedKinds = new Set(["alias", "vocabulary", "convention", "principle"]);

main();

function main() {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const command = process.argv[2] || "";
  if (command !== "propose-learning") {
    fail("Use: manage_runtime_learning.mjs propose-learning --payload-json \"<json>\"");
  }

  const runtimeDir = path.resolve(argument("--runtime-dir") || defaultRuntimeDir);
  const payloadJson = argument("--payload-json");
  if (!payloadJson) {
    fail("Missing --payload-json.");
  }

  const payload = parseJson(payloadJson, "payload");
  const result = proposeLearning({
    runtimeDir,
    payload,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function proposeLearning({ runtimeDir, payload }) {
  ensureDirectory(runtimeDir);

  const learnedKnowledgePath = path.join(runtimeDir, learnedKnowledgePathName);
  const learningConflictsPath = path.join(runtimeDir, learningConflictsPathName);
  const learnedKnowledge = readLearnedKnowledge(learnedKnowledgePath);
  const learningConflicts = readLearningConflicts(learningConflictsPath);
  const normalized = normalizeLearningPayload(payload);
  const now = new Date().toISOString();

  const principleConflicts = learnedKnowledge.items.filter((item) =>
    item.status === "active"
    && item.domain === normalized.domain
    && item.kind === "principle"
    && getRuleConflictGroup(item.normalized_rule) === getRuleConflictGroup(normalized.normalized_rule)
    && !areRulesEquivalent(item.normalized_rule, normalized.normalized_rule),
  );

  if (principleConflicts.length > 0) {
    const conflict = {
      id: `conflict_${randomUUID()}`,
      domain: normalized.domain,
      kind: normalized.kind,
      source_text: normalized.source_text,
      normalized_rule: normalized.normalized_rule,
      status: "pending_conflict",
      conflicts_with: principleConflicts.map((item) => item.id),
      learned_at: now,
      learned_from: normalized.learned_from,
    };
    learningConflicts.conflicts.push(conflict);
    writeJsonFile(learningConflictsPath, learningConflicts);
    return {
      ok: true,
      status: "conflict",
      conflict,
    };
  }

  const existingIndex = learnedKnowledge.items.findIndex((item) =>
    item.domain === normalized.domain
    && item.kind === normalized.kind
    && getRuleKey(item.normalized_rule) === normalized.normalized_rule.key,
  );

  const existing = existingIndex >= 0 ? learnedKnowledge.items[existingIndex] : null;
  const record = {
    id: existing?.id || `learning_${randomUUID()}`,
    domain: normalized.domain,
    kind: normalized.kind,
    source_text: normalized.source_text,
    normalized_rule: normalized.normalized_rule,
    status: "active",
    conflicts_with: [],
    learned_at: now,
    learned_from: normalized.learned_from,
  };

  if (existingIndex >= 0) {
    learnedKnowledge.items[existingIndex] = record;
  } else {
    learnedKnowledge.items.push(record);
  }

  writeJsonFile(learnedKnowledgePath, learnedKnowledge);
  return {
    ok: true,
    status: existingIndex >= 0 ? "updated" : "stored",
    record,
  };
}

function normalizeLearningPayload(payload) {
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
  if (!source) {
    fail("Learning payload must be a JSON object.");
  }

  const domain = String(source.domain || "").trim();
  const kind = String(source.kind || "").trim();
  const sourceText = String(source.source_text || "").trim();
  const learnedFrom = String(source.learned_from || "telegram").trim() || "telegram";
  const normalizedRule = normalizeRule(source.normalized_rule);

  if (!allowedDomains.has(domain)) {
    fail(`Unsupported learning domain: ${domain}`);
  }
  if (!allowedKinds.has(kind)) {
    fail(`Unsupported learning kind: ${kind}`);
  }
  if (!sourceText) {
    fail("Learning payload must include source_text.");
  }

  return {
    domain,
    kind,
    source_text: sourceText,
    normalized_rule: normalizedRule,
    learned_from: learnedFrom,
  };
}

function normalizeRule(rule) {
  const source = rule && typeof rule === "object" && !Array.isArray(rule) ? rule : null;
  if (!source) {
    fail("Learning payload must include normalized_rule.");
  }

  const key = String(source.key || "").trim();
  const statement = String(source.statement || "").trim();
  if (!key || !statement) {
    fail("normalized_rule must include key and statement.");
  }
  const conflictGroup = String(source.conflict_group || deriveConflictGroupFromKey(key)).trim();

  return {
    ...source,
    key,
    statement,
    ...(conflictGroup ? { conflict_group: conflictGroup } : {}),
  };
}

function readLearnedKnowledge(filePath) {
  const parsed = readJsonFile(filePath, {
    version: 1,
    items: [],
  });
  return {
    version: 1,
    items: Array.isArray(parsed.items) ? parsed.items : [],
  };
}

function readLearningConflicts(filePath) {
  const parsed = readJsonFile(filePath, {
    version: 1,
    conflicts: [],
  });
  return {
    version: 1,
    conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
  };
}

function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function getRuleKey(rule) {
  return String(rule?.key || "").trim();
}

function getRuleConflictGroup(rule) {
  const explicit = String(rule?.conflict_group || "").trim();
  if (explicit) return canonicalizeConflictGroup(explicit);
  return canonicalizeConflictGroup(deriveConflictGroupFromKey(getRuleKey(rule)));
}

function deriveConflictGroupFromKey(key) {
  const normalized = String(key || "").trim();
  if (!normalized) return "";
  const withoutPrefix = normalized.replace(/^.*?principle\./, "");
  const patterns = [
    /^(.+?)_prefers_[a-z0-9_]+$/i,
    /^(.+?)_means_[a-z0-9_]+$/i,
    /^(.+?)_uses_[a-z0-9_]+$/i,
    /^(.+?)_as_[a-z0-9_]+$/i,
    /^(.+?)_is_[a-z0-9_]+$/i,
  ];
  for (const pattern of patterns) {
    const match = withoutPrefix.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return normalized;
}

function canonicalizeConflictGroup(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(".", "_")
    .replace(/^inventory_/, "")
    .replace(/^bb_log_/, "")
    .replace(/^explicit_/, "")
    .replace(/_(interpretation|mode|policy|rule|preference)s?$/, "");
}

function areRulesEquivalent(left, right) {
  return JSON.stringify(sortObjectKeys(left)) === JSON.stringify(sortObjectKeys(right));
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.keys(value).sort().reduce((accumulator, key) => {
    accumulator[key] = sortObjectKeys(value[key]);
    return accumulator;
  }, {});
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`Invalid ${label} JSON: ${String(error?.message || error)}`);
  }
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? "" : process.argv[index + 1] || "";
}

function fail(message) {
  throw new Error(message);
}

function runSelfTest() {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "family-os-learning-"));
  try {
    const aliasResult = proposeLearning({
      runtimeDir,
      payload: {
        domain: "inventory",
        kind: "alias",
        source_text: "紙巾即係盒裝面紙",
        normalized_rule: {
          key: "inventory.alias.box_tissue",
          statement: "Treat 紙巾 as the boxed tissue item.",
        },
        learned_from: "telegram",
      },
    });
    if (aliasResult.status !== "stored") {
      throw new Error("Self-test failed: alias learning was not stored.");
    }

    const updatedAlias = proposeLearning({
      runtimeDir,
      payload: {
        domain: "inventory",
        kind: "alias",
        source_text: "紙巾都係指盒裝面紙",
        normalized_rule: {
          key: "inventory.alias.box_tissue",
          statement: "Treat 紙巾 as the boxed tissue item.",
        },
        learned_from: "telegram",
      },
    });
    if (updatedAlias.status !== "updated") {
      throw new Error("Self-test failed: alias learning was not updated.");
    }

    const principleResult = proposeLearning({
      runtimeDir,
      payload: {
        domain: "inventory",
        kind: "principle",
        source_text: "存貨見到剩餘量就優先當作 set-level",
        normalized_rule: {
          key: "inventory.principle.explicit_remaining_stock_prefers_set_level",
          conflict_group: "inventory.remaining_stock_interpretation",
          statement: "Explicit remaining stock means set-level.",
        },
        learned_from: "telegram",
      },
    });
    if (principleResult.status !== "stored") {
      throw new Error("Self-test failed: principle learning was not stored.");
    }

    const conflictResult = proposeLearning({
      runtimeDir,
      payload: {
        domain: "inventory",
        kind: "principle",
        source_text: "剩餘量都應該當作 consume",
        normalized_rule: {
          key: "inventory.principle.explicit_remaining_stock_prefers_consume",
          conflict_group: "inventory.remaining_stock_interpretation",
          statement: "Explicit remaining stock means consume.",
        },
        learned_from: "telegram",
      },
    });
    if (conflictResult.status !== "conflict" || !Array.isArray(conflictResult.conflict?.conflicts_with) || conflictResult.conflict.conflicts_with.length !== 1) {
      throw new Error("Self-test failed: principle conflict was not recorded.");
    }

    const derivedConflictResult = proposeLearning({
      runtimeDir,
      payload: {
        domain: "inventory",
        kind: "principle",
        source_text: "如果主人直接講剩餘存貨，應該優先當作 purchase",
        normalized_rule: {
          key: "inventory.principle.explicit_remaining_stock_prefers_purchase",
          statement: "Explicit remaining stock means purchase first.",
        },
        learned_from: "telegram",
      },
    });
    if (derivedConflictResult.status !== "conflict") {
      throw new Error("Self-test failed: derived conflict-group heuristic did not detect a conflict.");
    }

    const learnedKnowledge = readLearnedKnowledge(path.join(runtimeDir, learnedKnowledgePathName));
    const learningConflicts = readLearningConflicts(path.join(runtimeDir, learningConflictsPathName));
    if (learnedKnowledge.items.length !== 2) {
      throw new Error("Self-test failed: learned knowledge item count is invalid.");
    }
    if (learningConflicts.conflicts.length !== 2) {
      throw new Error("Self-test failed: conflict item count is invalid.");
    }

    process.stdout.write("manage_runtime_learning self-test passed.\n");
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
}
