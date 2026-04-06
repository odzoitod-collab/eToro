import { useState, useEffect, useRef } from 'react';
import { Asset } from '../types';
import { fetchAssetPricesInRub, getCachedPrices, isCacheExpired } from '../lib/cryptoPrices';

// Обновляем раз в 10 минут — цены не нужны чаще
const FETCH_INTERVAL_MS = 10 * 60 * 1000;

function tickerKey(assets: Asset[]): string {
  return assets.map((a) => a.ticker).sort().join(',');
}

function mergeWithCache(base: Asset[]): Asset[] {
  const cached = getCachedPrices();
  if (!cached || Object.keys(cached).length === 0) return base.map((a) => ({ ...a }));
  return base.map((a) => {
    const data = cached[a.ticker];
    if (!data) return { ...a };
    return { ...a, price: data.price, change24h: data.change24h };
  });
}

function mergeWithCachePreservingPrev(base: Asset[], prev: Asset[]): Asset[] {
  const cached = getCachedPrices();
  return base.map((a) => {
    const data = cached?.[a.ticker];
    if (data) return { ...a, price: data.price, change24h: data.change24h };
    const prevAsset = prev.find((p) => p.ticker === a.ticker);
    if (prevAsset) return prevAsset;
    return { ...a };
  });
}

export function useLiveAssets(baseAssets: Asset[]): Asset[] {
  // Мгновенный старт из кеша — нет мигания
  const [assets, setAssets] = useState<Asset[]>(() => mergeWithCache(baseAssets));
  const baseRef = useRef(baseAssets);
  const tickerKeyRef = useRef(tickerKey(baseAssets));

  useEffect(() => {
    const nextKey = tickerKey(baseAssets);
    if (nextKey !== tickerKeyRef.current) {
      tickerKeyRef.current = nextKey;
      baseRef.current = baseAssets;
      setAssets((prev) => mergeWithCachePreservingPrev(baseAssets, prev));
    } else {
      baseRef.current = baseAssets;
    }
  }, [baseAssets]);

  useEffect(() => {
    const tickers = baseRef.current.map((a) => a.ticker);
    if (tickers.length === 0) return;

    const applyPrices = (prices: Record<string, { price: number; change24h: number }>) => {
      setAssets((prev) =>
        prev.map((a) => {
          const data = prices[a.ticker];
          if (!data) return a;
          return { ...a, price: data.price, change24h: data.change24h };
        })
      );
    };

    const update = async () => {
      try {
        const prices = await fetchAssetPricesInRub(tickers);
        if (Object.keys(prices).length > 0) applyPrices(prices);
      } catch {
        // тихо — кеш уже показан
      }
    };

    // Обновляем сразу только если кеш устарел, иначе показываем кеш мгновенно
    if (isCacheExpired()) {
      update();
    }

    const interval = setInterval(update, FETCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return assets;
}
