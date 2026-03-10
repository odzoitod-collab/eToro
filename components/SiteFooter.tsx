import React from 'react';
import { Shield, Zap } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../context/LanguageContext';
import { useCurrency } from '../context/CurrencyContext';

const SiteFooter: React.FC = () => {
  const { supportLink } = useUser();
  const { t } = useLanguage();
  const { convertFromRub, symbol } = useCurrency();
  const volume24h = (convertFromRub(12.4e9) / 1e9).toFixed(1) + ' млрд ' + symbol;

  return (
    <footer className="mt-8 px-4 pb-6 pt-4 border-t border-white/5 text-neutral-500">
      {/* Статус системы */}
      <div className="flex items-center justify-between text-xs mb-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span>{t('all_systems_ok')}</span>
        </div>
        <span className="font-mono">{t('vol_24h')}: {volume24h}</span>
      </div>

      {/* Trust */}
      <div className="flex items-center gap-4 text-[10px] mb-4">
        <span className="flex items-center gap-1">
          <Shield size={12} className="text-up/80" />
          {t('secure_connection')}
        </span>
        <span className="flex items-center gap-1">
          <Zap size={12} className="text-amber-500/80" />
          {t('fast_withdraw')}
        </span>
      </div>

      {/* Дисклеймер */}
      <p className="text-[10px] text-neutral-600 leading-relaxed mb-3">
        {t('disclaimer')}
      </p>

      {/* Ссылки */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
        <a href={supportLink} target="_blank" rel="noopener noreferrer" className="text-neon/90 hover:underline">
          {t('support')}
        </a>
        <span className="text-neutral-700">•</span>
        <span>eToro</span>
      </div>
    </footer>
  );
};

export default SiteFooter;
