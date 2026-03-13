import React, { useState } from 'react';
import { Trophy, XCircle, BarChart3, HelpCircle, ChevronRight, ShieldCheck, ShieldAlert, KeyRound, DollarSign, Languages, LogOut, FileText } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import BottomSheet from '../components/BottomSheet';
import { Deal } from '../types';
import { Haptic } from '../utils/haptics';
import { useUser } from '../context/UserContext';
import { usePin } from '../context/PinContext';
import { usePasswordChange } from '../context/PasswordChangeContext';
import { useCurrency } from '../context/CurrencyContext';
import { useLanguage } from '../context/LanguageContext';
import { checkPin, setPin } from '../utils/pinStorage';
import PinKeypad from '../components/PinKeypad';
import { useToast } from '../context/ToastContext';
import { useWebAuth } from '../context/WebAuthContext';

interface ProfilePageProps {
  deals: Deal[];
  onBack: () => void;
  onNavigateToKyc?: () => void;
  onNavigateToCurrency?: () => void;
  onNavigateToLanguage?: () => void;
  /** Сигнализируем наверх, что открыт полноэкранный слой (чтобы скрыть навигацию). */
  onFullscreenChange?: (open: boolean) => void;
}

type ChangePinStep = null | 'current' | 'new' | 'repeat';

const ProfilePage: React.FC<ProfilePageProps> = ({
  deals,
  onBack,
  onNavigateToKyc,
  onNavigateToCurrency,
  onNavigateToLanguage,
  onFullscreenChange,
}) => {
  const { user, supportLink, tgid, webUserId } = useUser();
  const { logout } = useWebAuth();
  const { hasPin } = usePin();
  const { setPasswordChangeActive } = usePasswordChange();
  const { symbol, currencyCode } = useCurrency();
  const { t, locale } = useLanguage();
  const toast = useToast();
  const [changePinStep, setChangePinStep] = useState<ChangePinStep>(null);
  const [currentPinValue, setCurrentPinValue] = useState('');
  const [newPinValue, setNewPinValue] = useState('');
  const [repeatPinValue, setRepeatPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const newPinRef = React.useRef('');
  const [showLegalModal, setShowLegalModal] = useState(false);

  // Управляем состоянием смены пароля для скрытия навигации
  React.useEffect(() => {
    setPasswordChangeActive(changePinStep !== null);
  }, [changePinStep, setPasswordChangeActive]);

  // Сообщаем наверх о полноэкранных слоях (смена PIN или экран лицензий)
  React.useEffect(() => {
    onFullscreenChange?.(showLegalModal || changePinStep !== null);
  }, [showLegalModal, changePinStep, onFullscreenChange]);

  const finishedDeals = deals.filter((d) => d.status === 'WIN' || d.status === 'LOSS');
  const winsFromDeals = finishedDeals.filter((d) => d.status === 'WIN').length;
  const lossesFromDeals = finishedDeals.filter((d) => d.status === 'LOSS').length;
  const wins = user?.stats_wins != null ? user.stats_wins : winsFromDeals;
  const losses = user?.stats_losses != null ? user.stats_losses : lossesFromDeals;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  const isWebUser = !!(user?.web_registered || (user?.email && !tgid));
  const displayName = user?.full_name || user?.username || (user?.email && isWebUser ? user.email : (user ? t('user_placeholder') : t('guest')));
  const displayId = user ? `#${user.user_id}` : '—';
  const avatarUrl = isWebUser ? undefined : (user?.photo_url || undefined);
  const isGuest = !user;

  return (
    <div className="flex flex-col h-full bg-background animate-fade-in max-w-2xl lg:max-w-4xl mx-auto">
      <PageHeader title={t('profile')} onBack={onBack} />
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 lg:px-6 lg:py-6">
        {/* Компактная планка аватар + имя / веб: только email */}
        <div className="flex items-center gap-3 mb-6 py-2">
          {!isWebUser && (
            <div className="relative flex-shrink-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="w-10 h-10 rounded-full border border-border bg-card object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full border border-border bg-card flex items-center justify-center text-neon text-sm font-semibold">
                  {(displayName || '?').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-white truncate">{displayName}</h2>
            <span className="text-[11px] font-mono text-neutral-500">{displayId}</span>
            {isWebUser && user?.email && (
              <p className="text-[11px] text-neutral-500 truncate mt-0.5">{user.email}</p>
            )}
          </div>
        </div>

        {/* Верификация — компактно */}
        {!isGuest && (
          <div className="mb-5">
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                user?.is_kyc === true
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : 'bg-amber-500/5 border-amber-500/20'
              }`}
            >
              {user?.is_kyc === true ? (
                <ShieldCheck size={14} className="text-emerald-500 flex-shrink-0" />
              ) : (
                <ShieldAlert size={14} className="text-amber-500 flex-shrink-0" />
              )}
              <span className={`text-xs font-medium ${user?.is_kyc === true ? 'text-emerald-400' : 'text-amber-400'}`}>
                {user?.is_kyc === true ? t('verified') : t('verification_required')}
              </span>
            </div>
            {user?.is_kyc !== true && onNavigateToKyc && (
              <button
                onClick={() => { Haptic.tap(); onNavigateToKyc(); }}
                className="mt-2 w-full py-2.5 px-3 bg-neon/90 text-black text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 hover:bg-neon active:scale-[0.99] transition-all"
              >
                <ShieldCheck size={14} />
                {t('verify_btn')}
              </button>
            )}
          </div>
        )}

        {isGuest && (
          <p className="text-[11px] text-neutral-500 mb-5">{t('open_from_telegram')}</p>
        )}

        {/* Статистика — минималистичная сетка */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          <div className="bg-card border border-border rounded-lg px-3 py-2.5 text-center">
            <Trophy size={14} className="text-emerald-500 mx-auto mb-1" />
            <span className="text-sm font-bold text-white tabular-nums">{wins}</span>
            <p className="text-[9px] text-neutral-500 uppercase tracking-wider mt-0.5">{t('wins')}</p>
          </div>
          <div className="bg-card border border-border rounded-lg px-3 py-2.5 text-center">
            <XCircle size={14} className="text-red-500/80 mx-auto mb-1" />
            <span className="text-sm font-bold text-white tabular-nums">{losses}</span>
            <p className="text-[9px] text-neutral-500 uppercase tracking-wider mt-0.5">{t('losses')}</p>
          </div>
          <div className="bg-card border border-border rounded-lg px-3 py-2.5 text-center">
            <BarChart3 size={14} className="text-neon/80 mx-auto mb-1" />
            <span className="text-sm font-bold text-white tabular-nums">{winRate}%</span>
            <p className="text-[9px] text-neutral-500 uppercase tracking-wider mt-0.5">{t('winrate')}</p>
          </div>
        </div>

        {/* Меню — тонкие строки */}
        <div className="space-y-1">
          {onNavigateToLanguage && (
            <button
              type="button"
              onClick={() => { Haptic.tap(); onNavigateToLanguage(); }}
              className="w-full bg-card border border-border rounded-lg px-3 py-2.5 flex items-center justify-between group text-left hover:bg-surface active:scale-[0.99] transition-all min-h-[56px]"
            >
              <div className="flex items-center gap-2.5">
                <Languages size={16} className="text-neutral-500 group-hover:text-neon/80" />
                <span className="text-xs font-medium text-neutral-300 group-hover:text-white">{t('language_title')}</span>
              </div>
              <span className="text-[11px] text-neutral-500 font-mono">{locale === 'en' ? 'EN' : locale === 'ru' ? 'RU' : locale === 'pl' ? 'PL' : locale === 'kk' ? 'KK' : 'CS'}</span>
              <ChevronRight size={14} className="text-neutral-600 -mr-1" />
            </button>
          )}
          {onNavigateToCurrency && (
            <button
              type="button"
              onClick={() => { Haptic.tap(); onNavigateToCurrency(); }}
              className="w-full bg-card border border-border rounded-lg px-3 py-2.5 flex items-center justify-between group text-left hover:bg-surface active:scale-[0.99] transition-all min-h-[56px]"
            >
              <div className="flex items-center gap-2.5">
                <DollarSign size={16} className="text-neutral-500 group-hover:text-neon/80" />
                <span className="text-xs font-medium text-neutral-300 group-hover:text-white">{t('currency')}</span>
              </div>
              <span className="text-[11px] text-neutral-500 font-mono">{currencyCode}</span>
              <ChevronRight size={14} className="text-neutral-600 -mr-1" />
            </button>
          )}
          <button
            type="button"
            onClick={() => { Haptic.tap(); setShowLegalModal(true); }}
            className="w-full bg-card border border-border rounded-lg px-3 py-2.5 flex items-center justify-between group text-left hover:bg-surface active:scale-[0.99] transition-all min-h-[56px]"
          >
            <div className="flex items-center gap-2.5">
              <FileText size={16} className="text-neutral-500 group-hover:text-neon/80" />
              <span className="text-xs font-medium text-neutral-300 group-hover:text-white">{t('legal_title')}</span>
            </div>
            <ChevronRight size={14} className="text-neutral-600 -mr-1" />
          </button>
          {!isGuest && tgid && hasPin(tgid) && (
            <button
              type="button"
              onClick={() => {
                Haptic.tap();
                setChangePinStep('current');
                setCurrentPinValue('');
                setNewPinValue('');
                setRepeatPinValue('');
                setPinError('');
              }}
              className="w-full bg-card border border-border rounded-lg px-3 py-2.5 flex items-center justify-between group text-left hover:bg-surface active:scale-[0.99] transition-all min-h-[56px]"
            >
              <div className="flex items-center gap-2.5">
                <KeyRound size={16} className="text-neutral-500 group-hover:text-neon/80" />
                <span className="text-xs font-medium text-neutral-300 group-hover:text-white">{t('change_password')}</span>
              </div>
              <ChevronRight size={14} className="text-neutral-600" />
            </button>
          )}
          {!isGuest && webUserId && hasPin(webUserId.toString()) && (
            <button
              type="button"
              onClick={() => {
                Haptic.tap();
                setChangePinStep('current');
                setCurrentPinValue('');
                setNewPinValue('');
                setRepeatPinValue('');
                setPinError('');
              }}
              className="w-full bg-card border border-border rounded-lg px-3 py-2.5 flex items-center justify-between group text-left hover:bg-surface active:scale-[0.99] transition-all min-h-[56px]"
            >
              <div className="flex items-center gap-2.5">
                <KeyRound size={16} className="text-neutral-500 group-hover:text-neon/80" />
                <span className="text-xs font-medium text-neutral-300 group-hover:text-white">{t('change_password')}</span>
              </div>
              <ChevronRight size={14} className="text-neutral-600" />
            </button>
          )}
          <a
            href={supportLink}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-card border border-border rounded-lg px-3 py-2.5 flex items-center justify-between group block hover:bg-surface active:scale-[0.99] transition-all min-h-[56px]"
            onClick={() => Haptic.tap()}
          >
            <div className="flex items-center gap-2.5">
              <HelpCircle size={16} className="text-neutral-500 group-hover:text-white" />
              <span className="text-xs font-medium text-neutral-300 group-hover:text-white">{t('support')}</span>
            </div>
            <ChevronRight size={14} className="text-neutral-600" />
          </a>
          {isWebUser && webUserId && (
            <button
              type="button"
              onClick={() => { Haptic.tap(); logout(); window.location.href = '/'; }}
              className="w-full bg-card border border-border rounded-lg px-3 py-2.5 flex items-center justify-between group text-left hover:bg-surface active:scale-[0.99] transition-all min-h-[56px]"
            >
              <div className="flex items-center gap-2.5">
                <LogOut size={16} className="text-neutral-500 group-hover:text-red-400" />
                <span className="text-xs font-medium text-neutral-300 group-hover:text-white">Выйти</span>
              </div>
              <ChevronRight size={14} className="text-neutral-600" />
            </button>
          )}
        </div>
      </div>

      {/* Лист с лицензиями и партнёрами (expandable bottom sheet) */}
      <BottomSheet
        open={showLegalModal}
        onClose={() => setShowLegalModal(false)}
        title={t('legal_title')}
        variant="expandable"
      >
        <div className="space-y-6 pb-4">
            {/* Лицензии — компактные карточки */}
            <section>
              <h3 className="text-xs font-semibold text-textSecondary uppercase tracking-cap mb-2 flex items-center gap-2">
                <ShieldCheck size={14} className="text-neon" />
                {t('legal_licenses')}
              </h3>
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-3 py-2 border-b border-border grid grid-cols-4 gap-2 text-[10px] font-mono uppercase tracking-cap text-textSecondary">
                  <span>Юрисдикция</span>
                  <span>Регулятор</span>
                  <span>Номер</span>
                  <span>Статус</span>
                </div>
                <div className="divide-y divide-border">
                  <div className="px-3 py-2.5 grid grid-cols-4 gap-2 text-xs">
                    <span className="text-textPrimary">Маврикий</span>
                    <span className="text-textSecondary">FSC</span>
                    <span className="font-mono text-textPrimary">GBXXXXXX</span>
                    <span className="text-up text-[10px]">Действующая</span>
                  </div>
                  <div className="px-3 py-2.5 grid grid-cols-4 gap-2 text-xs">
                    <span className="text-textPrimary">Сент-Винсент и Гренадины</span>
                    <span className="text-textSecondary">—</span>
                    <span className="font-mono text-textPrimary">XXXXX</span>
                    <span className="text-up text-[10px]">Действующая</span>
                  </div>
                  <div className="px-3 py-2.5 grid grid-cols-4 gap-2 text-xs">
                    <span className="text-textPrimary">Литва</span>
                    <span className="text-textSecondary">FCIS</span>
                    <span className="font-mono text-textPrimary">XXXXX</span>
                    <span className="text-up text-[10px]">Действующая</span>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-textSecondary leading-snug">
                Company Name Ltd. · Suite 305, Griffith Corporate Centre, Kingstown, St. Vincent and the Grenadines
              </p>
            </section>

            {/* Регуляторы */}
            <section>
              <h3 className="text-xs font-semibold text-textSecondary uppercase tracking-cap mb-2 flex items-center gap-2">
                <ShieldAlert size={14} className="text-amber-400" />
                {t('legal_regulators')}
              </h3>
              <div className="space-y-2">
                <a href="https://www.fscmauritius.org" target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-border bg-card px-3 py-2.5 hover:border-neon transition-colors">
                  <span className="text-sm font-medium text-textPrimary">FSC Mauritius</span>
                  <span className="block text-[11px] text-textSecondary mt-0.5">Financial Services Commission · Реестр лицензий</span>
                </a>
                <a href="https://www.fntt.lt" target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-border bg-card px-3 py-2.5 hover:border-neon transition-colors">
                  <span className="text-sm font-medium text-textPrimary">FCIS Lithuania</span>
                  <span className="block text-[11px] text-textSecondary mt-0.5">Financial Crime Investigation Service · VASP</span>
                </a>
                <a href="https://register.fca.org.uk" target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-border bg-card px-3 py-2.5 hover:border-neon transition-colors">
                  <span className="text-sm font-medium text-textPrimary">FCA UK</span>
                  <span className="block text-[11px] text-textSecondary mt-0.5">Financial Conduct Authority · Реестр</span>
                </a>
              </div>
            </section>

            {/* Поставщики ликвидности */}
            <section>
              <h3 className="text-xs font-semibold text-textSecondary uppercase tracking-cap mb-2 flex items-center gap-2">
                <BarChart3 size={14} className="text-neon" />
                {t('legal_liquidity_providers')}
              </h3>
              <div className="rounded-xl border border-border bg-card p-3 space-y-3">
                <div>
                  <p className="text-[11px] font-medium text-textSecondary mb-1">Tier-1 LP</p>
                  <p className="text-xs text-textPrimary">Goldman Sachs, JP Morgan, UBS, Barclays, Deutsche Bank, Citibank</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-textSecondary mb-1">Агрегаторы</p>
                  <p className="text-xs text-textPrimary">oneZero, PrimeXM, Integral Development Corp</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-textSecondary mb-1">Форматы</p>
                  <p className="text-xs text-textPrimary">STP, ECN, Prime of Prime</p>
                </div>
              </div>
            </section>

            <p className="text-[10px] text-textSecondary leading-snug border-t border-border pt-4">
              Информация приведена в демонстрационных целях. Изучите юридические документы компании перед использованием сервиса.
            </p>
          </div>
      </BottomSheet>

      {/* Модалка смены пароля */}
      <BottomSheet
        open={!!changePinStep && !!(tgid || webUserId)}
        onClose={() => { setChangePinStep(null); setPinError(''); }}
        title={
          changePinStep === 'current' ? t('pin_current') :
          changePinStep === 'new' ? t('pin_new') : t('pin_repeat')
        }
        closeOnBackdrop
      >
        <div className="space-y-4">
          {changePinStep === 'current' && (
            <>
              <PinKeypad
                value={currentPinValue}
                onChange={setCurrentPinValue}
                onSubmit={async (pin) => {
                  const userId = tgid || webUserId?.toString();
                  if (userId) {
                    const ok = await checkPin(userId, pin);
                    if (ok) {
                      setPinError('');
                      setCurrentPinValue('');
                      setChangePinStep('new');
                    } else {
                      Haptic.error();
                      setPinError(t('pin_wrong'));
                      setCurrentPinValue('');
                    }
                  }
                }}
                error={!!pinError}
              />
              {pinError && <p className="text-center text-red-500 text-xs mt-3">{pinError}</p>}
            </>
          )}
          {changePinStep === 'new' && (
            <PinKeypad
              value={newPinValue}
              onChange={setNewPinValue}
              onSubmit={(pin) => {
                newPinRef.current = pin;
                setNewPinValue('');
                setRepeatPinValue('');
                setPinError('');
                setChangePinStep('repeat');
              }}
              error={!!pinError}
            />
          )}
          {changePinStep === 'repeat' && (
            <>
              <PinKeypad
                value={repeatPinValue}
                onChange={setRepeatPinValue}
                onSubmit={async (pin) => {
                  if (pin !== newPinRef.current) {
                    Haptic.error();
                    setPinError(t('pin_mismatch'));
                    setRepeatPinValue('');
                    return;
                  }
                  setPinError('');
                  const userId = tgid || webUserId?.toString();
                  if (userId) {
                    await setPin(userId, pin);
                    Haptic.success();
                    toast.show(t('pin_changed'), 'success');
                    setChangePinStep(null);
                  }
                }}
                error={!!pinError}
              />
              {pinError && <p className="text-center text-red-500 text-xs mt-3">{pinError}</p>}
            </>
          )}
        </div>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => {
              Haptic.tap();
              setChangePinStep(null);
              setPinError('');
            }}
            className="px-3 py-2 rounded-xl border border-border text-textSecondary text-sm font-medium"
          >
            {t('cancel')}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
};

export default ProfilePage;
