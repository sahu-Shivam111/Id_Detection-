import test from "node:test";
import assert from "node:assert/strict";
import { buildOverlaySvg } from "./previewService.js";

test("keeps the person track label without duplicating its lanyard clue", () => {
  const svg = buildOverlaySvg(
    [
      {
        trackId: 7,
        state: "visible",
        box: { x: 100, y: 120, width: 40, height: 100 },
        companyClueLabel: "Lanyard: name match <review>",
      },
    ],
    640,
    480,
    { totalPeople: 1, idVisible: 1, idNotVisible: 0, unknown: 0 }
  );

  assert.match(svg, /Track #7 ID visible/);
  assert.doesNotMatch(svg, /Lanyard: name match/);
});

test("draws lanyard boxes and pairs escaped text tags by lanyard index", () => {
  const svg = buildOverlaySvg(
    [],
    640,
    480,
    { totalPeople: 0, idVisible: 0, idNotVisible: 0, unknown: 0 },
    [],
    [{ lanyard_index: 3, box: [80, 100, 120, 200], status: "navy_candidate" }],
    [
      {
        lanyard_index: 3,
        status: "company_text_match",
        read_text: "ACME <SERVICES>",
      },
      {
        lanyard_index: 4,
        status: "company_text_match",
        read_text: "SHOULD NOT APPEAR",
      },
    ]
  );

  assert.match(svg, /x="80" y="100" width="40" height="100" fill="none" stroke="#A855F7"/);
  assert.match(svg, /LANYARD \| NAVY CANDIDATE/);
  assert.match(svg, /TEXT \| MATCH: ACME &lt;SERVICES&gt;/);
  assert.doesNotMatch(svg, /SHOULD NOT APPEAR/);
});

test("centers smaller lanyard and text tags below the lanyard box", () => {
  const svg = buildOverlaySvg(
    [],
    640,
    480,
    { totalPeople: 0, idVisible: 0, idNotVisible: 0, unknown: 0 },
    [],
    [{ lanyard_index: 0, box: [80, 100, 120, 200], status: "navy_candidate" }],
    [{ lanyard_index: 0, status: "company_text_match", read_text: "ACME" }]
  );
  const lanyardTag = svg.match(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="\d+" fill="#A855F7"\/>/);
  const textTag = svg.match(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="\d+" fill="#0F766E"\/>/);

  assert.ok(lanyardTag);
  assert.ok(textTag);
  assert.ok(Number(lanyardTag[2]) > 200);
  assert.ok(Number(textTag[2]) > Number(lanyardTag[2]));
  assert.ok(
    Math.abs(
      Number(lanyardTag[1]) +
        Number(lanyardTag[3]) / 2 -
        Number(textTag[1]) -
        Number(textTag[3]) / 2
    ) <= 0.5
  );
  assert.match(svg, /font-size="7"/);
});

test("skips malformed lanyard boxes", () => {
  const svg = buildOverlaySvg(
    [],
    640,
    480,
    { totalPeople: 0, idVisible: 0, idNotVisible: 0, unknown: 0 },
    [],
    [
      { lanyard_index: 0, box: [10, 10, 10, 40], status: "navy_candidate" },
      { lanyard_index: 1, box: [10, 10, "bad", 40], status: "navy_candidate" },
    ]
  );

  assert.doesNotMatch(svg, /LANYARD \|/);
});

test("draws the badge box without a badge label", () => {
  const svg = buildOverlaySvg(
    [],
    640,
    480,
    { totalPeople: 0, idVisible: 0, idNotVisible: 0, unknown: 0 },
    [{ boundingBox: { x: 100, y: 120, width: 40, height: 100 } }]
  );

  assert.match(svg, /x="80" y="70" width="40" height="100" fill="none" stroke="#06B6D4"/);
  assert.doesNotMatch(svg, />BADGE</);
});

test("sanitizes and limits OCR text before embedding it in SVG", () => {
  const svg = buildOverlaySvg(
    [],
    640,
    480,
    { totalPeople: 0, idVisible: 0, idNotVisible: 0, unknown: 0 },
    [],
    [{ lanyard_index: 0, box: [80, 100, 120, 200], status: "navy_candidate" }],
    [
      {
        lanyard_index: 0,
        status: "company_text_match",
        read_text: "ACME\u0001 SERVICES COMPANY NAME THAT IS FAR TOO LONG",
      },
    ]
  );

  assert.match(svg, /TEXT \| MATCH: ACME SERVICES COMPANY NAME THAT IS/);
  assert.doesNotMatch(svg, /\u0001/);
  assert.doesNotMatch(svg, /COMPANY NAME THAT IS FAR TOO LONG/);
});
