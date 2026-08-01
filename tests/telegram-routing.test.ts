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
  const { conversationKey, isAdminChat, isAuthorizedAdmin, isOperationsChat } = await import("../src/lib/telegram/server");
  assert.notEqual(conversationKey("user", "private"), conversationKey("user", "-1003788760826"));
  assert.equal(isAdminChat("-1003788760826"), true);
  assert.equal(isOperationsChat("-1004415591954"), true);
  assert.equal(isAuthorizedAdmin(123, true), true);
  assert.equal(isAuthorizedAdmin(456, true), false);
  assert.equal(isAuthorizedAdmin(456), true);
  assert.equal(isAuthorizedAdmin(999), false);
});
