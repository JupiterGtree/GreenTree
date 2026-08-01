import "./server-only-shim.cjs";
import test from "node:test";
import assert from "node:assert/strict";

process.env.TELEGRAM_BOT_ENABLED = "true";
process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.TELEGRAM_WEBHOOK_SECRET = "test-secret";
process.env.TELEGRAM_ADMIN_GROUP_ID = "-1003788760826";
process.env.TELEGRAM_OPERATIONS_CHANNEL_ID = "-1004415591954";
process.env.TELEGRAM_OWNER_USER_IDS = "123";
process.env.TELEGRAM_ADMIN_USER_IDS = "456";

test("global actions and callbacks bypass guided conversation states", async () => {
  const { isGlobalTelegramAction, parsePublicCallback } = await import("../src/lib/telegram/server");
  assert.equal(isGlobalTelegramAction("📈 Live Price"), true);
  assert.equal(isGlobalTelegramAction("My GTREE"), true);
  assert.equal(parsePublicCallback("public:purchase_history"), "purchase_history");
  assert.equal(parsePublicCallback("support:category:purchase"), null);
});

test("conversation scope includes chat and admin authorization is numeric", async () => {
  const { conversationKey, isAdminChat, isAuthorizedAdmin, isOperationsChat, classifyTelegramChat } = await import("../src/lib/telegram/server");
  assert.notEqual(conversationKey("user", "private"), conversationKey("user", "-1003788760826"));
  assert.equal(isAdminChat("-1003788760826"), true);
  assert.equal(isOperationsChat("-1004415591954"), true);
  assert.equal(isAuthorizedAdmin(123, true), true);
  assert.equal(isAuthorizedAdmin(456, true), false);
  assert.equal(isAuthorizedAdmin(456), true);
  assert.equal(isAuthorizedAdmin(999), false);
  assert.equal(classifyTelegramChat("-1003788760826", "group"), "admin");
  assert.equal(classifyTelegramChat("-1004415591954", "channel"), "operations");
  assert.equal(classifyTelegramChat("-7", "group"), "other_group");
});

test("admin panel uses only admin callbacks and no public reply keyboard", async () => {
  const { adminPanelMarkup } = await import("../src/lib/telegram/server");
  const markup = adminPanelMarkup() as { inline_keyboard: Array<Array<{ callback_data: string }>> };
  const callbacks = markup.inline_keyboard.flat().map((button) => button.callback_data);
  assert.ok(callbacks.includes("admin:summary"));
  assert.ok(callbacks.includes("admin:distribution:create"));
  assert.ok(callbacks.every((value) => value.startsWith("admin:")));
});

test("distribution callbacks carry only opaque, bounded state", async () => {
  const { parseDistributionCallback } = await import("../src/lib/telegram/server");
  const operationId = "01234567-89ab-cdef-0123-456789abcdef";
  assert.deepEqual(parseDistributionCallback(`distribution:cancel:${operationId}`), { action: "cancel", operationId });
  assert.deepEqual(parseDistributionCallback(`distribution:category:${operationId}:2`), { action: "category", operationId, index: 2 });
  assert.deepEqual(parseDistributionCallback("distribution:confirm:0123456789abcdef0123456789abcdef"), { action: "confirm", token: "0123456789abcdef0123456789abcdef" });
  assert.equal(parseDistributionCallback("distribution:confirm:recipient-wallet-secret"), null);
  assert.equal(parseDistributionCallback(`distribution:cancel:${operationId}:wallet=secret`), null);
});
