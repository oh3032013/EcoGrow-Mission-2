import { Clock, Sparkles, X } from 'lucide-react';
import { UI_TEXT, type Language } from '../game/i18n';
import type { FutureDispatch } from '../game/types';

interface FutureMessageModalProps {
  dispatch: FutureDispatch;
  lang: Language;
  onClose: () => void;
}

export function FutureMessageModal({ dispatch, lang, onClose }: FutureMessageModalProps) {
  const t = UI_TEXT[lang];
  const quote = lang === 'ar' ? dispatch.quoteAr : dispatch.quoteEn;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label={t.futureMsgTitle}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      <div className="parchment-panel rounded-xl w-full max-w-md overflow-hidden border-2 border-[#2563eb] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 bg-[#172c45] text-[#f8fafc] border-b-2 border-[#38bdf8]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0ea5e9]/25 border border-[#38bdf8] flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-[#7dd3fc]" />
            </div>
            <div>
              <h2 className="font-display text-lg sm:text-xl font-bold leading-tight">
                {t.futureMsgTitle}
              </h2>
              <p className="text-[11px] text-[#bae6fd]">
                {t.futureMsgSub.replace('{day}', String(dispatch.day))}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'ar' ? 'إغلاق رسالة 2040' : 'Close 2040 Message'}
            className="p-1.5 rounded bg-[#223e5e] hover:bg-[#2c4f78] text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 text-center space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#e0f2fe] border border-[#7dd3fc] text-[#0c4a6e] text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>2040</span>
          </div>

          <blockquote
            data-testid="future-2040-quote"
            className="font-display text-lg sm:text-xl font-bold text-[#1e1710] leading-relaxed bg-[#fbf2e1] p-4 rounded-lg border border-[#d6be96]"
          >
            {quote}
          </blockquote>

          <button
            type="button"
            onClick={onClose}
            className="wood-button-primary w-full py-2.5 rounded-lg text-sm font-bold cursor-pointer"
          >
            {t.futureMsgDismiss}
          </button>
        </div>
      </div>
    </div>
  );
}
