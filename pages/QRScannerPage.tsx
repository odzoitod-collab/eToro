import React, { useEffect, useRef, useState } from 'react';
import { Scan, X } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { Html5Qrcode } from 'html5-qrcode';
import { Haptic } from '../utils/haptics';
import { useLanguage } from '../context/LanguageContext';
import BottomSheetFooter from '../components/BottomSheetFooter';

const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : undefined;

interface QRScannerPageProps {
  onBack: () => void;
  onScan?: (data: string) => void;
}

const QRScannerPage: React.FC<QRScannerPageProps> = ({ onBack, onScan }) => {
  const { t } = useLanguage();
  const [status, setStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = 'qr-reader';

  const handleQrResult = (text: string) => {
    Haptic.medium();
    setLastResult(text);
    setStatus('success');
    tg?.closeScanQrPopup?.();
    onScan?.(text);
  };

  const startScanning = async () => {
    setErrorMsg(null);

    if (tg?.showScanQrPopup) {
      const onQr = (e: unknown) => {
        const text = typeof e === 'string' ? e : (e as { data?: string; text?: string })?.data ?? (e as { text?: string })?.text ?? (typeof e === 'object' && e ? String((e as Record<string, unknown>).text ?? (e as Record<string, unknown>).data ?? '') : String(e ?? ''));
        if (text?.trim()) handleQrResult(text.trim());
      };
      const onClosed = () => {
        tg?.offEvent?.('qrTextReceived', onQr);
        tg?.offEvent?.('scanQrPopupClosed', onClosed);
      };
      tg.onEvent('qrTextReceived', onQr);
      tg.onEvent('scanQrPopupClosed', onClosed);
      tg.showScanQrPopup({ text: 'Наведите камеру на QR-код' });
      return;
    }

    setStatus('scanning');
    try {
      const html5QrCode = new Html5Qrcode(containerId);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          handleQrResult(decodedText);
          html5QrCode.stop();
          scannerRef.current = null;
        },
        () => {}
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось открыть камеру';
      setErrorMsg(msg);
      setStatus('error');
      scannerRef.current = null;
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {}
      scannerRef.current = null;
    }
    setStatus('idle');
    setLastResult(null);
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-background animate-fade-in">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Scan size={20} className="text-neon" />
            Сканер QR-кода
          </span>
        }
        onBack={() => { stopScanning(); onBack(); }}
      />
      <div className="flex-1 flex flex-col items-center justify-center px-4 pt-4 pb-6">
        {status === 'idle' && (
          <div className="text-center">
            <div className="w-24 h-24 rounded-2xl bg-card border border-neon flex items-center justify-center mx-auto mb-6">
              <Scan size={48} className="text-neon" />
            </div>
            <p className="text-neutral-400 text-sm mb-6 max-w-xs">
              Откроется передняя камера телефона для сканирования QR-кода
            </p>
            <button
              onClick={() => { Haptic.tap(); startScanning(); }}
              className="w-full max-w-xs py-4 bg-neon text-black font-bold rounded-xl active:scale-95 transition-transform"
            >
              Открыть камеру
            </button>
          </div>
        )}

        {status === 'scanning' && (
          <div className="w-full max-w-sm flex-1 flex flex-col">
            <div id={containerId} className="rounded-2xl overflow-hidden bg-black flex-1" style={{ minHeight: 300 }} />
            <div className="mt-auto w-full">
              <button
                onClick={() => { Haptic.tap(); stopScanning(); }}
                className="w-full py-3 bg-card border border-border text-white font-semibold rounded-xl flex items-center justify-center gap-2"
              >
                <X size={20} />
                Остановить
              </button>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="w-full max-w-sm flex-1 flex flex-col">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-card border border-neon flex items-center justify-center mx-auto mb-4">
                <Scan size={32} className="text-neon" />
              </div>
              <p className="text-neon font-semibold mb-2">QR-код распознан</p>
              <div className="bg-neutral-900 rounded-xl p-3 mb-4 break-all text-left text-xs text-neutral-300 font-mono max-h-24 overflow-y-auto">
                {lastResult}
              </div>
            </div>
            <div className="mt-auto w-full">
              <BottomSheetFooter
                onCancel={() => {
                  Haptic.tap();
                  setStatus('idle');
                  setLastResult(null);
                }}
                onConfirm={() => {
                  Haptic.tap();
                  onBack();
                }}
                cancelLabel="Ещё раз"
                confirmLabel="Готово"
              />
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center max-w-xs">
            <p className="text-red-400 text-sm mb-4">{errorMsg}</p>
            <p className="text-neutral-500 text-xs mb-6">Разрешите доступ к камере в настройках браузера</p>
            <button
              onClick={() => { Haptic.tap(); setStatus('idle'); setErrorMsg(null); }}
              className="w-full py-3 bg-neon text-black font-bold rounded-xl"
            >
              Попробовать снова
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default QRScannerPage;
