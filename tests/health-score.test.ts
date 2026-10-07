import assert from "node:assert/strict";
import test from "node:test";
import { calculateHealthScore } from "../app/lib/health-score";

const healthyInputs = {
  operatingMargin: 0.15,
  operatingCashFlow: 130_000,
  currentRatio: 2,
  daysCashOnHand: 90,
  debtToEquity: 0.8,
};

test("calculates a deterministic health score when all required metrics are available", () => {
  const first = calculateHealthScore(healthyInputs);
  const second = calculateHealthScore(healthyInputs);

  assert.deepEqual(first, second);
  assert.equal(first.score, 95);
  assert.equal(first.status, "Healthy");
  assert.equal(first.completeness, 100);
  assert.deepEqual(first.missingMetrics, []);
});

test("does not calculate a health score when a required metric is missing", () => {
  const result = calculateHealthScore({ ...healthyInputs, daysCashOnHand: null });

  assert.equal(result.score, null);
  assert.equal(result.status, "Incomplete data");
  assert.equal(result.completeness, 80);
  assert.deepEqual(result.missingMetrics, ["daysCashOnHand"]);
  assert.deepEqual(result.missingMetricLabels, ["days cash on hand"]);
});

test("treats non-finite values as missing instead of scoring assumptions", () => {
  const result = calculateHealthScore({ ...healthyInputs, currentRatio: Number.NaN });

  assert.equal(result.score, null);
  assert.equal(result.completeness, 80);
  assert.deepEqual(result.missingMetrics, ["currentRatio"]);
});

test("treats zero as an available value and applies the defined score penalty", () => {
  const result = calculateHealthScore({ ...healthyInputs, operatingCashFlow: 0 });

  assert.equal(result.score, 73);
  assert.equal(result.status, "Watch");
  assert.equal(result.completeness, 100);
});

test("does not reward a negative debt-to-equity ratio", () => {
  const result = calculateHealthScore({ ...healthyInputs, debtToEquity: -0.5 });

  assert.equal(result.score, 83);
  assert.equal(result.status, "Healthy");
});
