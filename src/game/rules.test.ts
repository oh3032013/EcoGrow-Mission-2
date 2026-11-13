import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceDay,
  buyFarmChicken,
  buyShopItem,
  claimMissionReward,
  computeFarmRestorationPercent,
  computeSoilMoisturePct,
  computeTemperatureC,
  craftItem,
  createInitialFarmState,
  eatCrop,
  getClaimableMissionsCount,
  getDayOfSeason,
  getEarnedBadges,
  getMessageFrom2040ForDay,
  getMissionProgress,
  getSeason,
  getTile,
  getTimePhase,
  hasNasaStation,
  isCoveredByCompost,
  isCoveredBySensor,
  isCoveredByShadeNet,
  isCoveredBySprinkler,
  isProtectedByScarecrow,
  performTileAction,
  sellCropItem,
  triggerMiddayDrought,
  triggerMiddayHeatwave,
  upgradeTool,
} from './rules';
import { DAYS_PER_SEASON, WELL_POS } from './constants';

test('initial state spawns player on open walkable path with starter tools and tilled tiles', () => {
  const state = createInitialFarmState(42);
  assert.equal(state.day, 1);
  assert.equal(getSeason(state.seasonIndex), 'Spring');
  assert.equal(state.hotbar[0], 'hoe');
  assert.equal(state.hotbar[1], 'watering_can');
  assert.equal(state.hotbar[2], 'axe');
  const starterTilled = getTile(state, 13, 10);
  assert.equal(starterTilled?.tilled, true);
});

test('farming lifecycle: till, plant, water, grow, and harvest wheat', () => {
  const state = createInitialFarmState(42);
  // Move adjacent to (13, 11)
  state.player.x = 13.5;
  state.player.y = 10.5;
  const tile = getTile(state, 13, 11)!;
  tile.obstacle = null;
  tile.tilled = false;

  // Till with hoe
  state.player.selectedHotbarIndex = 0;
  const tillRes = performTileAction(state, 13, 11);
  assert.equal(tillRes.performed, true);
  assert.equal(tillRes.kind, 'till');
  assert.equal(tile.tilled, true);

  // Plant wheat seed (slot 3)
  state.player.selectedHotbarIndex = 3;
  const plantRes = performTileAction(state, 13, 11);
  assert.equal(plantRes.performed, true);
  assert.equal(plantRes.kind, 'plant');
  assert.equal(tile.crop?.type, 'wheat');

  // Water with watering can (slot 1)
  state.player.selectedHotbarIndex = 1;
  const waterRes = performTileAction(state, 13, 11);
  assert.equal(waterRes.performed, true);
  assert.equal(tile.watered, true);

  // Advance Day 1 -> Day 2 (Clear weather deterministic rng returning 0.8)
  advanceDay(state, () => 0.8);
  assert.equal(tile.crop?.growthDays, 1);
  assert.equal(tile.crop?.withered, false);

  // Water again and advance Day 2 -> Day 3
  performTileAction(state, 13, 11);
  advanceDay(state, () => 0.8);
  assert.equal(tile.crop?.growthDays, 2);

  // Harvest ripe wheat
  const harvestRes = performTileAction(state, 13, 11);
  assert.equal(harvestRes.performed, true);
  assert.equal(harvestRes.kind, 'harvest');
  assert.equal(harvestRes.cropHarvested, 'wheat');
  assert.equal(tile.crop, null);
  assert.ok((state.inventory.wheat ?? 0) >= 1);
});

test('un-watered crops wither after 2 consecutive unwatered days', () => {
  const state = createInitialFarmState(42);
  state.player.x = 13.5;
  state.player.y = 9.5;
  state.player.selectedHotbarIndex = 3; // wheat_seed
  performTileAction(state, 13, 10); // already tilled starter tile
  const tile = getTile(state, 13, 10)!;
  assert.equal(tile.crop?.daysUnwatered, 0);

  // Day 1 -> 2 unwatered (rng 0.8 = Clear weather)
  advanceDay(state, () => 0.8);
  assert.equal(tile.crop?.daysUnwatered, 1);
  assert.equal(tile.crop?.withered, false);

  // Day 2 -> 3 unwatered -> should wither!
  advanceDay(state, () => 0.8);
  assert.equal(tile.crop?.daysUnwatered, 2);
  assert.equal(tile.crop?.withered, true);
});

test('drought dries watered soil at midday and rainstorm auto-waters crops', () => {
  const state = createInitialFarmState(42);
  const tile = getTile(state, 13, 10)!;
  tile.watered = true;
  state.weather = 'Drought';

  const dried = triggerMiddayDrought(state);
  assert.equal(dried, 1);
  assert.equal(tile.watered, false);
  assert.equal(tile.droughtDriedToday, true);

  // Advance into Rainstorm (rng 0.1 triggers Rainstorm in Spring)
  const summary = advanceDay(state, () => 0.1);
  assert.equal(summary.weather, 'Rainstorm');
  assert.equal(tile.watered, true);
});

test('season rolls over cleanly after DAYS_PER_SEASON days and time phases transition', () => {
  const state = createInitialFarmState(42);
  assert.equal(getTimePhase(360), 'Day');
  assert.equal(getTimePhase(1020), 'Sunset');
  assert.equal(getTimePhase(1200), 'Night');

  for (let i = 0; i < DAYS_PER_SEASON; i++) {
    advanceDay(state, () => 0.8);
  }
  assert.equal(state.day, DAYS_PER_SEASON + 1);
  assert.equal(getDayOfSeason(state.day), 1);
  assert.equal(getSeason(state.seasonIndex), 'Summer');
});

test('shop buy/sell, tool upgrades, crafting, and eating crops work accurately', () => {
  const state = createInitialFarmState(42);
  const startGold = state.player.gold;

  // Buy carrot seed (18g)
  const buy = buyShopItem(state, 'carrot_seed', 2);
  assert.equal(buy.ok, true);
  assert.equal(state.player.gold, startGold - 36);

  // Sell harvested wheat
  state.inventory.wheat = 2;
  const sell = sellCropItem(state, 'wheat', 2);
  assert.equal(sell.ok, true);
  assert.ok(sell.earned > 0);
  assert.equal(state.inventory.wheat, undefined);

  // Craft fence using starter wood
  const woodBefore = state.inventory.wood ?? 0;
  const fenceBefore = state.inventory.fence ?? 0;
  const craftRes = craftItem(state, 'fence');
  assert.equal(craftRes.ok, true);
  assert.equal(state.inventory.wood, woodBefore - 2);
  assert.equal(state.inventory.fence, fenceBefore + 2);

  // Upgrade watering can
  state.player.gold = 200;
  const upg = upgradeTool(state, 'watering_can');
  assert.equal(upg.ok, true);
  assert.equal(state.upgrades.canLevel, 2);
  assert.equal(state.player.maxWaterLevel, 20);

  // Eat carrot restores stamina
  state.player.stamina = 50;
  state.inventory.carrot = 1;
  const eat = eatCrop(state, 'carrot');
  assert.equal(eat.ok, true);
  assert.equal(state.player.stamina, 68);
});

test('scarecrow protects crops within radius and restoration percent increases as farm is improved', () => {
  const state = createInitialFarmState(42);
  const initialPct = computeFarmRestorationPercent(state);

  // Place scarecrow at (14, 12)
  state.player.x = 14.5;
  state.player.y = 11.5;
  const tile = getTile(state, 14, 12)!;
  tile.obstacle = null;
  state.player.selectedHotbarIndex = 6; // scarecrow
  const placeRes = performTileAction(state, 14, 12);
  assert.equal(placeRes.performed, true);

  assert.equal(isProtectedByScarecrow(state, 13, 10), true);
  assert.equal(isProtectedByScarecrow(state, 20, 17), false);

  const afterPct = computeFarmRestorationPercent(state);
  assert.ok(afterPct > initialPct);
});

test('watering can refills at the well', () => {
  const state = createInitialFarmState(42);
  state.player.waterLevel = 0;
  state.player.x = WELL_POS.x + 0.5;
  state.player.y = WELL_POS.y + 1.5;
  state.player.selectedHotbarIndex = 1; // watering can
  const res = performTileAction(state, WELL_POS.x, WELL_POS.y);
  assert.equal(res.performed, true);
  assert.equal(res.kind, 'refill');
  assert.equal(state.player.waterLevel, state.player.maxWaterLevel);
});

test('EcoGrow farmer challenges track planting progress and grant rewards once', () => {
  const state = createInitialFarmState(42);
  assert.equal(getClaimableMissionsCount(state), 0);

  // Prepare 4 tilled tiles adjacent to player and plant wheat seeds
  state.player.x = 14.5;
  state.player.y = 9.5;
  for (const tx of [12, 13, 14, 15]) {
    const t = getTile(state, tx, 10)!;
    t.tilled = true;
    t.obstacle = null;
    t.crop = null;
  }
  state.player.selectedHotbarIndex = 3; // wheat_seed (6 starter)
  state.player.x = 12.5;
  performTileAction(state, 12, 10);
  performTileAction(state, 13, 10);
  state.player.x = 14.5;
  performTileAction(state, 14, 10);
  performTileAction(state, 15, 10);

  assert.equal(getMissionProgress(state, 'first_sow'), 4);
  assert.equal(getClaimableMissionsCount(state), 1);

  const goldBefore = state.player.gold;
  const seedsBefore = state.inventory.wheat_seed ?? 0;
  const claim = claimMissionReward(state, 'first_sow');
  assert.equal(claim.ok, true);
  assert.equal(state.player.gold, goldBefore + 35);
  assert.equal(state.inventory.wheat_seed, seedsBefore + 3);
  assert.equal(getClaimableMissionsCount(state), 0);

  // Claiming twice must fail
  const repeat = claimMissionReward(state, 'first_sow');
  assert.equal(repeat.ok, false);
});

test('EcoGrow smart hardware: sprinkler auto-waters, sensor blocks drought, compost accelerates growth', () => {
  const state = createInitialFarmState(42);
  state.player.gold = 300;
  assert.equal(buyShopItem(state, 'sprinkler', 1).ok, true);
  assert.equal(buyShopItem(state, 'sensor', 1).ok, true);
  assert.equal(buyShopItem(state, 'compost', 1).ok, true);

  // Place sprinkler at (14, 11), sensor at (15, 11), compost at (12, 11)
  state.player.x = 14.5;
  state.player.y = 9.5;
  for (const tx of [12, 14, 15]) {
    const t = getTile(state, tx, 11)!;
    t.obstacle = null;
    t.tilled = false;
  }

  state.player.selectedHotbarIndex = state.hotbar.indexOf('sprinkler');
  assert.equal(performTileAction(state, 14, 11).performed, true);
  state.player.selectedHotbarIndex = state.hotbar.indexOf('sensor');
  assert.equal(performTileAction(state, 15, 11).performed, true);
  state.player.x = 12.5;
  state.hotbar[8] = 'compost';
  state.player.selectedHotbarIndex = 8;
  assert.equal(performTileAction(state, 12, 11).performed, true);

  assert.equal(isCoveredBySprinkler(state, 13, 10), true);
  assert.equal(isCoveredBySensor(state, 13, 10), true);
  assert.equal(isCoveredByCompost(state, 13, 10), true);

  // Soil covered by sensor resists midday drought!
  const protectedTile = getTile(state, 13, 10)!;
  protectedTile.watered = true;
  state.weather = 'Drought';
  const dried = triggerMiddayDrought(state);
  assert.equal(dried, 0);
  assert.equal(protectedTile.watered, true);

  // Plant tomato near compost (4 days normally) and advanceDay with rng=0.2 (Wait: 0.2 in Spring is Rainstorm! Use a helper rng)
  let callIdx = 0;
  const rng = () => {
    callIdx += 1;
    // compost check happens during crop loop (first call < 0.4), rollWeather happens after (want >= 0.5 for Clear)
    return callIdx === 1 ? 0.2 : 0.8;
  };
  protectedTile.crop = { type: 'tomato', growthDays: 0, daysUnwatered: 0, withered: false, floodedDays: 0 };
  const summary = advanceDay(state, rng);
  // Tomato got +1 normal growth +1 compost bonus = 2 days!
  assert.equal(protectedTile.crop?.growthDays, 2);
  // Sprinkler auto-watered starter tilled tiles (13, 14, 15 at y=10) on clear morning!
  assert.equal(protectedTile.watered, true);
  assert.ok(summary.sprinklerWatered >= 3);
  assert.equal(getMissionProgress(state, 'smart_sprinkler'), 1);
  assert.equal(getMissionProgress(state, 'soil_sensor'), 1);
});

test('farmyard chickens produce morning eggs that can be eaten or sold and progress happy_flock challenge', () => {
  const state = createInitialFarmState(42);
  state.player.gold = 400;
  assert.equal(buyFarmChicken(state).ok, true);
  assert.equal(buyFarmChicken(state).ok, true);
  assert.equal(state.chickens.length, 2);

  // Overnight produces 2 fresh eggs
  const summary = advanceDay(state, () => 0.8);
  assert.equal(summary.eggsCollected, 2);
  assert.equal(state.inventory.egg, 2);
  assert.equal(getMissionProgress(state, 'happy_flock'), 2);

  // Eat 1 egg for +30 stamina, sell 1 egg for 38g
  state.player.stamina = 40;
  assert.equal(eatCrop(state, 'egg').ok, true);
  assert.equal(state.player.stamina, 70);

  const goldBefore = state.player.gold;
  const sellRes = sellCropItem(state, 'egg', 1);
  assert.equal(sellRes.ok, true);
  assert.equal(state.player.gold, goldBefore + 38);
});

test('Fertility Bean grows in 3 days (Spring/Winter) and boosts next crop harvest by +20% (crop rotation)', () => {
  const state = createInitialFarmState(42);
  state.player.gold = 200;
  assert.equal(buyShopItem(state, 'bean_seed', 3).ok, true);

  const tile = getTile(state, 13, 10)!;
  tile.tilled = true;
  tile.obstacle = null;
  state.player.x = 13.5;
  state.player.y = 9.5;
  state.hotbar[8] = 'bean_seed';
  state.player.selectedHotbarIndex = 8;

  // Plant bean and grow 3 days
  assert.equal(performTileAction(state, 13, 10).performed, true);
  assert.equal(tile.crop?.type, 'bean');
  for (let d = 0; d < 3; d++) {
    tile.watered = true;
    advanceDay(state, () => 0.8);
  }
  assert.equal(tile.crop?.growthDays, 3);

  // Harvest bean -> sets beanRotationBonus on tile
  const beanHarvest = performTileAction(state, 13, 10);
  assert.equal(beanHarvest.performed, true);
  assert.equal(beanHarvest.cropHarvested, 'bean');
  assert.equal(tile.beanRotationBonus, true);
  assert.equal(getMissionProgress(state, 'nasa_grow_bean'), 1);

  // Eat bean (+10 stamina, +4 health)
  state.player.stamina = 50;
  assert.equal(eatCrop(state, 'bean').ok, true);
  assert.equal(state.player.stamina, 60);

  // Plant 5 subsequent wheat crops on rotated tiles to trigger +20% cumulative bonus yield
  for (let i = 0; i < 5; i++) {
    tile.beanRotationBonus = true;
    tile.crop = { type: 'wheat', growthDays: 2, daysUnwatered: 0, withered: false, floodedDays: 0 };
    const wheatBefore = state.inventory.wheat ?? 0;
    const res = performTileAction(state, 13, 10);
    assert.equal(res.performed, true);
    assert.equal(tile.beanRotationBonus, false);
    if (i < 4) {
      assert.equal(state.inventory.wheat, wheatBefore + 1);
    } else {
      // 5th crop with +20% (0.2 * 5 = 1.0) awards bonus crop!
      assert.equal(res.rotationBoosted, true);
      assert.equal(state.inventory.wheat, wheatBefore + 2);
    }
  }

  // Harvesting 3 beans unlocks Soil Friend badge
  state.stats.beansHarvested = 3;
  assert.ok(getEarnedBadges(state).includes('soil_friend'));
});

test('Heatwave withers unprotected sensitive crops unless protected by 3x3 Shade Net', () => {
  const state = createInitialFarmState(42);
  state.player.gold = 300;
  assert.equal(buyShopItem(state, 'shade_net', 1).ok, true);

  // Place shade net at (14, 11) -> shields 3x3 (13..15, 10..12)
  const netSpot = getTile(state, 14, 11)!;
  netSpot.obstacle = null;
  state.player.x = 14.5;
  state.player.y = 9.5;
  state.hotbar[8] = 'shade_net';
  state.player.selectedHotbarIndex = 8;
  assert.equal(performTileAction(state, 14, 11).performed, true);
  assert.equal(isCoveredByShadeNet(state, 13, 10), true);
  assert.equal(isCoveredByShadeNet(state, 18, 12), false);

  // Protected strawberry at (13, 10), exposed strawberry at (18, 12)
  const shadedTile = getTile(state, 13, 10)!;
  shadedTile.tilled = true;
  shadedTile.watered = true;
  shadedTile.crop = { type: 'strawberry', growthDays: 0, daysUnwatered: 0, withered: false, floodedDays: 0 };

  const exposedTile = getTile(state, 18, 12)!;
  exposedTile.obstacle = null;
  exposedTile.tilled = true;
  exposedTile.watered = true;
  exposedTile.crop = { type: 'strawberry', growthDays: 0, daysUnwatered: 0, withered: false, floodedDays: 0 };

  state.weather = 'Heatwave';
  assert.equal(triggerMiddayHeatwave(state), 1);
  assert.equal(shadedTile.watered, true);
  assert.equal(exposedTile.watered, false);

  const summary = advanceDay(state, () => 0.8);
  assert.equal(shadedTile.crop?.withered, false);
  assert.equal(exposedTile.crop?.withered, true);
  assert.equal(summary.cropsHeatDamaged, 1);

  // When all sensitive crops are shaded during a heatwave -> mission 16 completes!
  exposedTile.crop = null;
  state.weather = 'Heatwave';
  advanceDay(state, () => 0.8);
  assert.equal(getMissionProgress(state, 'nasa_heatwave_shade'), 1);
});

test('Rain Tank stores 50L on Rainstorm & refills watering can; Drip Sprinkler waters row saving 5L/tile', () => {
  const state = createInitialFarmState(42);
  state.player.gold = 500;
  assert.equal(buyShopItem(state, 'rain_tank', 1).ok, true);
  assert.equal(buyShopItem(state, 'drip_sprinkler', 1).ok, true);

  // Place rain tank at (12, 11) and drip sprinkler at (11, 10)
  const tankTile = getTile(state, 12, 11)!;
  tankTile.obstacle = null;
  const dripTile = getTile(state, 11, 10)!;
  dripTile.obstacle = null;
  state.player.x = 12.5;
  state.player.y = 9.5;
  state.hotbar[8] = 'rain_tank';
  state.player.selectedHotbarIndex = 8;
  assert.equal(performTileAction(state, 12, 11).performed, true);

  state.hotbar[7] = 'drip_sprinkler';
  state.player.selectedHotbarIndex = 7;
  assert.equal(performTileAction(state, 11, 10).performed, true);

  // Advance into a Rainstorm (rng 0.1 in Spring -> Rainstorm)
  state.forecastWeather = 'Rainstorm';
  const stormSummary = advanceDay(state, () => 0.1);
  assert.equal(stormSummary.weather, 'Rainstorm');
  assert.equal(tankTile.structure?.storedWaterCharges, 5);
  assert.equal(stormSummary.rainCollectedLiters, 50);

  // Refill empty watering can from rain tank
  state.player.waterLevel = 0;
  state.player.x = 12.5;
  state.player.y = 10.5;
  state.player.selectedHotbarIndex = 1; // watering can
  const refillRes = performTileAction(state, 12, 11);
  assert.equal(refillRes.performed, true);
  assert.equal(refillRes.kind, 'refill');
  assert.equal(state.player.waterLevel, 5);
  assert.equal(tankTile.structure?.storedWaterCharges, 0);

  // Next morning Clear: Drip Sprinkler waters row y=10 (starter tiles 13, 14, 15) and saves water!
  state.forecastWeather = 'Clear';
  const dripSummary = advanceDay(state, () => 0.8);
  assert.ok((dripSummary.dripWatered ?? 0) >= 3);
  assert.ok((dripSummary.waterSavedLiters ?? 0) >= 15);
  assert.ok(state.stats.waterSavedLiters >= 15);

  state.stats.waterSavedLiters = 50;
  assert.ok(getEarnedBadges(state).includes('water_guardian'));
});

test('NASA Station telemetry, 3-day Message from 2040 dispatch, and Time Captain badge', () => {
  const state = createInitialFarmState(42);
  state.player.gold = 300;
  assert.equal(buyShopItem(state, 'nasa_station', 1).ok, true);

  const stationTile = getTile(state, 12, 11)!;
  stationTile.obstacle = null;
  state.player.x = 12.5;
  state.player.y = 10.5;
  state.hotbar[8] = 'nasa_station';
  state.player.selectedHotbarIndex = 8;
  assert.equal(performTileAction(state, 12, 11).performed, true);
  assert.equal(hasNasaStation(state), true);
  assert.equal(getMissionProgress(state, 'nasa_install_station'), 1);

  assert.ok(computeSoilMoisturePct(state) >= 0);
  assert.ok(computeTemperatureC(state) > 0);
  assert.equal(getMessageFrom2040ForDay(2), null);
  assert.ok(getMessageFrom2040ForDay(3) !== null);

  // Advance to Day 2 then Day 3 -> Day 3 emits Message from 2040 & NASA Station summary
  const day2 = advanceDay(state, () => 0.8);
  assert.equal(day2.day, 2);
  assert.equal(day2.messageFrom2040, null);
  assert.equal(day2.hasNasaStation, true);

  const day3 = advanceDay(state, () => 0.8);
  assert.equal(day3.day, 3);
  assert.ok(day3.messageFrom2040 !== null);

  // Complete all 4 NASA missions -> Time Captain badge unlocks
  state.stats.beansHarvested = 1;
  state.stats.rainwaterCollectedLiters = 100;
  state.stats.heatwavesSurvivedWithShade = 1;
  assert.ok(getEarnedBadges(state).includes('time_captain'));
});

