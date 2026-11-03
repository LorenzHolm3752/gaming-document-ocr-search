import { strict as assert } from "node:assert";
import { moderationDecision } from "./ocr_search_service.ts";

const readableRule = "A player may spend one action to repair a damaged ship, then draw two event cards and resolve them in order.";
assert.equal(moderationDecision(readableRule, "high"), "publish");
assert.equal(moderationDecision("blurred", "high"), "review");
assert.equal(moderationDecision(readableRule, "balanced"), "review");
console.log("moderation decision test passed");
