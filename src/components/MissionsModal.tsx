import { Award, CheckCircle2, Droplets, Lock, Satellite, Trophy, X } from 'lucide-react';
import { BADGE_IDS, MISSIONS } from '../game/constants';
import { BADGE_TEXT, getItemLabel, MISSION_TEXT, UI_TEXT, type Language } from '../game/i18n';
import type { GameWorldState, MissionDef, MissionId } from '../game/types';
import { getEarnedBadges, getMissionProgress } from '../game/rules';
import { CoinIcon, ItemIcon } from './PixelIcons';

interface MissionsModalProps {
  world: GameWorldState;
  lang: Language;
  onClaim: (id: MissionId) => void;
  onClose: () => void;
}

export function MissionsModal({ world, lang, onClaim, onClose }: MissionsModalProps) {
  const t = UI_TEXT[lang];
  const claimedSet = new Set(world.claimedMissions ?? []);
  const completedCount = MISSIONS.filter((m) => claimedSet.has(m.id)).length;
  const earnedBadges = new Set(getEarnedBadges(world));
  const waterSaved = world.stats.waterSavedLiters ?? 0;

  const coreMissions = MISSIONS.filter((m) => m.category !== 'nasa');
  const nasaMissions = MISSIONS.filter((m) => m.category === 'nasa');

  const renderMissionCard = (mission: MissionDef) => {
    const progress = getMissionProgress(world, mission.id);
    const clamped = Math.min(mission.target, progress);
    const pct = Math.min(100, Math.round((clamped / mission.target) * 100));
    const isClaimed = claimedSet.has(mission.id);
    const isReady = !isClaimed && progress >= mission.target;
    const copy = MISSION_TEXT[mission.id][lang];
    const rewardItemLabel = mission.rewardItem
      ? getItemLabel(mission.rewardItem.id, lang).name
      : null;

    return (
      <div
        key={mission.id}
        className={`p-3.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isReady
            ? 'bg-[#fef6dc] border-[#c4922c]'
            : isClaimed
            ? 'bg-[#ede0c4]/75 border-[#cdb892] opacity-85'
            : 'bg-[#fbf2e1] border-[#d6be96]'
        }`}
      >
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-sm sm:text-base text-[#2c1e14] truncate">
              {copy.title}
            </h3>
            <span className="font-mono-tabular text-xs font-bold text-[#5c4028] shrink-0">
              {clamped}/{mission.target}
            </span>
          </div>
          <p className="text-xs text-[#694d36]">{copy.desc}</p>

          {/* Progress bar */}
          <div className="h-2 bg-[#e3cfa9] rounded-full overflow-hidden border border-[#c7ae82]">
            <div
              className={`h-full transition-all ${
                isClaimed || isReady ? 'bg-[#3d7a47]' : 'bg-[#c98b2e]'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Reward Row */}
          <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs text-[#4a3322]">
            <span className="font-semibold text-[#694d36]">{t.rewardLabel}:</span>
            <span className="inline-flex items-center gap-1 font-mono-tabular font-bold text-[#8a5708]">
              <CoinIcon className="w-3.5 h-3.5" />
              +{mission.rewardGold}g
            </span>
            {mission.rewardItem && rewardItemLabel && (
              <span className="inline-flex items-center gap-1 font-medium">
                <ItemIcon id={mission.rewardItem.id} className="w-4 h-4" />
                +{mission.rewardItem.qty} {rewardItemLabel}
              </span>
            )}
            {mission.rewardStamina && (
              <span className="font-mono-tabular font-semibold text-[#2f6e3a]">
                {t.staminaBonus.replace('{n}', String(mission.rewardStamina))}
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 flex sm:justify-end">
          {isClaimed ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#dfd0b1] text-[#3a5c3c] text-xs font-bold whitespace-nowrap">
              <CheckCircle2 className="w-4 h-4" />
              {t.claimed}
            </span>
          ) : isReady ? (
            <button
              type="button"
              onClick={() => onClaim(mission.id)}
              aria-label={lang === 'ar' ? `استلام مكافأة ${copy.title}` : `Claim ${copy.title}`}
              className="wood-button-primary px-4 py-2 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap"
            >
              {t.claimReward}
            </button>
          ) : (
            <span className="px-3 py-1.5 rounded bg-[#efe1c4] border border-[#d4bc94] text-[#75563b] text-xs font-semibold whitespace-nowrap">
              {t.inProgress}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/55"
      role="dialog"
      aria-modal="true"
      aria-label={t.missionsModalTitle}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      <div className="parchment-panel rounded-xl w-full max-w-2xl max-h-[86vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b-2 border-[#c9b086] bg-[#ebd8b5]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#3d7a47] text-[#fdf3dc] flex items-center justify-center border border-[#244e2b] shrink-0">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#2c1e14]">
                {t.missionsModalTitle}
              </h2>
              <p className="text-xs text-[#694d36]">{t.missionsModalSub}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="font-mono-tabular text-xs font-bold px-2.5 py-1 rounded bg-[#f9eed8] border border-[#c9b086] text-[#4a3322] whitespace-nowrap">
              {completedCount}/{MISSIONS.length} {t.completedCount}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label={lang === 'ar' ? 'إغلاق قائمة التحديات' : 'Close Missions'}
              className="wood-button p-1.5 rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Water Saved Counter + Achievement Badges */}
          <div className="space-y-2.5">
            <div
              data-testid="water-saved-counter"
              className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-[#e3f2fd] border border-[#90caf9] text-[#0d47a1]"
            >
              <div className="flex items-center gap-2 text-xs sm:text-sm font-bold">
                <Droplets className="w-4 h-4 text-[#1976d2] shrink-0" />
                <span>{t.waterSavedLabel}</span>
              </div>
              <span className="font-mono-tabular text-sm sm:text-base font-extrabold">
                {waterSaved} {t.litersUnit}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#5c4028]">
                <Award className="w-3.5 h-3.5 text-[#a16207]" />
                <span>{t.badgesHeader}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {BADGE_IDS.map((badgeId) => {
                  const unlocked = earnedBadges.has(badgeId);
                  const copy = BADGE_TEXT[badgeId][lang];
                  return (
                    <div
                      key={badgeId}
                      data-testid={`badge-${badgeId}`}
                      className={`p-2.5 rounded-lg border flex flex-col gap-1 ${
                        unlocked
                          ? 'bg-[#fef6dc] border-[#d97706] text-[#2c1e14]'
                          : 'bg-[#ede0c4]/60 border-[#cbb48d] text-[#694d36] opacity-80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-bold text-xs">{copy.title}</span>
                        <span
                          className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            unlocked
                              ? 'bg-[#3d7a47] text-white'
                              : 'bg-[#d8c39b] text-[#5c4028]'
                          }`}
                        >
                          {unlocked ? (
                            <CheckCircle2 className="w-2.5 h-2.5" />
                          ) : (
                            <Lock className="w-2.5 h-2.5" />
                          )}
                          {unlocked ? t.unlockedBadge : t.lockedBadge}
                        </span>
                      </div>
                      <p className="text-[11px] leading-snug">{copy.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Core Homestead Missions (1-12) */}
          <div className="space-y-2.5">
            <div className="text-xs font-bold text-[#5c4028] uppercase tracking-wide border-b border-[#d6be96] pb-1">
              {t.coreMissionsHeader}
            </div>
            {coreMissions.map(renderMissionCard)}
          </div>

          {/* NASA Missions (13-16 · Optional) */}
          <div className="space-y-2.5 pt-1" data-testid="nasa-missions-section">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#153e66] uppercase tracking-wide border-b border-[#9ab8d4] pb-1">
              <Satellite className="w-3.5 h-3.5 text-[#1d4e78]" />
              <span>{t.nasaMissionsHeader}</span>
            </div>
            {nasaMissions.map(renderMissionCard)}
          </div>
        </div>
      </div>
    </div>
  );
}
