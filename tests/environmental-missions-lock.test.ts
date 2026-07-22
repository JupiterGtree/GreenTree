import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEMO_MISSIONS } from "../src/lib/data/mock-missions";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("disabled explorer renders the Foundation overlay with exactly three readable ideas", () => {
  const explorer = source("../src/features/missions/missions-explorer.tsx");
  assert.match(explorer, /Foundation Phase/i);
  assert.match(explorer, /text-\[#F59E0B\]/);
  assert.match(explorer, /backdrop-blur-\[1px\]/);
  const ideas = [
    "Green Tree is currently operating in the Foundation phase.",
    "Environmental missions will open only after funding, governance, local partnerships, permissions, and reporting standards are fully established.",
    "Until then, the records below are shown only as examples of the future verification format and cannot be opened or interacted with.",
  ];
  assert.equal(ideas.filter((idea) => explorer.includes(`<p>${idea}</p>`)).length, 3);
});

test("disabled explorer locks filters, cards, pointer input, and keyboard focus", () => {
  const explorer = source("../src/features/missions/missions-explorer.tsx");
  const card = source("../src/features/missions/mission-card.tsx");
  assert.match(explorer, /disabled=\{!enabled\}/);
  assert.match(explorer, /inert=\{!enabled\}/);
  assert.match(explorer, /pointer-events-none/);
  assert.match(explorer, /<MissionCard[^>]+enabled=\{enabled\}/s);
  assert.match(card, /if \(!enabled\)/);
  assert.match(card, /return <div[^>]+aria-disabled="true"/);
  assert.match(card, /return <Link href=\{`\/missions\/\$\{mission\.slug\}`\}/);
});

test("mission page passes the persisted switch and detail routes fail closed", () => {
  const page = source("../src/app/missions/page.tsx");
  const detail = source("../src/app/missions/[slug]/page.tsx");
  assert.match(page, /getSiteContent\(\)\.environmentalMissionsEnabled/);
  assert.match(page, /enabled=\{missionsEnabled\}/);
  assert.match(detail, /if \(!getSiteContent\(\)\.environmentalMissionsEnabled\) notFound\(\)/);
});

test("the lock introduces no fake mission records", () => {
  assert.equal(DEMO_MISSIONS.length, 6);
  assert.ok(DEMO_MISSIONS.every((mission) => mission.isExample));
});
