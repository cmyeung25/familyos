import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createFamilyOsApiClient,
  parsePayloadArgument,
  normalizeInventoryUnitAlias,
  resolveInventoryMatch,
} from "../../../../../family-os-telegram-bot/family_os_api_client.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(scriptDir, "..", "..", "..", "..", "..");
const defaultRuntimeDir = path.resolve(scriptDir, "..", "..", "..", "runtime");
const genericCountUnits = new Set(["piece"]);
const containerLikeUnits = new Set(["pack", "box", "cup", "bottle", "can", "roll"]);

main().catch((error) => {
  fail(String(error?.message || error));
});

async function main() {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const command = process.argv[2] || "";
  if (command !== "preflight") {
    fail("Use: inventory_unit_preflight.mjs preflight --payload-json \"<json>\"");
  }

  const payloadJson = argument("--payload-json");
  if (!payloadJson) {
    fail("Missing --payload-json.");
  }

  const payload = parsePayloadArgument(payloadJson);
  const client = createFamilyOsApiClient({
    workspace,
    actorId: "telegram_codex_v2_unit_preflight",
  });
  const result = await buildPreflightResult({
    client,
    payload,
    requestText: argument("--request-text"),
    runtimeDir: path.resolve(argument("--runtime-dir") || defaultRuntimeDir),
  });

  process.stdout.write(`${JSON.stringify({
    ok: true,
    action: "inventory_unit_preflight",
    result,
  }, null, 2)}\n`);
}

async function buildPreflightResult({ client, payload, requestText = "", runtimeDir }) {
  const normalizedInput = normalizePreflightPayload(payload);
  const snapshot = await client.getInventorySnapshot();
  const match = resolveInventoryMatch(snapshot, normalizedInput.item_name, {
    preferredUnit: normalizedInput.spoken_unit,
    requireExisting: normalizedInput.intent !== "restock",
  });
  const selectedItem = match.row ? summarizeInventoryRow(match.row) : null;
  const learnedKnowledge = readLearnedKnowledge(path.join(runtimeDir, "learned-knowledge.json"));
  const learnedUnitConventions = extractLearnedUnitConventions(
    learnedKnowledge,
    normalizedInput.item_name,
    selectedItem,
  );

  return {
    input: {
      ...normalizedInput,
      request_text: String(requestText || "").trim(),
    },
    inventory: {
      match_type: match.type,
      selected_item: selectedItem,
      candidates: (Array.isArray(match.candidates) ? match.candidates : []).map(summarizeInventoryRow),
    },
    learned_unit_conventions: learnedUnitConventions,
    unit_assessment: buildUnitAssessment({
      spokenUnit: normalizedInput.spoken_unit,
      selectedItem,
      learnedUnitConventions,
    }),
  };
}

function normalizePreflightPayload(payload) {
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const itemName = String(
    source.item_name
    || source.name
    || source.product_name
    || source.subject
    || "",
  ).trim();
  if (!itemName) {
    fail("Preflight payload must include item_name.");
  }

  const rawUnit = String(
    source.spoken_unit
    || source.unit
    || source.quantity_unit
    || source.uom
    || "",
  ).trim();

  return {
    item_name: itemName,
    spoken_unit: rawUnit ? normalizeInventoryUnitAlias(rawUnit) : "",
    raw_spoken_unit: rawUnit,
    quantity: normalizeNumericQuantity(source.quantity ?? source.qty ?? source.amount ?? ""),
    intent: normalizeIntent(source.intent),
  };
}

function normalizeIntent(value) {
  const intent = String(value || "").trim().toLowerCase();
  if (["consume", "restock", "set_level", "lookup"].includes(intent)) {
    return intent;
  }
  return "consume";
}

function normalizeNumericQuantity(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function summarizeInventoryRow(row) {
  return {
    item_id: String(row?.item_id || ""),
    item_name: String(row?.item_name || ""),
    canonical_item_name: String(row?.canonical_item_name || row?.item_name || ""),
    category: String(row?.category || ""),
    unit: normalizeInventoryUnitAlias(row?.unit || ""),
    quantity_on_hand: Number.isFinite(Number(row?.quantity_on_hand)) ? Number(row.quantity_on_hand) : null,
  };
}

function readLearnedKnowledge(filePath) {
  if (!fs.existsSync(filePath)) {
    return { version: 1, items: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      version: 1,
      items: Array.isArray(parsed?.items) ? parsed.items : [],
    };
  } catch {
    return { version: 1, items: [] };
  }
}

function extractLearnedUnitConventions(learnedKnowledge, inputItemName, selectedItem) {
  const itemNames = new Set([
    normalizeLookupText(inputItemName),
    normalizeLookupText(selectedItem?.item_name),
    normalizeLookupText(selectedItem?.canonical_item_name),
  ].filter(Boolean));

  return (Array.isArray(learnedKnowledge?.items) ? learnedKnowledge.items : [])
    .filter((item) => item?.domain === "inventory" && item?.status === "active")
    .map((item) => normalizeLearnedUnitConvention(item))
    .filter(Boolean)
    .filter((convention) => itemNames.has(normalizeLookupText(convention.item_name)));
}

function normalizeLearnedUnitConvention(item) {
  const normalizedRule = item?.normalized_rule && typeof item.normalized_rule === "object"
    ? item.normalized_rule
    : {};
  const itemName = String(
    normalizedRule.item_name
    || normalizedRule.canonical_item_name
    || normalizedRule.subject
    || "",
  ).trim();
  const spokenUnit = normalizeInventoryUnitAlias(
    normalizedRule.spoken_unit
    || normalizedRule.from_unit
    || normalizedRule.alias_unit
    || "",
  );
  const canonicalUnit = normalizeInventoryUnitAlias(
    normalizedRule.canonical_unit
    || normalizedRule.to_unit
    || normalizedRule.target_unit
    || "",
  );
  if (!itemName || !spokenUnit || !canonicalUnit) {
    return null;
  }

  return {
    learning_id: String(item.id || ""),
    item_name: itemName,
    spoken_unit: spokenUnit,
    canonical_unit: canonicalUnit,
    statement: String(normalizedRule.statement || "").trim(),
  };
}

function buildUnitAssessment({ spokenUnit, selectedItem, learnedUnitConventions }) {
  const canonicalUnit = normalizeInventoryUnitAlias(selectedItem?.unit || "");
  const matchingConvention = learnedUnitConventions.find((convention) =>
    convention.spoken_unit === spokenUnit && convention.canonical_unit === canonicalUnit,
  ) || null;

  if (!selectedItem) {
    return {
      status: "no_selected_item",
      spoken_unit: spokenUnit,
      canonical_unit: "",
      recommended_canonical_unit: "",
      reasons: ["no_selected_item"],
      guidance: "Resolve the inventory item first before deciding whether a colloquial unit can align.",
    };
  }

  if (!spokenUnit) {
    return {
      status: "missing_spoken_unit",
      spoken_unit: "",
      canonical_unit: canonicalUnit,
      recommended_canonical_unit: canonicalUnit,
      reasons: ["missing_spoken_unit"],
      guidance: "The inventory item is known, but the user did not state a clear unit.",
    };
  }

  if (spokenUnit === canonicalUnit) {
    return {
      status: "aligned",
      spoken_unit: spokenUnit,
      canonical_unit: canonicalUnit,
      recommended_canonical_unit: canonicalUnit,
      reasons: ["units_match"],
      guidance: "The spoken unit already matches the canonical inventory unit.",
    };
  }

  if (matchingConvention) {
    return {
      status: "safe_by_learning",
      spoken_unit: spokenUnit,
      canonical_unit: canonicalUnit,
      recommended_canonical_unit: canonicalUnit,
      reasons: ["matched_learned_unit_convention"],
      guidance: matchingConvention.statement || "A learned unit convention says this spoken unit can map to the canonical inventory unit.",
    };
  }

  const spokenIsGenericCount = genericCountUnits.has(spokenUnit);
  const canonicalIsContainerLike = containerLikeUnits.has(canonicalUnit);
  if (spokenIsGenericCount && canonicalIsContainerLike) {
    return {
      status: "llm_gatekeeper_review",
      spoken_unit: spokenUnit,
      canonical_unit: canonicalUnit,
      recommended_canonical_unit: canonicalUnit,
      reasons: ["generic_count_spoken_unit", "container_like_canonical_unit"],
      guidance: "The spoken unit is a generic count word while the stored inventory unit is a package/container unit. Use item meaning and Cantonese context to decide whether one spoken item safely equals one canonical inventory unit, otherwise ask.",
    };
  }

  return {
    status: "ask_user",
    spoken_unit: spokenUnit,
    canonical_unit: canonicalUnit,
    recommended_canonical_unit: "",
    reasons: ["unit_mismatch_without_safe_convention"],
    guidance: "The unit mismatch is not safely resolvable from current inventory master data alone.",
  };
}

function normalizeLookupText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, "");
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? "" : process.argv[index + 1] || "";
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function runSelfTest() {
  const learnedKnowledge = {
    version: 1,
    items: [
      {
        id: "learning_1",
        domain: "inventory",
        kind: "convention",
        status: "active",
        normalized_rule: {
          item_name: "公仔麵",
          spoken_unit: "個",
          canonical_unit: "包",
          statement: "Treat one colloquial 公仔麵 as one retail pack.",
        },
      },
    ],
  };
  const conventions = extractLearnedUnitConventions(learnedKnowledge, "公仔麵", {
    item_name: "公仔麵",
    canonical_item_name: "公仔麵",
  });
  if (conventions.length !== 1 || conventions[0].canonical_unit !== "pack") {
    throw new Error("Learned unit convention self-test failed.");
  }
  const assessment = buildUnitAssessment({
    spokenUnit: "piece",
    selectedItem: { item_name: "公仔麵", unit: "pack" },
    learnedUnitConventions: [],
  });
  if (assessment.status !== "llm_gatekeeper_review" || assessment.recommended_canonical_unit !== "pack") {
    throw new Error("Unit assessment self-test failed.");
  }
  console.log("inventory_unit_preflight self-test passed.");
}
