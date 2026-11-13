export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';

export type WeatherType = 'Clear' | 'Drought' | 'Rainstorm' | 'Heatwave';

export type TimePhase = 'Day' | 'Sunset' | 'Night';

export type CropType = 'wheat' | 'carrot' | 'tomato' | 'strawberry' | 'pumpkin' | 'bean';

export type ToolType = 'hoe' | 'watering_can' | 'axe';

export type PlaceableType =
  | 'fence'
  | 'scarecrow'
  | 'lantern'
  | 'flowerbed'
  | 'stone_path'
  | 'sprinkler'
  | 'sensor'
  | 'compost'
  | 'nasa_station'
  | 'rain_tank'
  | 'shade_net'
  | 'drip_sprinkler';

export type ResourceType = 'wood' | 'stone';

export type ItemCategory = 'tool' | 'seed' | 'placeable' | 'crop' | 'resource';

export type ItemId =
  | ToolType
  | `${CropType}_seed`
  | PlaceableType
  | CropType
  | 'egg'
  | ResourceType;

export interface ItemDef {
  id: ItemId;
  name: string;
  category: ItemCategory;
  description: string;
  roleClue: string;
  buyPrice?: number;
  sellPrice?: number;
  edibleStamina?: number;
  edibleHealth?: number;
  cropType?: CropType;
  placeableType?: PlaceableType;
}

export interface CropDef {
  id: CropType;
  name: string;
  seedId: `${CropType}_seed`;
  daysToGrow: number;
  seedPrice: number;
  sellPrice: number;
  favoriteSeasons: Season[];
  edibleStamina: number;
  edibleHealth: number;
  color: string;
  accentColor: string;
}

export type TileTerrain =
  | 'grass'
  | 'dirt_path'
  | 'water'
  | 'farmhouse'
  | 'shop_stall'
  | 'shipping_bin'
  | 'well'
  | 'forest_edge';

export type ObstacleType = 'weed' | 'rock' | 'stump';

export interface CropInstance {
  type: CropType;
  growthDays: number;
  daysUnwatered: number;
  withered: boolean;
  floodedDays: number;
}

export interface StructureInstance {
  type: PlaceableType;
  hp: number;
  maxHp: number;
  storedWaterCharges?: number;
}

export interface FarmTile {
  x: number;
  y: number;
  terrain: TileTerrain;
  tillable: boolean;
  tilled: boolean;
  watered: boolean;
  droughtDriedToday: boolean;
  beanRotationBonus?: boolean;
  obstacle: ObstacleType | null;
  crop: CropInstance | null;
  structure: StructureInstance | null;
}

export interface InventorySlot {
  id: ItemId;
  count: number;
}

export interface ToolUpgrades {
  hoeLevel: number; // 1 = Rusty, 2 = Copper, 3 = Iron
  canLevel: number; // 1 = Wood (12), 2 = Copper (20), 3 = Iron (30)
  axeLevel: number; // 1 = Rusty, 2 = Copper, 3 = Iron
}

export type WildlifeKind = 'rabbit' | 'boar';

export type WildlifeState = 'approaching' | 'nibbling' | 'windup' | 'charging' | 'fleeing' | 'ko';

export interface WildlifeEntity {
  id: number;
  kind: WildlifeKind;
  x: number; // world tile units (float)
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  state: WildlifeState;
  stateTimer: number;
  targetTileX: number | null;
  targetTileY: number | null;
  facingX: number;
  hitFlashTimer: number;
  hopPhase: number;
}

export interface FarmChicken {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facingX: number;
  hopPhase: number;
  moveTimer: number;
}

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
}

export interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface PlayerState {
  x: number; // world tile units (center)
  y: number;
  facingX: number;
  facingY: number;
  walkCycle: number;
  swingTimer: number;
  swingTool: ToolType | null;
  hitFlashTimer: number;
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  waterLevel: number;
  maxWaterLevel: number;
  gold: number;
  selectedHotbarIndex: number;
}

export interface FutureDispatch {
  day: number;
  quoteAr: string;
  quoteEn: string;
}

export interface DaySummary {
  day: number;
  season: Season;
  weather: WeatherType;
  cropsGrown: number;
  cropsWithered: number;
  cropsFlooded: number;
  cropsHeatDamaged?: number;
  wildlifeDamage: number;
  eggsCollected: number;
  sprinklerWatered: number;
  dripWatered?: number;
  waterSavedLiters?: number;
  rainCollectedLiters?: number;
  hasNasaStation?: boolean;
  soilMoisturePct?: number;
  tempC?: number;
  tomorrowWeather?: WeatherType;
  messageFrom2040?: FutureDispatch | null;
  message: string;
}

export interface FarmStats {
  daysSurvived: number;
  cropsHarvested: number;
  totalGoldEarned: number;
  wildlifeRepelled: number;
  obstaclesCleared: number;
  seedsPlanted: number;
  cropsWatered: number;
  defensesPlaced: number;
  sprinklersPlaced: number;
  sensorsPlaced: number;
  eggsCollected: number;
  nasaStationsPlaced: number;
  beansHarvested: number;
  rainwaterCollectedLiters: number;
  waterSavedLiters: number;
  heatwavesSurvivedWithShade: number;
}

export type MissionId =
  | 'first_sow'
  | 'eco_water'
  | 'first_harvest'
  | 'land_steward'
  | 'night_guard'
  | 'smart_sprinkler'
  | 'soil_sensor'
  | 'happy_flock'
  | 'wild_defender'
  | 'market_trader'
  | 'climate_survivor'
  | 'ecogrow_master'
  | 'nasa_install_station'
  | 'nasa_grow_bean'
  | 'nasa_rain_100l'
  | 'nasa_heatwave_shade';

export type BadgeId = 'time_captain' | 'water_guardian' | 'soil_friend';

export interface MissionDef {
  id: MissionId;
  category?: 'core' | 'nasa';
  target: number;
  rewardGold: number;
  rewardItem?: { id: ItemId; qty: number };
  rewardStamina?: number;
}

export interface GameWorldState {
  day: number;
  seasonIndex: number; // 0: Spring, 1: Summer, 2: Autumn, 3: Winter
  timeMinutes: number; // 360 (6:00) to 1440 (24:00)
  weather: WeatherType;
  forecastWeather?: WeatherType;
  droughtMiddayTriggered: boolean;
  heatwaveMiddayTriggered?: boolean;
  width: number;
  height: number;
  tiles: FarmTile[];
  player: PlayerState;
  hotbar: (ItemId | null)[]; // 9 slots
  inventory: Partial<Record<ItemId, number>>;
  upgrades: ToolUpgrades;
  wildlife: WildlifeEntity[];
  chickens: FarmChicken[];
  stats: FarmStats;
  claimedMissions: MissionId[];
  rotationYieldProgress?: number;
  lastSummary: DaySummary | null;
  restorationVictoryDismissed: boolean;
  outcome: 'none' | 'exhausted' | 'restored';
}

export interface CraftRecipe {
  id: PlaceableType;
  name: string;
  description: string;
  ingredients: Partial<Record<ResourceType | 'gold', number>>;
  outputCount: number;
}
