import React, { useState, useEffect, useMemo } from 'react';
import { Search } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { useLanguage } from '../context/LanguageContext';
import { Haptic } from '../utils/haptics';
import { useCurrency } from '../context/CurrencyContext';
import { useUser } from '../context/UserContext';
import { supabase } from '../lib/supabase';
import { fetchCurrenciesList } from '../lib/currencyApi';

/** Основные валюты для быстрого выбора (приоритет сверху) */
const MAIN_CURRENCIES = [
  'rub', 'usd', 'eur', 'kzt', 'uah', 'cny', 'gbp', 'jpy', 'try', 'brl', 'inr', 'chf', 'krw',
  'btc', 'eth', 'ton', 'sol', 'usdt',
];

interface CurrencyPickerPageProps {
  onBack: () => void;
}

const CurrencyPickerPage: React.FC<CurrencyPickerPageProps> = ({ onBack }) => {
  const { baseCurrency, setBaseCurrency, rates, loading } = useCurrency();
  const { t } = useLanguage();
  const { user, refreshUser } = useUser();
  const [currencies, setCurrencies] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchCurrenciesList()
      .then(setCurrencies)
      .catch(() => setCurrencies({}));
  }, []);

  /** 1 USD = rate единиц выбранной валюты */
  const rateFor = (code: string): number | null => {
    if (!rates?.usd) return null;
    if (code === 'usd') return 1;
    const r = rates.usd[code];
    return r != null ? r : null;
  };

  const allCurrencies = useMemo(() => [
    ...MAIN_CURRENCIES.filter((c) => currencies[c]),
    ...Object.keys(currencies).filter((c) => !MAIN_CURRENCIES.includes(c)).sort(),
  ], [currencies]);

  const displayCurrencies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allCurrencies;
    return allCurrencies.filter((code) => {
      const name = (currencies[code] || code).toLowerCase();
      return code.toLowerCase().includes(q) || name.includes(q);
    });
  }, [allCurrencies, searchQuery, currencies]);

  const handleSelect = async (code: string) => {
    Haptic.light();
    setBaseCurrency(code);
    const uid = user?.user_id;
    if (uid) {
      try {
        await supabase.from('users').update({ preferred_currency: code.toUpperCase() }).eq('user_id', uid);
        refreshUser?.();
      } catch {}
    }
    onBack();
  };

  return (
    <div className="flex flex-col min-h-full animate-fade-in px-4 pt-2 pb-8">
      <PageHeader title={t('currency_title')} onBack={onBack} />
      <p className="text-xs text-textMuted mb-4 -mt-1">{t('currency_subtitle')}</p>
      <div className="relative mb-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('search_placeholder')}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/[0.04] border border-white/10 text-white placeholder:text-neutral-500 text-sm focus:outline-none focus:border-neon/50 focus:ring-1 focus:ring-neon/30"
        />
      </div>

      {loading ? (
        <div className="text-sm text-neutral-500 py-8">{t('loading_rates')}</div>
      ) : displayCurrencies.length === 0 ? (
        <div className="text-sm text-neutral-500 py-8">{t('nothing_found')}</div>
      ) : (
        <div className="flex flex-col gap-1">
          {displayCurrencies.map((code) => {
            const name = currencies[code] || code.toUpperCase();
            const rate = rateFor(code);
            const isSelected = baseCurrency === code;

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
                <div className="flex flex-col items-start">
                  <span className="font-mono font-semibold uppercase text-sm">{code}</span>
                  <span className="text-xs text-neutral-500">{name}</span>
                </div>
                {rate != null && (
                  <div className="text-right">
                    <span className="text-xs font-mono text-neutral-400">
                      1 $ = {rate >= 1000 ? rate.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) : rate < 0.0001 ? rate.toExponential(2) : rate.toFixed(6)} {code.toUpperCase()}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CurrencyPickerPage;
