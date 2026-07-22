import "server-only";

import { appendAdminAuditLog } from "./audit";
import type { AdminIdentity } from "./auth";
import { getAdminDatabase, type AdminDatabase } from "./database";
import { AdminPermissionError } from "./permissions";

export type RuntimeSettingValue = string | number | boolean | null;
export type RuntimeSettingSource = "ENV" | "DB" | "DEFAULT";

type SettingDefinition = {
  env: string;
  label: string;
  description: string;
  defaultValue: RuntimeSettingValue;
  sensitive: boolean;
  validate: (value: unknown) => RuntimeSettingValue;
};

const integer = (minimum: number, maximum: number, nullable = false) => (value: unknown) => {
  if (nullable && (value === null || value === "")) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new RuntimeSettingError(`Value must be an integer from ${minimum} to ${maximum}.`, "INVALID");
  }
  return parsed;
};

const integerString = (nullable = true, positive = false) => (value: unknown) => {
  if (nullable && (value === null || value === "")) return null;
  if (typeof value !== "string" || !/^\d+$/.test(value) || (positive && BigInt(value) === 0n)) {
    throw new RuntimeSettingError(
      positive ? "Value must be a positive integer string." : "Value must be a non-negative integer string.",
      "INVALID",
    );
  }
  return value;
};

const SETTINGS = {
  purchaseMode: {
    env: "PURCHASE_MODE", label: "Purchase mode",
    description: "Selects market routing, foundation direct sales, or a global pause.",
    defaultValue: "MARKET", sensitive: true,
    validate(value) {
      if (value !== "MARKET" && value !== "FOUNDATION_DIRECT" && value !== "PAUSED") {
        throw new RuntimeSettingError("Purchase mode is invalid.", "INVALID");
      }
      return value;
    },
  },
  emergencyPaused: {
    env: "FOUNDATION_DIRECT_EMERGENCY_PAUSED", label: "Emergency pause",
    description: "Prevents Foundation Direct purchase execution when enabled.",
    defaultValue: false, sensitive: true,
    validate(value) {
      if (typeof value !== "boolean") throw new RuntimeSettingError("Value must be boolean.", "INVALID");
      return value;
    },
  },
  minPurchaseLamports: {
    env: "FOUNDATION_DIRECT_MIN_PURCHASE_LAMPORTS", label: "Minimum purchase (lamports)",
    description: "Minimum accepted SOL input in lamports.", defaultValue: "1", sensitive: true,
    validate: integerString(false, true),
  },
  maxPurchaseLamports: {
    env: "FOUNDATION_DIRECT_MAX_PURCHASE_LAMPORTS", label: "Maximum purchase (lamports)",
    description: "Maximum accepted SOL input in lamports.", defaultValue: "500000000000", sensitive: true,
    validate: integerString(false, true),
  },
  maxOutputTokenUnitsPerTx: {
    env: "FOUNDATION_DIRECT_MAX_GTREE_BASE_UNITS_PER_TX", label: "Maximum output per transaction",
    description: "Optional GTREE base-unit ceiling for one transaction.", defaultValue: null, sensitive: true,
    validate: integerString(),
  },
  maxPurchaseUsdCents: {
    env: "FOUNDATION_DIRECT_MAX_PURCHASE_USD_CENTS", label: "Maximum purchase (USD cents)",
    description: "Optional USD-denominated purchase ceiling.", defaultValue: null, sensitive: true,
    validate: integerString(),
  },
  maxWalletTokenUnitsPerPeriod: {
    env: "FOUNDATION_DIRECT_MAX_WALLET_GTREE_BASE_UNITS_PER_PERIOD", label: "Wallet period limit",
    description: "Optional GTREE base-unit limit per wallet rolling period.", defaultValue: null, sensitive: true,
    validate: integerString(),
  },
  walletRollingPeriodSeconds: {
    env: "FOUNDATION_DIRECT_WALLET_ROLLING_PERIOD_SECONDS", label: "Wallet rolling period",
    description: "Rolling-limit period in seconds.", defaultValue: 86_400, sensitive: false,
    validate: integer(60, 2_592_000),
  },
  maxDailyTokenUnits: {
    env: "FOUNDATION_DIRECT_MAX_DAILY_GTREE_BASE_UNITS", label: "Daily token limit",
    description: "Optional daily GTREE base-unit issuance ceiling.", defaultValue: null, sensitive: true,
    validate: integerString(),
  },
  minRemainingInventoryTokenUnits: {
    env: "FOUNDATION_DIRECT_MIN_REMAINING_INVENTORY_BASE_UNITS", label: "Minimum remaining inventory",
    description: "GTREE base units reserved from sale inventory.", defaultValue: "0", sensitive: true,
    validate: integerString(false),
  },
  quoteExpirySeconds: {
    env: "FOUNDATION_DIRECT_QUOTE_EXPIRY_SECONDS", label: "Quote expiry",
    description: "Foundation quote lifetime in seconds.", defaultValue: 15, sensitive: false,
    validate: integer(5, 600),
  },
  priceAdjustmentBps: {
    env: "FOUNDATION_DIRECT_PRICE_ADJUSTMENT_BPS", label: "Price adjustment (bps)",
    description: "Signed basis-point adjustment applied by the existing quote policy.",
    defaultValue: 0, sensitive: true,
    validate(value) {
      const parsed = typeof value === "number" ? value : Number(value);
      if (!Number.isSafeInteger(parsed) || parsed < -2_000 || parsed > 2_000) {
        throw new RuntimeSettingError("Value must be an integer from -2000 to 2000.", "INVALID");
      }
      return parsed;
    },
  },
  priceProbeSlippageBps: {
    env: "FOUNDATION_DIRECT_PRICE_PROBE_SLIPPAGE_BPS", label: "Probe slippage (bps)",
    description: "Slippage used by existing reference-price probes.", defaultValue: 50, sensitive: false,
    validate: integer(0, 5_000),
  },
  referenceMaxSourceAgeMs: {
    env: "FOUNDATION_DIRECT_REFERENCE_MAX_SOURCE_AGE_MS", label: "Maximum source age (ms)",
    description: "Maximum age accepted for a reference-price source.", defaultValue: 10_000, sensitive: false,
    validate: integer(1_000, 300_000),
  },
  referenceMaxDivergenceBps: {
    env: "FOUNDATION_DIRECT_REFERENCE_MAX_DIVERGENCE_BPS", label: "Maximum divergence (bps)",
    description: "Maximum accepted divergence among reference sources.", defaultValue: 500, sensitive: false,
    validate: integer(0, 10_000),
  },
  referenceMinSourceCount: {
    env: "FOUNDATION_DIRECT_REFERENCE_MIN_SOURCE_COUNT", label: "Minimum source count",
    description: "Minimum healthy reference sources required.", defaultValue: 2, sensitive: false,
    validate: integer(1, 10),
  },
  referenceSourceTimeoutMs: {
    env: "FOUNDATION_DIRECT_REFERENCE_SOURCE_TIMEOUT_MS", label: "Source timeout (ms)",
    description: "Bounded timeout for each reference source.", defaultValue: 8_000, sensitive: false,
    validate: integer(500, 30_000),
  },
  referenceCacheTtlMs: {
    env: "FOUNDATION_DIRECT_REFERENCE_CACHE_TTL_MS", label: "Validated reference cache TTL (ms)",
    description: "Maximum reuse period for an already validated in-process reference price.",
    defaultValue: 7_500, sensitive: false,
    validate: integer(500, 60_000),
  },
  automaticQuoteRefreshIntervalMs: {
    env: "FOUNDATION_DIRECT_AUTO_QUOTE_REFRESH_INTERVAL_MS", label: "Automatic quote refresh interval (ms)",
    description: "Client interval for refreshing an eligible idle quote before expiry.",
    defaultValue: 7_500, sensitive: false,
    validate: integer(1_000, 60_000),
  },
} satisfies Record<string, SettingDefinition>;

export type RuntimeSettingKey = keyof typeof SETTINGS;

export interface RuntimeSettingView {
  key: RuntimeSettingKey;
  label: string;
  description: string;
  value: RuntimeSettingValue;
  source: RuntimeSettingSource;
  sensitive: boolean;
  environmentOverride: boolean;
  confirmationPhrase: string | null;
}

export class RuntimeSettingError extends Error {
  constructor(message: string, readonly code: "INVALID" | "NOT_FOUND" | "CONFIRMATION") {
    super(message);
    this.name = "RuntimeSettingError";
  }
}

export class RuntimeSettingsService {
  constructor(
    private readonly database: AdminDatabase = getAdminDatabase(),
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly now: () => number = Date.now,
  ) {}

  list(): RuntimeSettingView[] {
    return (Object.keys(SETTINGS) as RuntimeSettingKey[]).map((key) => this.get(key));
  }

  get(key: RuntimeSettingKey): RuntimeSettingView {
    const definition = SETTINGS[key];
    const envValue = this.environment[definition.env]?.trim();
    let value: RuntimeSettingValue = definition.defaultValue;
    let source: RuntimeSettingSource = "DEFAULT";
    if (envValue) {
      value = parseEnvironmentValue(definition, envValue);
      source = "ENV";
    } else {
      const row = this.database.db.prepare(
        "SELECT value_json FROM admin_runtime_settings WHERE key = ?",
      ).get(key) as { value_json: string } | undefined;
      if (row) {
        try {
          value = definition.validate(JSON.parse(row.value_json));
          source = "DB";
        } catch {
          value = definition.defaultValue;
        }
      }
    }
    return {
      key, label: definition.label, description: definition.description, value, source,
      sensitive: definition.sensitive, environmentOverride: source === "ENV",
      confirmationPhrase: definition.sensitive ? `CHANGE ${key}` : null,
    };
  }

  update(
    key: string,
    value: unknown,
    reason: string,
    confirmation: string | undefined,
    actor: AdminIdentity,
  ): RuntimeSettingView {
    if (!(key in SETTINGS)) throw new RuntimeSettingError("Setting is not approved.", "NOT_FOUND");
    const typedKey = key as RuntimeSettingKey;
    const definition = SETTINGS[typedKey];
    if (actor.role === "EDITOR" || actor.role === "VIEWER") {
      throw new AdminPermissionError("admin.settings.manage");
    }
    if (definition.sensitive && actor.role !== "OWNER") {
      throw new AdminPermissionError("admin.settings.manage");
    }
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 10 || normalizedReason.length > 500) {
      throw new RuntimeSettingError("A reason from 10 to 500 characters is required.", "INVALID");
    }
    const expected = `CHANGE ${typedKey}`;
    if (definition.sensitive && confirmation !== expected) {
      throw new RuntimeSettingError(`Type "${expected}" to confirm this sensitive change.`, "CONFIRMATION");
    }
    const old = this.get(typedKey);
    const normalized = definition.validate(value);
    const now = this.now();
    this.database.transaction(() => {
      this.database.db.prepare(`
        INSERT INTO admin_runtime_settings (
          key, value_json, description, updated_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
          description = excluded.description, updated_by_user_id = excluded.updated_by_user_id,
          updated_at = excluded.updated_at
      `).run(typedKey, JSON.stringify(normalized), definition.description, actor.id, now, now);
      this.database.db.prepare(`
        INSERT INTO admin_setting_history (
          setting_key, previous_value_json, new_value_json, changed_by_user_id, changed_at
        ) VALUES (?, ?, ?, ?, ?)
      `).run(typedKey, JSON.stringify(old.value), JSON.stringify(normalized), actor.id, now);
      appendAdminAuditLog(this.database, {
        actorUserId: actor.id, actorEmail: actor.email, actorRole: actor.role,
        action: "RUNTIME_SETTING_CHANGED", targetType: "runtime_setting", targetId: typedKey,
        metadata: {
          reason: normalizedReason, oldValue: old.value, newValue: normalized,
          sensitive: definition.sensitive,
          impact: old.environmentOverride ? "Stored value is shadowed by an environment override." : definition.description,
        },
        createdAt: now,
      });
    });
    return this.get(typedKey);
  }
}

export function resolveRuntimeSetting(
  key: RuntimeSettingKey,
  database?: AdminDatabase,
): RuntimeSettingValue {
  const definition = SETTINGS[key];
  const envValue = process.env[definition.env]?.trim();
  if (envValue) return parseEnvironmentValue(definition, envValue);
  try {
    return new RuntimeSettingsService(database ?? getAdminDatabase()).get(key).value;
  } catch {
    return definition.defaultValue;
  }
}

function parseEnvironmentValue(definition: SettingDefinition, raw: string): RuntimeSettingValue {
  if (typeof definition.defaultValue === "boolean") {
    if (raw !== "true" && raw !== "false") return definition.defaultValue;
    return definition.validate(raw === "true");
  }
  if (typeof definition.defaultValue === "number") return definition.validate(Number(raw));
  return definition.validate(raw);
}
