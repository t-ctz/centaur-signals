export const assetNames: Record<number, { name: string; symbol: string; class?: string }> = {
  1: { name: 'Bitcoin', symbol: 'BTC', class: 'crypto' },
  10: { name: 'Ethereum', symbol: 'ETH', class: 'crypto' },
  52: { name: 'XRP', symbol: 'XRP', class: 'crypto' },
  74: { name: 'Dogecoin', symbol: 'DOGE', class: 'crypto' },
  80: { name: 'Solana', symbol: 'SOL', class: 'crypto' },
  201: { name: 'Chainlink', symbol: 'LINK', class: 'crypto' },
  319: { name: 'Litecoin', symbol: 'LTC', class: 'crypto' },
  671: { name: 'Fartcoin', symbol: 'FARTCOIN', class: 'crypto' },
}

export function getAsset(id: number, cache?: AssetCache) {
  if (cache && cache[id]) return cache[id]
  return assetNames[id] || { name: `Asset #${id}`, symbol: `#${id}`, class: 'unknown' }
}

export interface AssetCache {
  [id: number]: { name: string; symbol: string; class?: string }
}

export function formatPrice(n: number): string {
  if (n === undefined || n === null) return '-'
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (n >= 0.01) return n.toLocaleString(undefined, { maximumFractionDigits: 4 })
  return n.toLocaleString(undefined, { maximumFractionDigits: 8 })
}

export function formatPct(n: number): string {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

export const signalLabels: Record<string, string> = {
  trending: '🔥 Trending',
  specialists: '🎯 Specialist Ideas',
  early: '🌱 Early Opportunities',
  crowdFade: '🧠 Crowd Fade',
  smartMoney: '💰 Smart Money',
  leadersBook: '📒 Leaders Book',
}

export function toISODateUTC(d: Date) {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}
