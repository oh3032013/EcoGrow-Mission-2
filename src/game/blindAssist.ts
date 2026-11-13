import {
  CROPS,
  FARMHOUSE_DOOR,
  FARMHOUSE_POS,
  ITEMS,
  NIGHT_START_MINUTES,
  SHIPPING_BIN_POS,
  SHOP_STALL_POS,
  WELL_POS,
} from './constants';
import {
  formatTimeLocalized,
  getItemLabel,
  ITEM_AR,
  translateSeason,
  translateWeather,
  type Language,
} from './i18n';
import {
  computeFarmRestorationPercent,
  getClaimableMissionsCount,
  getDayOfSeason,
  getSeason,
  getTile,
  isNearFarmhouse,
  isNearShippingBin,
  isNearShopStall,
  isNearWell,
} from './rules';
import type { CropType, GameWorldState } from './types';

const BLIND_MODE_STORAGE_KEY = 'ecogrow_blind_mode';

export type BlindAudioCue =
  | 'clear'
  | 'crop_ripe'
  | 'crop_need_water'
  | 'crop_growing'
  | 'obstacle'
  | 'building'
  | 'danger'
  | 'water'
  | 'soil';

export function getInitialBlindMode(): boolean {
  if (typeof window === 'undefined') return false;
  const param = new URLSearchParams(window.location.search).get('blind');
  if (param === '1' || param === 'true') return true;
  if (param === '0' || param === 'false') return false;
  try {
    return window.localStorage.getItem(BLIND_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveBlindModePreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(BLIND_MODE_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage errors
  }
}

export function stopAccessibilitySpeech(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Ignore speech synthesis errors in restricted environments
  }
}

export function speakAccessibility(
  text: string,
  lang: Language,
  options?: { interrupt?: boolean }
): void {
  if (typeof window === 'undefined' || !text.trim()) return;
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
  try {
    if (options?.interrupt !== false) {
      window.speechSynthesis.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(text);
    const targetPrefix = lang === 'ar' ? 'ar' : 'en';
    utterance.lang = lang === 'ar' ? 'ar-EG' : 'en-US';
    const voices = window.speechSynthesis.getVoices?.() ?? [];
    const matchedVoice = voices.find((v) => v.lang.toLowerCase().startsWith(targetPrefix));
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }
    utterance.rate = lang === 'ar' ? 1.0 : 1.05;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Ignore browser speech blocks gracefully
  }
}

export function getCropDisplayName(cropType: CropType, lang: Language): string {
  if (lang === 'ar') return ITEM_AR[cropType].name;
  return CROPS[cropType].name;
}

export function getFacingTileCoords(world: GameWorldState): { tx: number; ty: number } {
  const p = world.player;
  const fx = Math.abs(p.facingX) >= Math.abs(p.facingY) ? Math.sign(p.facingX) : 0;
  const fy = fx === 0 ? Math.sign(p.facingY || 1) : 0;
  return {
    tx: Math.floor(p.x + fx * 0.85),
    ty: Math.floor(p.y + fy * 0.85),
  };
}

export function formatDirectionSteps(dx: number, dy: number, lang: Language): string {
  const rx = Math.round(dx);
  const ry = Math.round(dy);
  if (rx === 0 && ry === 0) {
    return lang === 'ar' ? 'عند موقعك تماماً' : 'right next to you';
  }
  const parts: string[] = [];
  if (ry < 0) {
    const n = Math.abs(ry);
    parts.push(lang === 'ar' ? `${n} ${n === 1 ? 'خطوة' : 'خطوات'} شمالاً` : `${n} north`);
  } else if (ry > 0) {
    const n = Math.abs(ry);
    parts.push(lang === 'ar' ? `${n} ${n === 1 ? 'خطوة' : 'خطوات'} جنوباً` : `${n} south`);
  }
  if (rx > 0) {
    const n = Math.abs(rx);
    parts.push(lang === 'ar' ? `${n} ${n === 1 ? 'خطوة' : 'خطوات'} شرقاً` : `${n} east`);
  } else if (rx < 0) {
    const n = Math.abs(rx);
    parts.push(lang === 'ar' ? `${n} ${n === 1 ? 'خطوة' : 'خطوات'} غرباً` : `${n} west`);
  }
  return lang === 'ar' ? parts.join(' و ') : parts.join(', ');
}

export function describeTileForBlind(
  world: GameWorldState,
  tx: number,
  ty: number,
  lang: Language
): { text: string; cue: BlindAudioCue } {
  const tile = getTile(world, tx, ty);
  if (!tile) {
    return {
      text: lang === 'ar' ? 'حدود المزرعة' : 'Farm boundary',
      cue: 'obstacle',
    };
  }

  // Check if active wildlife is on or right next to that tile
  const nearbyBeast = world.wildlife.find(
    (w) => w.state !== 'ko' && w.state !== 'fleeing' && Math.hypot(w.x - (tx + 0.5), w.y - (ty + 0.5)) <= 1.2
  );
  if (nearbyBeast) {
    const name =
      nearbyBeast.kind === 'boar'
        ? lang === 'ar'
          ? 'خنزير بري متسلل! استخدم الفأس للدفاع'
          : 'Wild boar nearby! Use axe to repel'
        : lang === 'ar'
        ? 'أرنب بري متسلل! استخدم الفأس لإبعاده'
        : 'Wild rabbit nearby! Use axe to repel';
    return { text: name, cue: 'danger' };
  }

  // Check if a farmyard chicken is nearby
  const nearbyChicken = world.chickens?.find(
    (c) => Math.hypot(c.x - (tx + 0.5), c.y - (ty + 0.5)) <= 1.2
  );
  if (nearbyChicken) {
    return {
      text: lang === 'ar' ? 'دجاجة المزرعة تتجول أمامك' : 'Farmyard chicken nearby',
      cue: 'clear',
    };
  }

  if (tile.terrain === 'forest_edge') {
    return { text: lang === 'ar' ? 'غابة محيطة مغلقة' : 'Dense forest edge', cue: 'obstacle' };
  }
  if (tile.terrain === 'water') {
    return { text: lang === 'ar' ? 'بركة ماء' : 'Natural pond water', cue: 'water' };
  }
  if (tile.terrain === 'farmhouse') {
    return {
      text:
        lang === 'ar'
          ? 'باب منزل المزرعة — اضغط تفاعل للنوم وبداية يوم جديد'
          : 'Farmhouse door — press E to rest until morning',
      cue: 'building',
    };
  }
  if (tile.terrain === 'well') {
    return {
      text:
        lang === 'ar'
          ? 'البئر الحجري — اضغط تفاعل لتعبئة مرش المياه'
          : 'Stone well — press E to refill watering can',
      cue: 'building',
    };
  }
  if (tile.terrain === 'shop_stall') {
    return {
      text:
        lang === 'ar'
          ? 'سوق القرية — اضغط تفاعل لفتح المتجر'
          : 'Village shop stall — press E to open shop',
      cue: 'building',
    };
  }
  if (tile.terrain === 'shipping_bin') {
    return {
      text:
        lang === 'ar'
          ? 'صندوق الشحن — اضغط تفاعل لبيع المحاصيل'
          : 'Shipping bin — press E to sell crops',
      cue: 'building',
    };
  }

  if (tile.obstacle) {
    const obsLabel =
      tile.obstacle === 'rock'
        ? lang === 'ar'
          ? 'صخرة — اكسرها بالفأس'
          : 'Field rock — break with axe'
        : tile.obstacle === 'stump'
        ? lang === 'ar'
          ? 'جذع شجرة — قطّعه بالفأس'
          : 'Tree stump — chop with axe'
        : lang === 'ar'
        ? 'أعشاب ضارة — أزلها بالفأس أو المجرفة'
        : 'Weeds — clear with axe or hoe';
    return { text: obsLabel, cue: 'obstacle' };
  }

  if (tile.structure) {
    const label = getItemLabel(tile.structure.type, lang).name;
    if (tile.structure.type === 'rain_tank') {
      const charges = tile.structure.storedWaterCharges ?? 0;
      return {
        text:
          lang === 'ar'
            ? `${label} (${charges} من 5 سقيات متاحة)`
            : `${label} (${charges}/5 refills ready)`,
        cue: 'building',
      };
    }
    return { text: label, cue: 'building' };
  }

  if (tile.crop) {
    const cropName = getCropDisplayName(tile.crop.type, lang);
    if (tile.crop.withered) {
      return {
        text:
          lang === 'ar'
            ? `${cropName} ذابل — أزله بالمجرفة`
            : `Withered ${cropName} — clear with hoe`,
        cue: 'obstacle',
      };
    }
    const def = CROPS[tile.crop.type];
    if (tile.crop.growthDays >= def.daysToGrow) {
      return {
        text:
          lang === 'ar'
            ? `${cropName} ناضج وجاهز للحصاد! اضغط استخدام`
            : `Ripe ${cropName} ready to harvest! Press Space or Use`,
        cue: 'crop_ripe',
      };
    }
    const left = Math.max(1, def.daysToGrow - Math.floor(tile.crop.growthDays));
    if (!tile.watered) {
      return {
        text:
          lang === 'ar'
            ? `${cropName} عطشان يحتاج للسقي، باقي ${left} ${left === 1 ? 'يوم' : 'أيام'}`
            : `${cropName} needs watering, ${left}d left`,
        cue: 'crop_need_water',
      };
    }
    return {
      text:
        lang === 'ar'
          ? `${cropName} مسقي وينمو، باقي ${left} ${left === 1 ? 'يوم' : 'أيام'}`
          : `Watered ${cropName}, ${left}d left`,
      cue: 'crop_growing',
    };
  }

  if (tile.tilled) {
    const bonusNote = tile.beanRotationBonus
      ? lang === 'ar'
        ? ' ومخصّبة بالفول +20%'
        : ' (bean enriched +20%)'
      : '';
    return {
      text: tile.watered
        ? lang === 'ar'
          ? `تربة محروثة ومسقية${bonusNote} جاهزة للبذور`
          : `Watered tilled soil${bonusNote}, ready for seeds`
        : lang === 'ar'
        ? `تربة محروثة${bonusNote} جاهزة للزراعة`
        : `Tilled soil${bonusNote}, ready to plant`,
      cue: 'soil',
    };
  }

  if (tile.terrain === 'dirt_path') {
    return { text: lang === 'ar' ? 'طريق ترابي مفتوح' : 'Clear dirt path', cue: 'clear' };
  }

  if (tile.tillable) {
    return {
      text: lang === 'ar' ? 'عشب خصب قابل للحراثة بالمجرفة' : 'Fertile grass, tillable with hoe',
      cue: 'clear',
    };
  }

  return { text: lang === 'ar' ? 'أرض عشبية' : 'Open grass', cue: 'clear' };
}

export function getSmartGuidance(
  world: GameWorldState,
  lang: Language
): { text: string; targetType: string; distance: number } {
  const px = world.player.x;
  const py = world.player.y;

  // 1. Urgent: active nocturnal wildlife nearby
  const activeBeasts = world.wildlife.filter((w) => w.state !== 'ko' && w.state !== 'fleeing');
  if (world.timeMinutes >= NIGHT_START_MINUTES && activeBeasts.length > 0) {
    let best = activeBeasts[0];
    let bestDist = Infinity;
    for (const w of activeBeasts) {
      const d = Math.hypot(w.x - px, w.y - py);
      if (d < bestDist) {
        bestDist = d;
        best = w;
      }
    }
    const dir = formatDirectionSteps(best.x - px, best.y - py, lang);
    const kind =
      best.kind === 'boar'
        ? lang === 'ar'
          ? 'خنزير بري'
          : 'wild boar'
        : lang === 'ar'
        ? 'أرنب بري'
        : 'wild rabbit';
    return {
      targetType: 'wildlife',
      distance: bestDist,
      text:
        lang === 'ar'
          ? `تنبيه خطر: ${kind} على بُعد ${dir}. جهّز الفأس من الخانة 3.`
          : `Danger: ${kind} ${dir}. Equip Axe (slot 3).`,
    };
  }

  // 2. Urgent: low stamina -> Farmhouse door
  if (world.player.stamina <= 15) {
    const dx = FARMHOUSE_DOOR.x + 0.5 - px;
    const dy = FARMHOUSE_DOOR.y + 0.5 - py;
    const dist = Math.hypot(dx, dy);
    if (isNearFarmhouse(world)) {
      return {
        targetType: 'farmhouse',
        distance: dist,
        text:
          lang === 'ar'
            ? 'أنت أمام باب المنزل، اضغط تفاعل للنوم واستعادة الطاقة.'
            : 'At farmhouse door. Press E to sleep and restore stamina.',
      };
    }
    const dir = formatDirectionSteps(dx, dy, lang);
    return {
      targetType: 'farmhouse',
      distance: dist,
      text:
        lang === 'ar'
          ? `طاقتك منخفضة! اتجه إلى باب المنزل: ${dir}.`
          : `Low stamina! Head to farmhouse door: ${dir}.`,
    };
  }

  // 3. Empty watering can -> Well
  if (world.player.waterLevel <= 0) {
    const dx = WELL_POS.x + 0.5 - px;
    const dy = WELL_POS.y + 0.5 - py;
    const dist = Math.hypot(dx, dy);
    if (isNearWell(world)) {
      return {
        targetType: 'well',
        distance: dist,
        text: lang === 'ar' ? 'أنت بجانب البئر، اضغط تفاعل لتعبئة مرش المياه.' : 'At stone well. Press E to refill watering can.',
      };
    }
    const dir = formatDirectionSteps(dx, dy, lang);
    return {
      targetType: 'well',
      distance: dist,
      text:
        lang === 'ar'
          ? `مرش المياه فارغ! اتجه إلى البئر: ${dir}.`
          : `Watering can empty! Go to stone well: ${dir}.`,
    };
  }

  // 4. Nearest ripe crop
  let bestRipe: { x: number; y: number; dist: number; type: CropType } | null = null;
  let bestDry: { x: number; y: number; dist: number; type: CropType } | null = null;

  for (const tile of world.tiles) {
    if (!tile.crop || tile.crop.withered) continue;
    const dist = Math.hypot(tile.x + 0.5 - px, tile.y + 0.5 - py);
    const def = CROPS[tile.crop.type];
    if (tile.crop.growthDays >= def.daysToGrow) {
      if (!bestRipe || dist < bestRipe.dist) {
        bestRipe = { x: tile.x + 0.5, y: tile.y + 0.5, dist, type: tile.crop.type };
      }
    } else if (!tile.watered) {
      if (!bestDry || dist < bestDry.dist) {
        bestDry = { x: tile.x + 0.5, y: tile.y + 0.5, dist, type: tile.crop.type };
      }
    }
  }

  if (bestRipe) {
    const dir = formatDirectionSteps(bestRipe.x - px, bestRipe.y - py, lang);
    const name = getCropDisplayName(bestRipe.type, lang);
    return {
      targetType: 'ripe_crop',
      distance: bestRipe.dist,
      text:
        lang === 'ar'
          ? `أقرب محصول ناضج للحصاد (${name}): ${dir}.`
          : `Nearest ripe ${name} to harvest: ${dir}.`,
    };
  }

  if (bestDry) {
    const dir = formatDirectionSteps(bestDry.x - px, bestDry.y - py, lang);
    const name = getCropDisplayName(bestDry.type, lang);
    return {
      targetType: 'dry_crop',
      distance: bestDry.dist,
      text:
        lang === 'ar'
          ? `أقرب محصول يحتاج للسقي (${name}): ${dir}.`
          : `Nearest dry ${name} needing water: ${dir}.`,
    };
  }

  // 6. Default: Village Shop or Farmhouse depending on proximity
  if (isNearShopStall(world)) {
    return {
      targetType: 'shop',
      distance: 1,
      text: lang === 'ar' ? 'أنت أمام سوق القرية، اضغط تفاعل لفتحه.' : 'At village shop stall. Press E to open.',
    };
  }
  if (isNearShippingBin(world)) {
    return {
      targetType: 'bin',
      distance: 1,
      text: lang === 'ar' ? 'أنت أمام صندوق الشحن، اضغط تفاعل لبيع المحاصيل.' : 'At shipping bin. Press E to sell.',
    };
  }

  const shopDx = SHOP_STALL_POS.x + 1.5 - px;
  const shopDy = SHOP_STALL_POS.y + 2.2 - py;
  const shopDist = Math.hypot(shopDx, shopDy);
  const houseDx = FARMHOUSE_DOOR.x + 0.5 - px;
  const houseDy = FARMHOUSE_DOOR.y + 0.5 - py;
  const houseDist = Math.hypot(houseDx, houseDy);

  const shopDir = formatDirectionSteps(shopDx, shopDy, lang);
  const houseDir = formatDirectionSteps(houseDx, houseDy, lang);

  if (lang === 'ar') {
    return {
      targetType: 'landmark',
      distance: Math.min(shopDist, houseDist),
      text: `كل المحاصيل مسقية. باب المنزل: ${houseDir}، وسوق القرية: ${shopDir}.`,
    };
  }
  return {
    targetType: 'landmark',
    distance: Math.min(shopDist, houseDist),
    text: `All crops watered. Farmhouse: ${houseDir}. Shop: ${shopDir}.`,
  };
}

export function buildStatusAnnouncement(world: GameWorldState, lang: Language): string {
  const season = translateSeason(getSeason(world.seasonIndex), lang);
  const day = getDayOfSeason(world.day);
  const clock = formatTimeLocalized(world.timeMinutes, lang);
  const weather = translateWeather(world.weather, lang);
  const restored = Math.round(computeFarmRestorationPercent(world));
  const activeId = world.hotbar[world.player.selectedHotbarIndex];
  const activeName = activeId
    ? getItemLabel(activeId, lang).name
    : lang === 'ar'
    ? 'خانة فارغة'
    : 'Empty slot';
  const claimable = getClaimableMissionsCount(world);
  const facing = getFacingTileCoords(world);
  const frontDesc = describeTileForBlind(world, facing.tx, facing.ty, lang).text;

  if (lang === 'ar') {
    const missionNote = claimable > 0 ? ` لديك ${claimable} مكافأة تحدٍ جاهزة.` : '';
    return `${season} اليوم ${day}، الساعة ${clock}، الطقس ${weather}. الصحة ${Math.round(
      world.player.health
    )}، الطاقة ${Math.round(world.player.stamina)}، الماء ${world.player.waterLevel} من ${
      world.player.maxWaterLevel
    }، الذهب ${Math.round(world.player.gold)}، الاستصلاح ${restored} بالمئة. الأداة المختارة: ${activeName}. أمامك: ${frontDesc}.${missionNote}`;
  }

  const missionNote = claimable > 0 ? ` ${claimable} mission reward ready.` : '';
  return `${season} Day ${day}, ${clock}, ${weather}. Health ${Math.round(
    world.player.health
  )}, Stamina ${Math.round(world.player.stamina)}, Water ${world.player.waterLevel} of ${
    world.player.maxWaterLevel
  }, Gold ${Math.round(world.player.gold)}, ${restored}% restored. Equipped: ${activeName}. Ahead: ${frontDesc}.${missionNote}`;
}

export function getTitleGuidanceText(lang: Language): string {
  if (lang === 'ar') {
    return 'تم تفعيل وضع المكفوفين باللغة العربية. اضغط ابدأ الآن لدخول المزرعة. داخل اللعب استخدم أزرار فحص وتوجيه والحالة، أو من لوحة المفاتيح: الأسهم للحركة، المسطرة لاستخدام الأداة، وحرف تفاعل أو E عند المباني والبئر.';
  }
  return 'Blind accessibility mode enabled. Press Enter or Start Now to begin. In game: F scans ahead, G gives step-by-step compass guidance, R reads full status, Space uses tool, E interacts, and V toggles Blind Mode.';
}

export function getTileSignatureForBlind(world: GameWorldState, tx: number, ty: number): string {
  const tile = getTile(world, tx, ty);
  if (!tile) return 'edge';
  if (tile.crop) {
    const def = CROPS[tile.crop.type];
    const ripe = tile.crop.growthDays >= def.daysToGrow;
    return `crop:${tile.crop.type}:${tile.crop.withered ? 'w' : ripe ? 'r' : tile.watered ? 'wtr' : 'dry'}`;
  }
  if (tile.obstacle) return `obs:${tile.obstacle}`;
  if (tile.structure) return `str:${tile.structure.type}`;
  if (tile.terrain !== 'grass') return `ter:${tile.terrain}`;
  if (tile.tilled) return `tilled:${tile.watered ? 1 : 0}`;
  return 'grass';
}
