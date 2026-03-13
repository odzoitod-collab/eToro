import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { Haptic } from '../utils/haptics';
import { useLanguage } from '../context/LanguageContext';
import PinKeypad, { PIN_LENGTH } from './PinKeypad';
import { setPin as savePin } from '../utils/pinStorage';

interface CreatePinScreenProps {
  tgid?: string;
  webUserId?: number;
  onCreated: () => void;
}

const CreatePinScreen: React.FC<CreatePinScreenProps> = ({ tgid, webUserId, onCreated }) => {
  const { t } = useLanguage();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleComplete = async (enteredPin: string) => {
    if (enteredPin.length !== PIN_LENGTH) return;
    setError('');
    const userId = tgid || webUserId?.toString();
    if (userId) {
      await savePin(userId, enteredPin);
    }
    Haptic.success();
    onCreated();
  };

  return (
    <div className="fullscreen-overlay z-[200] bg-background flex flex-col items-center justify-center overflow-y-auto py-8 animate-fade-in">
      {/* Intentional: no Back/Cancel — security requirement, PIN must be created before using the app */}
      <div className="flex flex-col items-center w-full max-w-[360px] px-4">
        <div className="flex items-center justify-between w-full mb-6">
          <span className="text-xs text-textMuted">
            {t('step_of', { n: '2', total: '3' })}
          </span>
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
            <span className="h-1.5 w-3 rounded-full bg-neon" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
          </div>
        </div>
        <div className="w-20 h-20 rounded-full border-2 border-neon/40 bg-neon/10 flex items-center justify-center mb-8 flex-shrink-0">
          <Check size={40} className="text-neon" strokeWidth={2.5} />
        </div>
        <h1 className="text-2xl font-bold text-white text-center mb-2 tracking-tight">
          {t('create_pin_first')}
        </h1>
        <p className="text-sm text-textMuted text-center mb-2 max-w-xs leading-relaxed">
          {t('create_pin_hint_first')}
        </p>
        <p className="text-xs text-textMuted text-center mb-8 max-w-xs leading-relaxed">
          {t('create_pin_security_subtitle') ?? 'PIN защищает ваш счёт от несанкционированного доступа. Запомните его и не делитесь с другими.'}
        </p>

        <PinKeypad
          value={pin}
          onChange={setPin}
          onSubmit={(enteredPin) => handleComplete(enteredPin)}
          error={!!error}
        />

        {error && (
          <p className="mt-6 text-sm text-red-400 text-center font-medium">{error}</p>
        )}
      </div>
    </div>
  );
};

export default CreatePinScreen;
