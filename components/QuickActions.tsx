import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Scan, User } from 'lucide-react';
import { PageView } from '../types';
import { Haptic } from '../utils/haptics';
import { useLanguage } from '../context/LanguageContext';

interface QuickActionsProps {
    onNavigate: (page: PageView) => void;
}

const QuickActions: React.FC<QuickActionsProps> = ({ onNavigate }) => {
  const { t } = useLanguage();
  const actions: { labelKey: string; icon: any; highlight: boolean; target: PageView }[] = [
    { labelKey: 'quick_deposit', icon: ArrowDownLeft, highlight: true, target: 'DEPOSIT' },
    { labelKey: 'quick_withdraw', icon: ArrowUpRight, highlight: false, target: 'WITHDRAW' },
    { labelKey: 'quick_scan', icon: Scan, highlight: false, target: 'QR_SCANNER' },
    { labelKey: 'profile', icon: User, highlight: false, target: 'PROFILE' },
  ];

  return (
    <div className="flex justify-between items-start gap-4 sm:gap-6 px-2 lg:px-6 mb-6 -mt-1 max-w-2xl mx-auto lg:max-w-4xl">
      {actions.map((action) => (
        <button
          key={action.labelKey}
          type="button"
          onClick={() => { Haptic.tap(); onNavigate(action.target); }}
          className="touch-target flex flex-col items-center flex-1 min-w-0 space-y-3 rounded-2xl active:scale-95 transition-transform duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-neon/50"
        >
          <div
            className={`
              h-14 w-14 sm:h-16 sm:w-16 rounded-full flex items-center justify-center transition-colors duration-200 border flex-shrink-0
              ${action.highlight
                ? 'bg-neon text-black border-neon'
                : 'bg-card text-white border-border hover:bg-surface hover:border-white/10'
              }
            `}
          >
            <action.icon size={24} strokeWidth={2} className="sm:w-6 sm:h-6" />
          </div>
          <span className="text-xs font-semibold text-textMuted text-center leading-tight">
            {t(action.labelKey)}
          </span>
        </button>
      ))}
    </div>
  );
};

export default QuickActions;