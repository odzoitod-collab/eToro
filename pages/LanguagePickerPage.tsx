import React from 'react';
import PageHeader from '../components/PageHeader';
import { Haptic } from '../utils/haptics';
import { useLanguage } from '../context/LanguageContext';
import { useUser } from '../context/UserContext';
import { supabase } from '../lib/supabase';
import type { Locale } from '../i18n/translations';

const LANGUAGES: { code: Locale; labelKey: string }[] = [
  { code: 'en', labelKey: 'lang_en' },
  { code: 'ru', labelKey: 'lang_ru' },
  { code: 'pl', labelKey: 'lang_pl' },
  { code: 'kk', labelKey: 'lang_kk' },
  { code: 'cs', labelKey: 'lang_cs' },
];

interface LanguagePickerPageProps {
  onBack: () => void;
}

const LanguagePickerPage: React.FC<LanguagePickerPageProps> = ({ onBack }) => {
  const { locale, setLocale, t } = useLanguage();
  const { user, tgid, webUserId, refreshUser } = useUser();

  const handleSelect = async (code: Locale) => {
    Haptic.light();
    setLocale(code);
    const uid = user?.user_id;
    if (uid) {
      try {
        await supabase.from('users').update({ preferred_locale: code }).eq('user_id', uid);
        refreshUser?.();
      } catch {}
    }
    onBack();
  };

  return (
    <div className="flex flex-col min-h-full animate-fade-in px-4 pt-2 pb-8">
      <PageHeader title={t('language_title')} onBack={onBack} />
      <p className="text-xs text-textMuted mb-4 -mt-1">{t('language_subtitle')}</p>
      <div className="flex flex-col gap-1">
        {LANGUAGES.map(({ code, labelKey }) => {
          const isSelected = locale === code;

          return (
            <button
              key={code}
              onClick={() => handleSelect(code)}
              className={`
                flex items-center justify-between py-3 px-3 rounded-lg text-left
                transition-colors active:scale-[0.99]
                ${isSelected ? 'bg-neon/20 text-neon border border-neon/40' : 'bg-white/[0.02] text-white hover:bg-white/[0.06] border border-transparent'}
              `}
            >
              <span className="font-medium text-sm">{t(labelKey)}</span>
              {isSelected && (
                <span className="text-xs text-neon/80">✓</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default LanguagePickerPage;
