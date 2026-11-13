import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStatusAnnouncement,
  describeTileForBlind,
  formatDirectionSteps,
  getSmartGuidance,
} from './blindAssist';
import { FARMHOUSE_DOOR, WELL_POS } from './constants';
import { createInitialFarmState } from './rules';

test('formatDirectionSteps converts coordinate deltas to clear Arabic and English steps', () => {
  assert.equal(formatDirectionSteps(0, 0, 'ar'), 'عند موقعك تماماً');
  assert.equal(formatDirectionSteps(3, -2, 'ar'), '2 خطوات شمالاً و 3 خطوات شرقاً');
  assert.equal(formatDirectionSteps(-1, 4, 'en'), '4 south, 1 west');
});

test('describeTileForBlind identifies buildings, crops, obstacles, and wildlife accurately', () => {
  const world = createInitialFarmState(42);

  // Stone well
  const wellDescAr = describeTileForBlind(world, WELL_POS.x, WELL_POS.y, 'ar');
  assert.equal(wellDescAr.cue, 'building');
  assert.match(wellDescAr.text, /البئر الحجري/);

  // Plant a ripe wheat crop and verify ripe detection
  const tilledTile = world.tiles.find((t) => t.tilled && !t.crop);
  assert.ok(tilledTile);
  tilledTile.crop = {
    type: 'wheat',
    growthDays: 2,
    daysUnwatered: 0,
    withered: false,
    floodedDays: 0,
  };
  const ripeDescEn = describeTileForBlind(world, tilledTile.x, tilledTile.y, 'en');
  assert.equal(ripeDescEn.cue, 'crop_ripe');
  assert.match(ripeDescEn.text, /Ripe Golden Wheat/);

  // Nocturnal wildlife near tile triggers danger cue
  world.wildlife.push({
    id: 1,
    kind: 'boar',
    x: 10.5,
    y: 10.5,
    vx: 0,
    vy: 0,
    hp: 3,
    maxHp: 3,
    state: 'approaching',
    stateTimer: 1,
    targetTileX: 10,
    targetTileY: 10,
    facingX: 1,
    hitFlashTimer: 0,
    hopPhase: 0,
  });
  const dangerAr = describeTileForBlind(world, 10, 10, 'ar');
  assert.equal(dangerAr.cue, 'danger');
  assert.match(dangerAr.text, /خنزير بري/);
});

test('getSmartGuidance prioritizes nocturnal danger, low stamina, empty watering can, and ripe crops', () => {
  const world = createInitialFarmState(42);

  // 1. Empty watering can directs to well
  world.player.waterLevel = 0;
  const wellGuide = getSmartGuidance(world, 'ar');
  assert.equal(wellGuide.targetType, 'well');
  assert.match(wellGuide.text, /البئر/);

  // 2. Low stamina directs to farmhouse door
  world.player.waterLevel = 12;
  world.player.stamina = 10;
  const staminaGuide = getSmartGuidance(world, 'en');
  assert.equal(staminaGuide.targetType, 'farmhouse');
  assert.match(staminaGuide.text, /Low stamina/);

  // 3. Healthy with ripe crop guides to ripe crop
  world.player.stamina = 100;
  const tilledTile = world.tiles.find((t) => t.tilled && !t.crop);
  assert.ok(tilledTile);
  tilledTile.crop = {
    type: 'carrot',
    growthDays: 3,
    daysUnwatered: 0,
    withered: false,
    floodedDays: 0,
  };
  const ripeGuide = getSmartGuidance(world, 'ar');
  assert.equal(ripeGuide.targetType, 'ripe_crop');
  assert.match(ripeGuide.text, /جزر طازج/);

  // 4. Night wildlife overrides everything with danger warning
  world.timeMinutes = 1200;
  world.wildlife.push({
    id: 2,
    kind: 'rabbit',
    x: FARMHOUSE_DOOR.x + 3,
    y: FARMHOUSE_DOOR.y,
    vx: 0,
    vy: 0,
    hp: 1,
    maxHp: 1,
    state: 'approaching',
    stateTimer: 1,
    targetTileX: 10,
    targetTileY: 10,
    facingX: -1,
    hitFlashTimer: 0,
    hopPhase: 0,
  });
  const dangerGuide = getSmartGuidance(world, 'en');
  assert.equal(dangerGuide.targetType, 'wildlife');
  assert.match(dangerGuide.text, /Danger: wild rabbit/);
});

test('buildStatusAnnouncement includes key vitality, resource, and facing summary', () => {
  const world = createInitialFarmState(42);
  const arReport = buildStatusAnnouncement(world, 'ar');
  assert.match(arReport, /الربيع اليوم 1/);
  assert.match(arReport, /الصحة 100/);
  assert.match(arReport, /الذهب 85/);

  const enReport = buildStatusAnnouncement(world, 'en');
  assert.match(enReport, /Spring Day 1/);
  assert.match(enReport, /Gold 85/);
});
