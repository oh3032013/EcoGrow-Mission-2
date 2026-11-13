import { CloudRain, Droplets, Radio, Satellite, Sun, X } from 'lucide-react';
import { NASA_OBSERVATORY_CARDS } from '../game/constants';
import { translateWeather, UI_TEXT, type Language } from '../game/i18n';
import {
  computeSoilMoisturePct,
  computeTemperatureC,
  hasNasaStation,
} from '../game/rules';
import type { GameWorldState } from '../game/types';

interface NasaObservatoryModalProps {
  world: GameWorldState;
  lang: Language;
  onClose: () => void;
}

export function NasaObservatoryModal({ world, lang, onClose }: NasaObservatoryModalProps) {
  const t = UI_TEXT[lang];
  const stationInstalled = hasNasaStation(world);
  const moisturePct = computeSoilMoisturePct(world);
  const tempC = computeTemperatureC(world);
  const tomorrow = world.forecastWeather ?? world.weather;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/55"
      role="dialog"
      aria-modal="true"
      aria-label={t.nasaModalTitle}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      <div className="parchment-panel rounded-xl w-full max-w-2xl max-h-[86vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b-2 border-[#c9b086] bg-[#ebd8b5]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#1d4e78] text-[#fdf3dc] flex items-center justify-center border border-[#0f2f4d] shrink-0">
              <Satellite className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#2c1e14]">
                {t.nasaModalTitle}
              </h2>
              <p className="text-xs text-[#694d36]">{t.nasaModalSub}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'ar' ? 'إغلاق مرصد ناسا' : 'Close NASA Observatory'}
            className="wood-button p-1.5 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* 3 Educational Satellite Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {NASA_OBSERVATORY_CARDS.map((card) => {
              const Icon =
                card.code === 'SMAP'
                  ? Droplets
                  : card.code === 'GPM'
                  ? CloudRain
                  : Sun;
              const title = lang === 'ar' ? card.titleAr : card.titleEn;
              const desc = lang === 'ar' ? card.descAr : card.descEn;

              return (
                <div
                  key={card.code}
                  className="p-3.5 rounded-lg bg-[#fbf2e1] border-2 border-[#cbb187] flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono-tabular font-extrabold text-base px-2 py-0.5 rounded bg-[#18293b] text-[#f8fafc] tracking-wide">
                      {card.code}
                    </span>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center border border-[#c9b086]"
                      style={{ backgroundColor: `${card.accent}28` }}
                    >
                      <Icon className="w-4 h-4 text-[#1e3a5f]" />
                    </div>
                  </div>
                  <div className="font-semibold text-xs text-[#5c4028]">{title}</div>
                  <p className="text-sm font-medium text-[#2c1e14] leading-relaxed">{desc}</p>
                </div>
              );
            })}
          </div>

          {/* Local Farm Weather Station Telemetry */}
          {stationInstalled ? (
            <div className="p-4 rounded-lg bg-[#e8eff5] border-2 border-[#7ea3c4]">
              <div className="flex items-center gap-2 mb-2.5 text-sm font-bold text-[#15314b]">
                <Radio className="w-4 h-4 text-[#1d6fa5]" />
                <span>{t.nasaStationTelemetryTitle}</span>
              </div>
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="p-2.5 rounded bg-white/80 border border-[#b8cde0]">
                  <div className="text-[11px] text-[#4b637a]">{t.soilMoistureLabel}</div>
                  <div className="font-mono-tabular font-bold text-lg text-[#134e6f]">
                    {moisturePct}%
                  </div>
                </div>
                <div className="p-2.5 rounded bg-white/80 border border-[#b8cde0]">
                  <div className="text-[11px] text-[#4b637a]">{t.tempLabel}</div>
                  <div className="font-mono-tabular font-bold text-lg text-[#9a3412]">
                    {tempC}°C
                  </div>
                </div>
                <div className="p-2.5 rounded bg-white/80 border border-[#b8cde0]">
                  <div className="text-[11px] text-[#4b637a]">{t.tomorrowLabel}</div>
                  <div className="font-bold text-sm sm:text-base text-[#1e3a5f]">
                    {translateWeather(tomorrow, lang)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-[#f4e6ca] border border-[#cfa859] text-xs text-[#5c4028]">
              {t.nasaNoStationHint}
            </div>
          )}

          {/* Honest Educational Disclaimer */}
          <div className="p-3 rounded-lg bg-[#efe1c4] border border-[#c9b086] text-xs text-[#5c4028] leading-relaxed">
            {t.nasaDisclaimer}
          </div>
        </div>
      </div>
    </div>
  );
}
