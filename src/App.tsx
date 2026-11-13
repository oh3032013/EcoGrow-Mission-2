import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { CraftModal } from './components/CraftModal';
import { FutureMessageModal } from './components/FutureMessageModal';
import { GameHUD, type HudSnapshot } from './components/GameHUD';
import { MissionsModal } from './components/MissionsModal';
import { NasaObservatoryModal } from './components/NasaObservatoryModal';
import { OfflineBanner } from './components/PWAInstallButton';
import { ShopModal } from './components/ShopModal';
import { StatusModal } from './components/StatusModal';
import { TitleScreen } from './components/TitleScreen';
import { TouchControls } from './components/TouchControls';
import { audioEngine } from './game/audio';
import {
  buildStatusAnnouncement,
  describeTileForBlind,
  getFacingTileCoords,
  getInitialBlindMode,
  getSmartGuidance,
  getTileSignatureForBlind,
  getTitleGuidanceText,
  saveBlindModePreference,
  speakAccessibility,
  stopAccessibilitySpeech,
} from './game/blindAssist';
import {
  DAY_END_MINUTES,
  FARMHOUSE_DOOR,
  FARMHOUSE_POS,
  GAME_MINUTES_PER_REAL_SECOND,
  ITEMS,
  NIGHT_START_MINUTES,
  SHIPPING_BIN_POS,
  SHOP_STALL_POS,
  TILE_SIZE,
  WELL_POS,
} from './game/constants';
import {
  BADGE_TEXT,
  formatFeedbackMessage,
  formatMorningSummaryText,
  getInitialLanguage,
  getItemLabel,
  saveLanguagePreference,
  translateWeather,
  UI_TEXT,
  type Language,
} from './game/i18n';
import { renderGameWorld, type CameraState } from './game/pixelArt';
import {
  advanceDay,
  buyFarmChicken,
  buyShopItem,
  claimMissionReward,
  computeFarmRestorationPercent,
  craftItem,
  createInitialFarmState,
  eatCrop,
  formatTimeClock,
  getClaimableMissionsCount,
  getDayOfSeason,
  getEarnedBadges,
  getSeason,
  getTile,
  getTimePhase,
  isNearFarmhouse,
  isNearShippingBin,
  isNearShopStall,
  isNearWell,
  isTileWalkable,
  performTileAction,
  sellCropItem,
  spawnNightWildlife,
  stepChickens,
  stepWildlife,
  triggerMiddayDrought,
  triggerMiddayHeatwave,
  upgradeTool,
} from './game/rules';
import type {
  DaySummary,
  FloatingText,
  FutureDispatch,
  GamePhase,
  GameWorldState,
  ItemId,
  MissionId,
  Particle,
  PlaceableType,
  ToolType,
} from './game/types';

const SAVE_KEY = 'ecogrow_mission_save_v1';
const LEGACY_SAVE_KEY = 'willowvale_homestead_save_v1';
const PARTICLE_POOL_SIZE = 160;

function createParticlePool(): Particle[] {
  return Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    size: 3,
    color: '#ffffff',
    gravity: 0,
  }));
}

function buildHudSnapshot(world: GameWorldState): HudSnapshot {
  let nearPrompt: HudSnapshot['nearPrompt'] = null;
  if (isNearFarmhouse(world)) {
    nearPrompt = { action: 'sleep', label: '[E] Rest in Farmhouse (Next Day)' };
  } else if (isNearShopStall(world)) {
    nearPrompt = { action: 'shop', label: '[E] Open Village Market Stall' };
  } else if (isNearWell(world)) {
    nearPrompt = { action: 'well', label: '[E] Refill Watering Can' };
  } else if (isNearShippingBin(world)) {
    nearPrompt = { action: 'bin', label: '[E] Sell Harvested Crops' };
  }

  return {
    health: world.player.health,
    maxHealth: world.player.maxHealth,
    stamina: world.player.stamina,
    maxStamina: world.player.maxStamina,
    waterLevel: world.player.waterLevel,
    maxWaterLevel: world.player.maxWaterLevel,
    gold: world.player.gold,
    day: world.day,
    dayOfSeason: getDayOfSeason(world.day),
    season: getSeason(world.seasonIndex),
    timeMinutes: world.timeMinutes,
    timeClock: formatTimeClock(world.timeMinutes),
    timePhase: getTimePhase(world.timeMinutes),
    weather: world.weather,
    restorationPct: computeFarmRestorationPercent(world),
    claimableMissions: getClaimableMissionsCount(world),
    hotbar: [...world.hotbar],
    selectedHotbarIndex: world.player.selectedHotbarIndex,
    inventory: { ...world.inventory },
    nearPrompt,
    lowStamina: world.player.stamina <= 15,
    nightWarning: world.timeMinutes >= NIGHT_START_MINUTES && world.wildlife.length > 0,
  };
}

function loadSavedWorld(): GameWorldState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(LEGACY_SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameWorldState;
    if (!parsed || !Array.isArray(parsed.tiles) || !parsed.player) return null;
    if (!Array.isArray(parsed.claimedMissions)) parsed.claimedMissions = [];
    if (!Array.isArray(parsed.chickens)) parsed.chickens = [];
    parsed.stats = {
      daysSurvived: parsed.stats?.daysSurvived ?? 1,
      cropsHarvested: parsed.stats?.cropsHarvested ?? 0,
      totalGoldEarned: parsed.stats?.totalGoldEarned ?? 0,
      wildlifeRepelled: parsed.stats?.wildlifeRepelled ?? 0,
      obstaclesCleared: parsed.stats?.obstaclesCleared ?? 0,
      seedsPlanted: parsed.stats?.seedsPlanted ?? 0,
      cropsWatered: parsed.stats?.cropsWatered ?? 0,
      defensesPlaced: parsed.stats?.defensesPlaced ?? 0,
      sprinklersPlaced: parsed.stats?.sprinklersPlaced ?? 0,
      sensorsPlaced: parsed.stats?.sensorsPlaced ?? 0,
      eggsCollected: parsed.stats?.eggsCollected ?? 0,
      nasaStationsPlaced: parsed.stats?.nasaStationsPlaced ?? 0,
      beansHarvested: parsed.stats?.beansHarvested ?? 0,
      rainwaterCollectedLiters: parsed.stats?.rainwaterCollectedLiters ?? 0,
      waterSavedLiters: parsed.stats?.waterSavedLiters ?? 0,
      heatwavesSurvivedWithShade: parsed.stats?.heatwavesSurvivedWithShade ?? 0,
    };
    parsed.rotationYieldProgress = parsed.rotationYieldProgress ?? 0;
    parsed.forecastWeather = parsed.forecastWeather ?? parsed.weather;
    return parsed;
  } catch {
    return null;
  }
}

export default function App() {
  const autostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const initialWorldRef = useRef<GameWorldState>(
    (autostart ? loadSavedWorld() : null) ?? createInitialFarmState(42)
  );
  const worldRef = useRef<GameWorldState>(initialWorldRef.current);

  const [phase, setPhase] = useState<GamePhase>(autostart ? 'playing' : 'title');
  const [hasSavedFarm, setHasSavedFarm] = useState<boolean>(() => Boolean(loadSavedWorld()));
  const [activeModal, setActiveModal] = useState<'none' | 'shop' | 'craft' | 'missions' | 'nasa'>('none');
  const [futureDispatch, setFutureDispatch] = useState<FutureDispatch | null>(null);
  const [muted, setMuted] = useState<boolean>(false);
  const [lang, setLang] = useState<Language>(() => getInitialLanguage());
  const [touchControlsEnabled, setTouchControlsEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(pointer: coarse)').matches ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth < 768 ||
      window.innerHeight < 520
    );
  });
  const touchManualOverrideRef = useRef<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    () => typeof document !== 'undefined' && Boolean(document.fullscreenElement)
  );
  const [isPortraitMobile, setIsPortraitMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const mobileLike =
      window.matchMedia('(pointer: coarse)').matches ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth < 768;
    return mobileLike && window.innerWidth < window.innerHeight && window.innerWidth < 768;
  });
  const [morningSummary, setMorningSummary] = useState<DaySummary | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(() => buildHudSnapshot(worldRef.current));
  const [blindMode, setBlindMode] = useState<boolean>(() => getInitialBlindMode());
  const [blindCaption, setBlindCaption] = useState<string>('');

  const phaseRef = useRef<GamePhase>(phase);
  const modalRef = useRef<'none' | 'shop' | 'craft' | 'missions' | 'nasa'>(activeModal);
  const futureOpenRef = useRef<boolean>(false);
  const langRef = useRef<Language>(lang);
  const blindModeRef = useRef<boolean>(blindMode);
  const earnedBadgesRef = useRef<Set<string>>(new Set(getEarnedBadges(worldRef.current)));
  const lastSpokenTileRef = useRef<string>('');
  const lastMoveSpeakAtRef = useRef<number>(0);
  const lastBumpSpeakAtRef = useRef<number>(0);
  phaseRef.current = phase;
  modalRef.current = activeModal;
  futureOpenRef.current = Boolean(futureDispatch);
  langRef.current = lang;
  blindModeRef.current = blindMode;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const keysPressedRef = useRef<Set<string>>(new Set());
  const joystickRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const handleJoystickVector = useCallback((vx: number, vy: number) => {
    joystickRef.current.x = vx;
    joystickRef.current.y = vy;
  }, []);
  const hoverTileRef = useRef<{ x: number; y: number } | null>(null);
  const cameraRef = useRef<CameraState>({
    x: worldRef.current.player.x * TILE_SIZE,
    y: worldRef.current.player.y * TILE_SIZE,
    zoom: 2,
    shakeX: 0,
    shakeY: 0,
  });
  const traumaRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>(createParticlePool());
  const particleCursorRef = useRef<number>(0);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const nextFloatingIdRef = useRef<number>(1);
  const elapsedRef = useRef<number>(0);
  const wildlifeSpawnTimerRef = useRef<number>(4);

  const announceBlind = useCallback((text: string, interrupt = true) => {
    if (!text) return;
    setBlindCaption(text);
    if (blindModeRef.current) {
      speakAccessibility(text, langRef.current, { interrupt });
    }
  }, []);

  const toggleBlindMode = useCallback(() => {
    setBlindMode((prev) => {
      const next = !prev;
      saveBlindModePreference(next);
      blindModeRef.current = next;
      if (next) {
        audioEngine.playBlindCue('toggle_on');
        const msg =
          phaseRef.current === 'title'
            ? getTitleGuidanceText(langRef.current)
            : buildStatusAnnouncement(worldRef.current, langRef.current);
        setBlindCaption(msg);
        speakAccessibility(msg, langRef.current, { interrupt: true });
      } else {
        audioEngine.playBlindCue('toggle_off');
        stopAccessibilitySpeech();
        setBlindCaption('');
      }
      return next;
    });
  }, []);

  const handleBlindScan = useCallback(() => {
    const world = worldRef.current;
    const { tx, ty } = getFacingTileCoords(world);
    const desc = describeTileForBlind(world, tx, ty, langRef.current);
    if (desc.cue === 'crop_ripe') audioEngine.playBlindCue('ripe');
    else if (desc.cue === 'crop_need_water') audioEngine.playBlindCue('dry');
    else if (desc.cue === 'danger') audioEngine.playBlindCue('danger');
    else if (desc.cue === 'obstacle') audioEngine.playBlindCue('bump');
    else audioEngine.playBlindCue('scan');

    const guide = getSmartGuidance(world, langRef.current);
    const prefix = langRef.current === 'ar' ? 'أمامك: ' : 'Ahead: ';
    announceBlind(`${prefix}${desc.text}. ${guide.text}`, true);
  }, [announceBlind]);

  const handleBlindGuide = useCallback(() => {
    const guide = getSmartGuidance(worldRef.current, langRef.current);
    audioEngine.playBlindCue(guide.targetType === 'wildlife' ? 'danger' : 'beacon');
    announceBlind(guide.text, true);
  }, [announceBlind]);

  const handleBlindStatus = useCallback(() => {
    audioEngine.playBlindCue('scan');
    const summary = buildStatusAnnouncement(worldRef.current, langRef.current);
    announceBlind(summary, true);
  }, [announceBlind]);

  // Register PWA Service Worker for Android offline play & installability
  useEffect(() => {
    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
      registerSW({ immediate: true });
    }
  }, []);

  // Sync HTML lang attribute
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const toggleLanguage = useCallback(() => {
    setLang((prev) => {
      const next: Language = prev === 'en' ? 'ar' : 'en';
      saveLanguagePreference(next);
      if (blindModeRef.current) {
        const msg =
          next === 'ar' ? 'تم التبديل إلى اللغة العربية' : 'Switched to English';
        setBlindCaption(msg);
        speakAccessibility(msg, next, { interrupt: true });
      }
      return next;
    });
  }, []);

  // Dynamically detect mobile/tablet viewport or touch input + portrait orientation
  useEffect(() => {
    const isTouchEnv = () =>
      window.matchMedia('(pointer: coarse)').matches ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth < 768 ||
      window.innerHeight < 520;

    const syncTouchDetection = () => {
      const mobileNow = isTouchEnv();
      setIsPortraitMobile(
        (window.matchMedia('(pointer: coarse)').matches ||
          navigator.maxTouchPoints > 0 ||
          window.innerWidth < 768) &&
          window.innerWidth < window.innerHeight &&
          window.innerWidth < 768
      );
      if (touchManualOverrideRef.current) return;
      setTouchControlsEnabled(mobileNow);
    };
    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && !touchManualOverrideRef.current) {
        setTouchControlsEnabled(true);
      }
    };
    const syncFullscreen = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    syncTouchDetection();
    window.addEventListener('resize', syncTouchDetection);
    window.addEventListener('orientationchange', syncTouchDetection);
    window.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => {
      window.removeEventListener('resize', syncTouchDetection);
      window.removeEventListener('orientationchange', syncTouchDetection);
      window.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('fullscreenchange', syncFullscreen);
    };
  }, []);

  const requestOptimalDisplay = useCallback(async (lockLandscape: boolean) => {
    const win = window as Window & { electronAPI?: { toggleFullscreen?: () => void } };
    if (win.electronAPI?.toggleFullscreen) return; // Electron EXE already launches fullscreen
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) {
        await el.requestFullscreen();
      }
    } catch {
      // Browser/iframe may disallow automatic fullscreen; fail silently
    }
    if (lockLandscape) {
      try {
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (type: string) => Promise<void>;
        };
        await orientation?.lock?.('landscape');
      } catch {
        // Ignore on unsupported browsers
      }
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const win = window as Window & { electronAPI?: { toggleFullscreen?: () => void } };
    if (win.electronAPI?.toggleFullscreen) {
      win.electronAPI.toggleFullscreen();
      return;
    }
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen?.();
      } else {
        await document.documentElement.requestFullscreen?.();
        const isMobile =
          window.matchMedia('(pointer: coarse)').matches ||
          navigator.maxTouchPoints > 0 ||
          window.innerWidth < 768;
        if (isMobile) {
          const orientation = screen.orientation as ScreenOrientation & {
            lock?: (type: string) => Promise<void>;
          };
          await orientation?.lock?.('landscape').catch(() => {});
        }
      }
    } catch {
      // Ignore fullscreen denial in restricted iframes
    }
  }, []);

  // Sync document.body.dataset.state for state machine & verification
  useEffect(() => {
    document.body.dataset.state = phase;
    if (phase !== 'playing') {
      joystickRef.current.x = 0;
      joystickRef.current.y = 0;
    }
  }, [phase]);

  const spawnParticleBurst = useCallback(
    (wx: number, wy: number, color: string, count: number, speed = 42, gravity = 60) => {
      const pool = particlesRef.current;
      for (let i = 0; i < count; i++) {
        const p = pool[particleCursorRef.current];
        particleCursorRef.current = (particleCursorRef.current + 1) % PARTICLE_POOL_SIZE;
        const angle = Math.random() * Math.PI * 2;
        const spd = (0.35 + Math.random() * 0.75) * speed;
        p.active = true;
        p.x = wx;
        p.y = wy;
        p.vx = Math.cos(angle) * spd;
        p.vy = Math.sin(angle) * spd - 16;
        p.life = 0.35 + Math.random() * 0.35;
        p.maxLife = p.life;
        p.size = 2 + Math.floor(Math.random() * 3);
        p.color = color;
        p.gravity = gravity;
      }
    },
    []
  );

  const addFloatingText = useCallback((wx: number, wy: number, text: string, color = '#fdf3dc') => {
    floatingTextsRef.current.push({
      id: nextFloatingIdRef.current++,
      x: wx,
      y: wy,
      text,
      color,
      life: 1.15,
      maxLife: 1.15,
    });
  }, []);

  const syncHud = useCallback(() => {
    setHud(buildHudSnapshot(worldRef.current));
  }, []);

  const saveFarm = useCallback(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(worldRef.current));
      setHasSavedFarm(true);
    } catch {
      // Ignore storage quota errors gracefully
    }
  }, []);

  const checkNewBadges = useCallback(() => {
    const world = worldRef.current;
    const currentBadges = getEarnedBadges(world);
    const newlyUnlocked = currentBadges.filter((b) => !earnedBadgesRef.current.has(b));
    if (newlyUnlocked.length === 0) return;
    for (const badgeId of newlyUnlocked) {
      earnedBadgesRef.current.add(badgeId);
      const badgeTitle = BADGE_TEXT[badgeId][langRef.current].title;
      addFloatingText(
        world.player.x * TILE_SIZE,
        (world.player.y - 1.3) * TILE_SIZE,
        `${UI_TEXT[langRef.current].badgeUnlockedToast} ${badgeTitle}`,
        '#ffe473'
      );
      if (blindModeRef.current) {
        announceBlind(`${UI_TEXT[langRef.current].badgeUnlockedToast} ${badgeTitle}`, false);
      }
    }
  }, [addFloatingText, announceBlind]);

  const triggerSleep = useCallback(() => {
    const world = worldRef.current;
    const summary = advanceDay(world);
    setMorningSummary(summary);
    if (summary.messageFrom2040) {
      setFutureDispatch(summary.messageFrom2040);
    }
    audioEngine.playSfx('morning');
    // Place farmer outside farmhouse door refreshed
    world.player.x = FARMHOUSE_DOOR.x + 0.5;
    world.player.y = FARMHOUSE_DOOR.y + 0.6;
    world.player.facingX = 0;
    world.player.facingY = 1;
    checkNewBadges();
    saveFarm();
    syncHud();
    if (blindModeRef.current) {
      const report = formatMorningSummaryText(summary, langRef.current);
      const stationPart = summary.hasNasaStation
        ? langRef.current === 'ar'
          ? ` رطوبة التربة ${summary.soilMoisturePct}%، الحرارة ${summary.tempC} درجة، توقع الغد ${translateWeather(
              summary.tomorrowWeather ?? summary.weather,
              'ar'
            )}.`
          : ` Soil moisture ${summary.soilMoisturePct}%, ${summary.tempC}C, tomorrow ${translateWeather(
              summary.tomorrowWeather ?? summary.weather,
              'en'
            )}.`
        : '';
      const futurePart = summary.messageFrom2040
        ? ` ${UI_TEXT[langRef.current].futureMsgTitle}: ${
            langRef.current === 'ar' ? summary.messageFrom2040.quoteAr : summary.messageFrom2040.quoteEn
          }`
        : '';
      announceBlind(
        (langRef.current === 'ar' ? `صباح اليوم الجديد: ${report}` : `New morning: ${report}`) +
          stationPart +
          futurePart,
        true
      );
    }
  }, [announceBlind, checkNewBadges, saveFarm, syncHud]);

  const startNewFarm = useCallback(() => {
    const isMobile =
      window.matchMedia('(pointer: coarse)').matches ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth < 768 ||
      window.innerHeight < 520;
    void requestOptimalDisplay(isMobile);
    const fresh = createInitialFarmState(42);
    worldRef.current = fresh;
    earnedBadgesRef.current = new Set(getEarnedBadges(fresh));
    cameraRef.current.x = fresh.player.x * TILE_SIZE;
    cameraRef.current.y = fresh.player.y * TILE_SIZE;
    keysPressedRef.current.clear();
    floatingTextsRef.current = [];
    setMorningSummary(null);
    setFutureDispatch(null);
    setActiveModal('none');
    setPhase('playing');
    audioEngine.playSfx('click');
    audioEngine.startAmbientMusic();
    saveFarm();
    syncHud();
    if (blindModeRef.current) {
      announceBlind(buildStatusAnnouncement(fresh, langRef.current), true);
    }
  }, [announceBlind, requestOptimalDisplay, saveFarm, syncHud]);

  const continueFarm = useCallback(() => {
    const isMobile =
      window.matchMedia('(pointer: coarse)').matches ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth < 768 ||
      window.innerHeight < 520;
    void requestOptimalDisplay(isMobile);
    const saved = loadSavedWorld();
    if (saved) {
      worldRef.current = saved;
      cameraRef.current.x = saved.player.x * TILE_SIZE;
      cameraRef.current.y = saved.player.y * TILE_SIZE;
    }
    keysPressedRef.current.clear();
    setActiveModal('none');
    setPhase('playing');
    audioEngine.playSfx('click');
    audioEngine.startAmbientMusic();
    syncHud();
    if (blindModeRef.current) {
      announceBlind(buildStatusAnnouncement(worldRef.current, langRef.current), true);
    }
  }, [announceBlind, requestOptimalDisplay, syncHud]);

  const handleInteract = useCallback(() => {
    const world = worldRef.current;
    if (isNearFarmhouse(world)) {
      triggerSleep();
      return;
    }
    if (isNearShopStall(world)) {
      audioEngine.playSfx('click');
      setActiveModal('shop');
      if (blindModeRef.current) {
        announceBlind(UI_TEXT[langRef.current].shopTitle, true);
      }
      return;
    }
    if (isNearWell(world)) {
      world.player.waterLevel = world.player.maxWaterLevel;
      audioEngine.playSfx('refill');
      spawnParticleBurst(
        (WELL_POS.x + 0.5) * TILE_SIZE,
        (WELL_POS.y + 0.5) * TILE_SIZE,
        '#77c8f2',
        10
      );
      addFloatingText(
        (WELL_POS.x + 0.5) * TILE_SIZE,
        WELL_POS.y * TILE_SIZE,
        langRef.current === 'ar' ? 'تمت تعبئة المرش' : 'Can Refilled',
        '#9ee0ff'
      );
      if (blindModeRef.current) {
        announceBlind(
          langRef.current === 'ar'
            ? `تمت تعبئة مرش المياه: ${world.player.waterLevel} شحنة`
            : `Watering can refilled: ${world.player.waterLevel}`,
          true
        );
      }
      syncHud();
      return;
    }
    if (isNearShippingBin(world)) {
      audioEngine.playSfx('click');
      setActiveModal('shop');
      if (blindModeRef.current) {
        announceBlind(UI_TEXT[langRef.current].shopTitle, true);
      }
    }
  }, [addFloatingText, announceBlind, spawnParticleBurst, syncHud, triggerSleep]);

  const handleTileClickAction = useCallback(
    (tx: number, ty: number) => {
      const world = worldRef.current;

      // Clicking directly on Farmhouse door while near sleeps
      if (
        tx >= FARMHOUSE_POS.x &&
        tx < FARMHOUSE_POS.x + FARMHOUSE_POS.w &&
        ty >= FARMHOUSE_POS.y &&
        ty < FARMHOUSE_POS.y + FARMHOUSE_POS.h &&
        isNearFarmhouse(world)
      ) {
        triggerSleep();
        return;
      }

      // Clicking directly on Shop Stall while near opens shop
      if (
        tx >= SHOP_STALL_POS.x &&
        tx < SHOP_STALL_POS.x + SHOP_STALL_POS.w &&
        ty >= SHOP_STALL_POS.y &&
        ty < SHOP_STALL_POS.y + SHOP_STALL_POS.h &&
        isNearShopStall(world)
      ) {
        audioEngine.playSfx('click');
        setActiveModal('shop');
        return;
      }

      const res = performTileAction(world, tx, ty);
      const wx = (tx + 0.5) * TILE_SIZE;
      const wy = (ty + 0.5) * TILE_SIZE;

      const feedbackText = formatFeedbackMessage(res, langRef.current);

      if (res.performed) {
        if (res.kind === 'till') {
          audioEngine.playSfx('till');
          spawnParticleBurst(wx, wy, '#8a5a38', 7, 36);
          if (blindModeRef.current) {
            announceBlind(langRef.current === 'ar' ? 'تمت حراثة التربة' : 'Soil tilled', true);
          }
        } else if (res.kind === 'plant') {
          audioEngine.playSfx('plant');
          spawnParticleBurst(wx, wy, '#a7d66f', 5, 24);
          if (blindModeRef.current) {
            announceBlind(langRef.current === 'ar' ? 'تمت زراعة البذور' : 'Seed planted', true);
          }
        } else if (res.kind === 'water' || res.kind === 'refill') {
          audioEngine.playSfx('water');
          spawnParticleBurst(wx, wy, '#6ec5f5', 9, 40);
          if (blindModeRef.current) {
            announceBlind(
              langRef.current === 'ar'
                ? `تم السقي، المتبقي ${world.player.waterLevel}`
                : `Watered, ${world.player.waterLevel} water left`,
              true
            );
          }
        } else if (res.kind === 'harvest') {
          audioEngine.playSfx('harvest');
          spawnParticleBurst(wx, wy, '#ffe473', 14, 52);
          if (feedbackText) addFloatingText(wx, wy - 8, feedbackText, '#ffe675');
          if (blindModeRef.current && feedbackText) {
            announceBlind(feedbackText, true);
          }
        } else if (res.kind === 'clear') {
          audioEngine.playSfx('clear');
          spawnParticleBurst(wx, wy, '#b59268', 9, 42);
          if (feedbackText) addFloatingText(wx, wy - 8, feedbackText, '#e8d7b7');
          if (blindModeRef.current && feedbackText) {
            announceBlind(feedbackText, true);
          }
        } else if (res.kind === 'place' || res.kind === 'repair') {
          audioEngine.playSfx('place');
          spawnParticleBurst(wx, wy, '#d6a56b', 6, 28);
          if (feedbackText) addFloatingText(wx, wy - 8, feedbackText, '#f7ebd4');
          if (blindModeRef.current) {
            announceBlind(
              feedbackText || (langRef.current === 'ar' ? 'تم الوضع' : 'Placed'),
              true
            );
          }
        } else if (res.kind === 'defend') {
          audioEngine.playSfx('defend');
          spawnParticleBurst(wx, wy, '#ff9866', 10, 56);
          if (feedbackText) addFloatingText(wx, wy - 8, feedbackText, '#ffb694');
          if (blindModeRef.current && feedbackText) {
            announceBlind(feedbackText, true);
          }
        }

        // Check 100% Farm Restoration milestone
        const pct = computeFarmRestorationPercent(world);
        if (pct >= 100 && !world.restorationVictoryDismissed) {
          world.outcome = 'restored';
          setPhase('gameover');
          audioEngine.playSfx('morning');
          if (blindModeRef.current) {
            announceBlind(UI_TEXT[langRef.current].restoredTitle, true);
          }
        }
        checkNewBadges();
        syncHud();
      } else if (res.kind === 'error' && feedbackText) {
        audioEngine.playSfx('error');
        addFloatingText(wx, wy - 10, feedbackText, '#ff9b85');
        if (blindModeRef.current) {
          announceBlind(feedbackText, true);
        }
      }
    },
    [addFloatingText, announceBlind, checkNewBadges, spawnParticleBurst, syncHud, triggerSleep]
  );

  // Keyboard Listeners (WASD/Arrows, 1-9, E, B, C, M, Esc/P) + Blur Hygiene
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();

      if (key === 'v') {
        e.preventDefault();
        toggleBlindMode();
        return;
      }

      if (phaseRef.current === 'title') {
        if (key === 'enter' || key === ' ') {
          e.preventDefault();
          if (hasSavedFarm) continueFarm();
          else startNewFarm();
        }
        return;
      }

      if (key === 'escape' || key === 'p') {
        e.preventDefault();
        if (futureOpenRef.current) {
          setFutureDispatch(null);
          audioEngine.playSfx('click');
          return;
        }
        if (modalRef.current !== 'none') {
          setActiveModal('none');
          audioEngine.playSfx('click');
          return;
        }
        if (phaseRef.current === 'playing') {
          keysPressedRef.current.clear();
          setPhase('paused');
          audioEngine.pauseAmbientMusic();
          saveFarm();
        } else if (phaseRef.current === 'paused') {
          keysPressedRef.current.clear();
          setPhase('playing');
          audioEngine.startAmbientMusic();
        }
        return;
      }

      if (phaseRef.current !== 'playing') return;

      if (key === 'm') {
        const nextMuted = !audioEngine.isMuted();
        audioEngine.setMuted(nextMuted);
        setMuted(nextMuted);
        return;
      }

      if (key === 'b') {
        e.preventDefault();
        audioEngine.playSfx('click');
        setActiveModal((prev) => {
          const next = prev === 'shop' ? 'none' : 'shop';
          if (blindModeRef.current && next === 'shop') {
            announceBlind(UI_TEXT[langRef.current].shopTitle, true);
          }
          return next;
        });
        return;
      }

      if (key === 'c' || key === 'i') {
        e.preventDefault();
        audioEngine.playSfx('click');
        setActiveModal((prev) => {
          const next = prev === 'craft' ? 'none' : 'craft';
          if (blindModeRef.current && next === 'craft') {
            announceBlind(UI_TEXT[langRef.current].craftTitle, true);
          }
          return next;
        });
        return;
      }

      if (key === 'j') {
        e.preventDefault();
        audioEngine.playSfx('click');
        setActiveModal((prev) => {
          const next = prev === 'missions' ? 'none' : 'missions';
          if (blindModeRef.current && next === 'missions') {
            announceBlind(UI_TEXT[langRef.current].missionsModalTitle, true);
          }
          return next;
        });
        return;
      }

      if (key === 'n') {
        e.preventDefault();
        audioEngine.playSfx('click');
        setActiveModal((prev) => {
          const next = prev === 'nasa' ? 'none' : 'nasa';
          if (blindModeRef.current && next === 'nasa') {
            announceBlind(UI_TEXT[langRef.current].nasaModalTitle, true);
          }
          return next;
        });
        return;
      }

      if (modalRef.current !== 'none' || futureOpenRef.current) return;

      if (key === 'f') {
        e.preventDefault();
        handleBlindScan();
        return;
      }

      if (key === 'g') {
        e.preventDefault();
        handleBlindGuide();
        return;
      }

      if (key === 'r') {
        e.preventDefault();
        handleBlindStatus();
        return;
      }

      if (key >= '1' && key <= '9') {
        const idx = parseInt(key, 10) - 1;
        worldRef.current.player.selectedHotbarIndex = idx;
        audioEngine.playSfx('click');
        if (blindModeRef.current) {
          const itemId = worldRef.current.hotbar[idx];
          if (itemId) {
            const label = getItemLabel(itemId, langRef.current).name;
            const qty = worldRef.current.inventory[itemId] ?? 0;
            const detail =
              itemId === 'watering_can'
                ? `${worldRef.current.player.waterLevel}/${worldRef.current.player.maxWaterLevel}`
                : ITEMS[itemId].category !== 'tool'
                ? `(${qty})`
                : '';
            announceBlind(`${label} ${detail}`.trim(), true);
          } else {
            announceBlind(UI_TEXT[langRef.current].emptySlot, true);
          }
        }
        syncHud();
        return;
      }

      if (key === 'e') {
        e.preventDefault();
        handleInteract();
        return;
      }

      if (key === ' ') {
        e.preventDefault();
        // Use tool on tile directly in front of farmer
        const p = worldRef.current.player;
        const fx = Math.abs(p.facingX) >= Math.abs(p.facingY) ? Math.sign(p.facingX) : 0;
        const fy = fx === 0 ? Math.sign(p.facingY || 1) : 0;
        handleTileClickAction(Math.floor(p.x + fx * 0.85), Math.floor(p.y + fy * 0.85));
        return;
      }

      keysPressedRef.current.add(key);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysPressedRef.current.delete(e.key.toLowerCase());
    };

    const clearInputs = () => {
      keysPressedRef.current.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInputs);
    document.addEventListener('visibilitychange', clearInputs);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInputs);
      document.removeEventListener('visibilitychange', clearInputs);
    };
  }, [
    announceBlind,
    continueFarm,
    handleBlindGuide,
    handleBlindScan,
    handleBlindStatus,
    handleInteract,
    handleTileClickAction,
    hasSavedFarm,
    saveFarm,
    startNewFarm,
    syncHud,
    toggleBlindMode,
  ]);

  // Decoupled Canvas Setup + Live ResizeObserver + 60Hz Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width));
      canvas.height = Math.max(1, Math.floor(rect.height));
      // Scale zoom cleanly to viewport width
      const baseZoom = rect.width < 640 ? 1.55 : rect.width < 1100 ? 1.85 : 2.15;
      cameraRef.current.zoom = baseZoom;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    let rafId = 0;
    let lastTime = performance.now();
    let hudTimer = 0;
    let smokeTimer = 0;

    const tick = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);
      elapsedRef.current += dt;

      const world = worldRef.current;
      const currentPhase = phaseRef.current;
      const modalOpen = modalRef.current !== 'none' || futureOpenRef.current;

      // Ambient chimney smoke particles
      smokeTimer += dt;
      if (smokeTimer >= 0.45) {
        smokeTimer = 0;
        spawnParticleBurst(
          (FARMHOUSE_POS.x + FARMHOUSE_POS.w - 0.65) * TILE_SIZE,
          (FARMHOUSE_POS.y - 0.35) * TILE_SIZE,
          'rgba(235, 232, 224, 0.7)',
          2,
          14,
          -22
        );
      }

      if (currentPhase === 'title') {
        // Gentle live world camera pan over the homestead on Title screen
        const centerWorldX = (world.width * TILE_SIZE) / 2;
        const centerWorldY = (world.height * TILE_SIZE) / 2;
        cameraRef.current.x = centerWorldX + Math.sin(elapsedRef.current * 0.25) * 90;
        cameraRef.current.y = centerWorldY + Math.cos(elapsedRef.current * 0.2) * 45;
      } else if (currentPhase === 'playing' && !modalOpen) {
        // 1. Time progression
        world.timeMinutes += dt * GAME_MINUTES_PER_REAL_SECOND;
        if (world.weather === 'Drought' && world.timeMinutes >= 840 && !world.droughtMiddayTriggered) {
          const dried = triggerMiddayDrought(world);
          if (dried > 0) {
            addFloatingText(
              world.player.x * TILE_SIZE,
              (world.player.y - 1) * TILE_SIZE,
              UI_TEXT[langRef.current].droughtHit,
              '#ffba6b'
            );
            if (blindModeRef.current) {
              announceBlind(UI_TEXT[langRef.current].droughtHit, true);
            }
          }
        }
        if (world.weather === 'Heatwave' && world.timeMinutes >= 840 && !world.heatwaveMiddayTriggered) {
          const exposed = triggerMiddayHeatwave(world);
          if (exposed > 0) {
            addFloatingText(
              world.player.x * TILE_SIZE,
              (world.player.y - 1) * TILE_SIZE,
              UI_TEXT[langRef.current].heatwaveHit,
              '#fb923c'
            );
            if (blindModeRef.current) {
              announceBlind(UI_TEXT[langRef.current].heatwaveHit, true);
            }
          }
        }
        // Auto-sleep if player stays up past 24:00 (with slight exhaustion penalty)
        if (world.timeMinutes >= DAY_END_MINUTES) {
          world.player.health = Math.max(0, world.player.health - 20);
          if (world.player.health <= 0) {
            world.outcome = 'exhausted';
            setPhase('gameover');
            audioEngine.pauseAmbientMusic();
          } else {
            triggerSleep();
          }
        }

        // 2. Player WASD / Arrow / Touch Thumbstick movement
        const keys = keysPressedRef.current;
        let mx = joystickRef.current.x;
        let my = joystickRef.current.y;
        if (keys.has('w') || keys.has('arrowup')) my -= 1;
        if (keys.has('s') || keys.has('arrowdown')) my += 1;
        if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
        if (keys.has('d') || keys.has('arrowright')) mx += 1;

        if (mx !== 0 || my !== 0) {
          const len = Math.hypot(mx, my);
          if (len > 1) {
            mx /= len;
            my /= len;
          }
          const speed = 4.5; // tiles/sec
          const nx = world.player.x + mx * speed * dt;
          const ny = world.player.y + my * speed * dt;

          const canStand = (px: number, py: number) => {
            const r = 0.28;
            return (
              isTileWalkable(world, Math.floor(px - r), Math.floor(py - r)) &&
              isTileWalkable(world, Math.floor(px + r), Math.floor(py - r)) &&
              isTileWalkable(world, Math.floor(px - r), Math.floor(py + r)) &&
              isTileWalkable(world, Math.floor(px + r), Math.floor(py + r))
            );
          };

          const canMoveX = canStand(nx, world.player.y);
          const canMoveY = canStand(world.player.x, ny);
          if (canMoveX) world.player.x = nx;
          if (canMoveY) world.player.y = ny;

          world.player.facingX = mx;
          world.player.facingY = my;
          world.player.walkCycle += dt * 12;

          // Blind Mode spatial feedback while walking (throttled so speech never floods)
          if (blindModeRef.current) {
            const facing = getFacingTileCoords(world);
            if (!canMoveX && !canMoveY) {
              if (now - lastBumpSpeakAtRef.current > 950) {
                lastBumpSpeakAtRef.current = now;
                audioEngine.playBlindCue('bump');
                const blocked = describeTileForBlind(world, facing.tx, facing.ty, langRef.current);
                setBlindCaption(blocked.text);
                speakAccessibility(blocked.text, langRef.current, { interrupt: true });
              }
            } else {
              const sig = `${facing.tx},${facing.ty}:${getTileSignatureForBlind(world, facing.tx, facing.ty)}`;
              if (sig !== lastSpokenTileRef.current) {
                lastSpokenTileRef.current = sig;
                const desc = describeTileForBlind(world, facing.tx, facing.ty, langRef.current);
                if (
                  desc.cue === 'crop_ripe' ||
                  desc.cue === 'crop_need_water' ||
                  desc.cue === 'building' ||
                  desc.cue === 'danger' ||
                  desc.cue === 'obstacle'
                ) {
                  if (desc.cue === 'crop_ripe') audioEngine.playBlindCue('ripe');
                  else if (desc.cue === 'crop_need_water') audioEngine.playBlindCue('dry');
                  else if (desc.cue === 'danger') audioEngine.playBlindCue('danger');
                  if (now - lastMoveSpeakAtRef.current > 800) {
                    lastMoveSpeakAtRef.current = now;
                    setBlindCaption(desc.text);
                    speakAccessibility(desc.text, langRef.current, { interrupt: true });
                  }
                }
              }
            }
          }
        }

        if (world.player.swingTimer > 0) {
          world.player.swingTimer = Math.max(0, world.player.swingTimer - dt);
        }
        if (world.player.hitFlashTimer > 0) {
          world.player.hitFlashTimer = Math.max(0, world.player.hitFlashTimer - dt);
        }

        // 3. Night Wildlife spawning & AI
        if (world.timeMinutes >= NIGHT_START_MINUTES) {
          wildlifeSpawnTimerRef.current -= dt;
          if (wildlifeSpawnTimerRef.current <= 0) {
            wildlifeSpawnTimerRef.current = 5.5 + Math.random() * 4;
            spawnNightWildlife(world);
          }
        }
        stepWildlife(
          world,
          dt,
          (tx, ty) => {
            spawnParticleBurst((tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE, '#7abf4b', 8);
            const msg = langRef.current === 'ar' ? 'أُكل محصول!' : 'Crop eaten!';
            addFloatingText((tx + 0.5) * TILE_SIZE, ty * TILE_SIZE, msg, '#ff8c75');
            if (blindModeRef.current) {
              audioEngine.playBlindCue('danger');
              announceBlind(msg, true);
            }
          },
          (dmg) => {
            traumaRef.current = Math.min(1, traumaRef.current + 0.55);
            audioEngine.playSfx('hurt');
            addFloatingText(
              world.player.x * TILE_SIZE,
              (world.player.y - 1) * TILE_SIZE,
              langRef.current === 'ar' ? `-${dmg} صحة` : `-${dmg} HP`,
              '#ff6666'
            );
            if (blindModeRef.current) {
              announceBlind(
                langRef.current === 'ar'
                  ? `تلقيت ضرراً، صحتك الآن ${Math.round(world.player.health)}`
                  : `Took damage, health now ${Math.round(world.player.health)}`,
                true
              );
            }
            if (world.player.health <= 0) {
              world.outcome = 'exhausted';
              setPhase('gameover');
              audioEngine.pauseAmbientMusic();
            }
          }
        );

        stepChickens(world, dt);

        // 4. Smooth Camera Follow + Clamp to Map Bounds
        const targetCamX = world.player.x * TILE_SIZE;
        const targetCamY = world.player.y * TILE_SIZE;
        cameraRef.current.x += (targetCamX - cameraRef.current.x) * Math.min(1, dt * 8);
        cameraRef.current.y += (targetCamY - cameraRef.current.y) * Math.min(1, dt * 8);
      }

      // Update camera shake
      if (traumaRef.current > 0) {
        traumaRef.current = Math.max(0, traumaRef.current - dt * 2.2);
        const shake = traumaRef.current * traumaRef.current * 8;
        cameraRef.current.shakeX = (Math.random() * 2 - 1) * shake;
        cameraRef.current.shakeY = (Math.random() * 2 - 1) * shake;
      } else {
        cameraRef.current.shakeX = 0;
        cameraRef.current.shakeY = 0;
      }

      // Update pooled particles
      for (const p of particlesRef.current) {
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
          continue;
        }
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      // Update floating texts
      for (let i = floatingTextsRef.current.length - 1; i >= 0; i--) {
        const ft = floatingTextsRef.current[i];
        ft.life -= dt;
        ft.y -= 18 * dt;
        if (ft.life <= 0) floatingTextsRef.current.splice(i, 1);
      }

      // Render world (throttle slightly during pause/modals so compositor stays effortless)
      const shouldDraw =
        (currentPhase === 'playing' && !modalOpen) ||
        Math.floor(elapsedRef.current * 4) !== Math.floor((elapsedRef.current - dt) * 4);
      if (shouldDraw) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const rect = container.getBoundingClientRect();
          renderGameWorld(
            ctx,
            rect.width,
            rect.height,
            world,
            cameraRef.current,
            particlesRef.current,
            floatingTextsRef.current,
            hoverTileRef.current,
            elapsedRef.current,
            currentPhase === 'title'
          );
        }
      }

      // Sync HUD only on discrete changes while playing without a modal open
      hudTimer += dt;
      if (currentPhase === 'playing' && !modalOpen && hudTimer >= 0.25) {
        hudTimer = 0;
        const nextClock = formatTimeClock(world.timeMinutes);
        setHud((prev) => {
          const nextNightWarn =
            world.timeMinutes >= NIGHT_START_MINUTES && world.wildlife.length > 0;
          const nextPromptAction = isNearFarmhouse(world)
            ? 'sleep'
            : isNearShopStall(world)
            ? 'shop'
            : isNearWell(world)
            ? 'well'
            : isNearShippingBin(world)
            ? 'bin'
            : null;
          if (
            prev.timeClock === nextClock &&
            prev.health === world.player.health &&
            prev.stamina === world.player.stamina &&
            prev.nightWarning === nextNightWarn &&
            (prev.nearPrompt?.action ?? null) === nextPromptAction
          ) {
            return prev;
          }
          return buildHudSnapshot(world);
        });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [addFloatingText, spawnParticleBurst, syncHud, triggerSleep]);

  const screenToTile = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const cam = cameraRef.current;
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const wx = (sx - rect.width / 2) / cam.zoom + cam.x;
    const wy = (sy - rect.height / 2) / cam.zoom + cam.y;
    const tx = Math.floor(wx / TILE_SIZE);
    const ty = Math.floor(wy / TILE_SIZE);
    const tile = getTile(worldRef.current, tx, ty);
    return tile ? { x: tx, y: ty } : null;
  };

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#1b1612]">
      {/* Isolated Canvas Mount */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full">
        <canvas
          ref={canvasRef}
          data-testid="farm-canvas"
          className="block w-full h-full pixel-canvas cursor-crosshair"
          onPointerMove={(e) => {
            if (phase !== 'playing' || activeModal !== 'none') return;
            hoverTileRef.current = screenToTile(e.clientX, e.clientY);
          }}
          onPointerLeave={() => {
            hoverTileRef.current = null;
          }}
          onPointerDown={(e) => {
            if (phase !== 'playing' || activeModal !== 'none') return;
            const tileCoords = screenToTile(e.clientX, e.clientY);
            if (tileCoords) {
              handleTileClickAction(tileCoords.x, tileCoords.y);
            }
          }}
        />
      </div>

      <OfflineBanner lang={lang} />

      {phase === 'title' && (
        <TitleScreen
          hasSavedFarm={hasSavedFarm}
          lang={lang}
          isFullscreen={isFullscreen}
          isPortraitMobile={isPortraitMobile}
          blindMode={blindMode}
          blindCaption={blindCaption}
          onToggleLanguage={toggleLanguage}
          onToggleFullscreen={() => void toggleFullscreen()}
          onToggleBlindMode={toggleBlindMode}
          onRequestLandscape={() => void requestOptimalDisplay(true)}
          onStartNew={startNewFarm}
          onContinue={continueFarm}
        />
      )}

      {phase !== 'title' && (
        <GameHUD
          hud={hud}
          lang={lang}
          muted={muted}
          touchControlsEnabled={touchControlsEnabled}
          isFullscreen={isFullscreen}
          blindMode={blindMode}
          blindCaption={blindCaption}
          morningSummary={morningSummary}
          onSelectHotbar={(idx) => {
            worldRef.current.player.selectedHotbarIndex = idx;
            audioEngine.playSfx('click');
            if (blindModeRef.current) {
              const itemId = worldRef.current.hotbar[idx];
              announceBlind(
                itemId ? getItemLabel(itemId, langRef.current).name : UI_TEXT[langRef.current].emptySlot,
                true
              );
            }
            syncHud();
          }}
          onTriggerNearPrompt={handleInteract}
          onOpenMissions={() => {
            audioEngine.playSfx('click');
            setActiveModal((prev) => (prev === 'missions' ? 'none' : 'missions'));
          }}
          onOpenShop={() => {
            audioEngine.playSfx('click');
            setActiveModal((prev) => (prev === 'shop' ? 'none' : 'shop'));
          }}
          onOpenCraft={() => {
            audioEngine.playSfx('click');
            setActiveModal((prev) => (prev === 'craft' ? 'none' : 'craft'));
          }}
          onOpenNasa={() => {
            audioEngine.playSfx('click');
            setActiveModal((prev) => {
              const next = prev === 'nasa' ? 'none' : 'nasa';
              if (blindModeRef.current && next === 'nasa') {
                announceBlind(UI_TEXT[langRef.current].nasaModalTitle, true);
              }
              return next;
            });
          }}
          onSleepNow={triggerSleep}
          onToggleMute={() => {
            const next = !audioEngine.isMuted();
            audioEngine.setMuted(next);
            setMuted(next);
          }}
          onToggleTouchControls={() => {
            touchManualOverrideRef.current = true;
            setTouchControlsEnabled((prev) => !prev);
          }}
          onToggleFullscreen={() => void toggleFullscreen()}
          onToggleBlindMode={toggleBlindMode}
          onBlindScan={handleBlindScan}
          onBlindGuide={handleBlindGuide}
          onBlindStatus={handleBlindStatus}
          onPause={() => {
            keysPressedRef.current.clear();
            setPhase('paused');
            audioEngine.pauseAmbientMusic();
            saveFarm();
          }}
          onDismissSummary={() => setMorningSummary(null)}
        />
      )}

      {phase === 'playing' && activeModal === 'none' && !futureDispatch && (
        <TouchControls
          visible={touchControlsEnabled}
          lang={lang}
          nearPromptLabel={hud.nearPrompt?.label ?? null}
          onVectorChange={handleJoystickVector}
          onUseTool={() => {
            const p = worldRef.current.player;
            const fx = Math.abs(p.facingX) >= Math.abs(p.facingY) ? Math.sign(p.facingX) : 0;
            const fy = fx === 0 ? Math.sign(p.facingY || 1) : 0;
            handleTileClickAction(Math.floor(p.x + fx * 0.85), Math.floor(p.y + fy * 0.85));
          }}
          onInteract={handleInteract}
        />
      )}

      {phase === 'playing' && activeModal === 'missions' && (
        <MissionsModal
          world={worldRef.current}
          lang={lang}
          onClaim={(id: MissionId) => {
            const res = claimMissionReward(worldRef.current, id);
            audioEngine.playSfx(res.ok ? 'coin' : 'error');
            if (res.ok) {
              addFloatingText(
                worldRef.current.player.x * TILE_SIZE,
                (worldRef.current.player.y - 1) * TILE_SIZE,
                UI_TEXT[langRef.current].missionClaimed,
                '#ffe473'
              );
              saveFarm();
            }
            syncHud();
          }}
          onClose={() => {
            audioEngine.playSfx('click');
            setActiveModal('none');
          }}
        />
      )}

      {phase === 'playing' && activeModal === 'shop' && (
        <ShopModal
          lang={lang}
          gold={hud.gold}
          season={hud.season}
          inventory={hud.inventory}
          upgrades={worldRef.current.upgrades}
          chickensCount={worldRef.current.chickens?.length ?? 0}
          onBuyItem={(id: ItemId, qty: number) => {
            const res = buyShopItem(worldRef.current, id, qty);
            audioEngine.playSfx(res.ok ? 'coin' : 'error');
            syncHud();
          }}
          onSellItem={(id: ItemId, qty: number) => {
            const res = sellCropItem(worldRef.current, id, qty);
            audioEngine.playSfx(res.ok ? 'coin' : 'error');
            syncHud();
          }}
          onUpgradeTool={(tool: ToolType) => {
            const res = upgradeTool(worldRef.current, tool);
            audioEngine.playSfx(res.ok ? 'harvest' : 'error');
            syncHud();
          }}
          onBuyChicken={() => {
            const res = buyFarmChicken(worldRef.current);
            audioEngine.playSfx(res.ok ? 'harvest' : 'error');
            if (res.ok) saveFarm();
            syncHud();
          }}
          onClose={() => {
            audioEngine.playSfx('click');
            setActiveModal('none');
          }}
        />
      )}

      {phase === 'playing' && activeModal === 'craft' && (
        <CraftModal
          lang={lang}
          gold={hud.gold}
          inventory={hud.inventory}
          hotbar={hud.hotbar}
          onCraft={(id: PlaceableType) => {
            const res = craftItem(worldRef.current, id);
            audioEngine.playSfx(res.ok ? 'place' : 'error');
            syncHud();
          }}
          onEatCrop={(id: ItemId) => {
            const res = eatCrop(worldRef.current, id);
            audioEngine.playSfx(res.ok ? 'harvest' : 'error');
            syncHud();
          }}
          onAssignHotbar={(id: ItemId, slotIdx: number) => {
            const world = worldRef.current;
            world.hotbar = world.hotbar.map((item) => (item === id ? null : item));
            world.hotbar[slotIdx] = id;
            world.player.selectedHotbarIndex = slotIdx;
            audioEngine.playSfx('click');
            syncHud();
          }}
          onClose={() => {
            audioEngine.playSfx('click');
            setActiveModal('none');
          }}
        />
      )}

      {phase === 'playing' && activeModal === 'nasa' && (
        <NasaObservatoryModal
          world={worldRef.current}
          lang={lang}
          onClose={() => {
            audioEngine.playSfx('click');
            setActiveModal('none');
          }}
        />
      )}

      {phase === 'playing' && futureDispatch && (
        <FutureMessageModal
          dispatch={futureDispatch}
          lang={lang}
          onClose={() => {
            audioEngine.playSfx('click');
            setFutureDispatch(null);
          }}
        />
      )}

      {(phase === 'paused' || phase === 'gameover') && (
        <StatusModal
          mode={
            phase === 'paused'
              ? 'paused'
              : worldRef.current.outcome === 'restored'
              ? 'restored'
              : 'exhausted'
          }
          lang={lang}
          stats={worldRef.current.stats}
          restorationPct={hud.restorationPct}
          gold={hud.gold}
          earnedBadges={getEarnedBadges(worldRef.current)}
          touchControlsEnabled={touchControlsEnabled}
          blindMode={blindMode}
          onToggleTouchControls={() => {
            touchManualOverrideRef.current = true;
            setTouchControlsEnabled((prev) => !prev);
          }}
          onToggleLanguage={toggleLanguage}
          onToggleBlindMode={toggleBlindMode}
          onResume={() => {
            if (worldRef.current.outcome === 'restored') {
              worldRef.current.restorationVictoryDismissed = true;
              worldRef.current.outcome = 'none';
            }
            keysPressedRef.current.clear();
            setPhase('playing');
            audioEngine.startAmbientMusic();
          }}
          onRestart={startNewFarm}
          onReturnTitle={() => {
            saveFarm();
            setActiveModal('none');
            setPhase('title');
            audioEngine.pauseAmbientMusic();
          }}
        />
      )}
    </main>
  );
}
