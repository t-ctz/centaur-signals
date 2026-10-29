import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { getAsset, formatPrice, toISODateUTC, type AssetCache } from '@/lib/assets'
import type { Trade } from '@/lib/types'

const typeLabels: Record<string, string> = {
  open: 'Opened',
  close: 'Closed',
  increase: 'Increased',
  decrease: 'Decreased',
}

interface HLAsset {
  a: number
  coin: string
  szDecimals: number
  maxLeverage: number
}

interface AccountSummary {
  withdrawable: number
  spotUsdcTotal: number
  spotUsdcHold: number
  mode: string
}

export default function FeedPage() {
  const [apiKey, setApiKey] = useState('')
  const [keyType, setKeyType] = useState<'centaur' | 'openfinance'>('centaur')
  const [trades, setTrades] = useState<Trade[]>([])
  const [assetCache, setAssetCache] = useState<AssetCache>({})
  const [traderCache, setTraderCache] = useState<Record<number, { name: string; handle?: string }>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')
  const [hlAssets, setHlAssets] = useState<HLAsset[]>([])
  const [hlMids, setHlMids] = useState<Record<string, string>>({})
  const [account, setAccount] = useState<AccountSummary | null>(null)
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [savedNotes, setSavedNotes] = useState<Record<string, string>>({})

  useEffect(() => {
    setApiKey(localStorage.getItem('centaurApiKey') || '')
    setKeyType((localStorage.getItem('centaurKeyType') as any) || 'centaur')
    setSavedNotes(JSON.parse(localStorage.getItem('centaurNotes') || '{}'))
  }, [])

  useEffect(() => {
    localStorage.setItem('centaurApiKey', apiKey)
    localStorage.setItem('centaurKeyType', keyType)
  }, [apiKey, keyType])

  useEffect(() => {
    localStorage.setItem('centaurNotes', JSON.stringify(savedNotes))
  }, [savedNotes])

  const now = new Date()
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0))

  const hlFetch = async (action: string, payload?: any) => {
    const res = await fetch('/api/hyperliquid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, apiKey, payload }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || `${action} failed`)
    return json
  }

  const loadAccount = async () => {
    if (!apiKey) return
    try {
      const data = await hlFetch('account')
      const ch = data.clearinghouseState || {}
      const spot = data.spotClearinghouseState || {}
      const usdc = (spot.balances || []).find((b: any) => b.coin === 'USDC') || { total: 0, hold: 0 }
      const mode = data.userAbstraction || 'unknown'
      if (Number(ch.withdrawable || 0) > 0 && (mode === 'default' || mode === 'disabled')) {
        await hlFetch('abstraction', { abstraction: 'u' })
      }
      setAccount({
        withdrawable: Number(ch.withdrawable || 0),
        spotUsdcTotal: Number(usdc.total || 0),
        spotUsdcHold: Number(usdc.hold || 0),
        mode,
      })
    } catch (e: any) {
      setError((prev) => prev || `HL account: ${e.message}`)
    }
  }

  const loadMarkets = async () => {
    if (!apiKey) return
    try {
      const [metas, mids] = await Promise.all([hlFetch('metas'), hlFetch('mids')])
      const universe = metas?.universe || []
      setHlAssets(
        universe.map((u: any, idx: number) => ({
          a: idx,
          coin: u.name,
          szDecimals: u.szDecimals ?? 8,
          maxLeverage: u.maxLeverage ?? 1,
        }))
      )
      setHlMids(mids || {})
    } catch (e: any) {
      setError((prev) => prev || `HL markets: ${e.message}`)
    }
  }

  const load = async () => {
    if (!apiKey) return setError('Paste your API key first.')
    setLoading(true)
    setError('')
    try {
      await Promise.all([loadAccount(), loadMarkets()])

      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          keyType,
          startTime: toISODateUTC(startOfDay),
          endTime: toISODateUTC(now),
          limit: 200,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to fetch trades')
      const fetched: Trade[] = json.trades || []
      setTrades(fetched)

      const assetIds = [...new Set(fetched.map((t) => t.assetId))].filter((id) => !assetCache[id])
      const traderIds = [...new Set(fetched.map((t) => t.traderId))].filter((id) => !traderCache[id])

      if (assetIds.length > 0) {
        const aRes = await fetch('/api/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: assetIds, apiKey, keyType }),
        })
        const aJson = await aRes.json()
        if (aRes.ok && aJson.assets) {
          setAssetCache((prev) => ({ ...prev, ...aJson.assets }))
        }
      }

      if (traderIds.length > 0) {
        const tRes = await fetch('/api/traders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: traderIds, apiKey, keyType }),
        })
        const tJson = await tRes.json()
        if (tRes.ok && tJson.traders) {
          setTraderCache((prev) => ({ ...prev, ...tJson.traders }))
        }
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const filtered = trades.filter((t) => {
    const asset = getAsset(t.assetId, assetCache)
    const trader = traderCache[t.traderId] || { name: `Trader #${t.traderId}` }
    const matchesTab = activeTab === 'all' || t.type === activeTab || (activeTab === 'long' && t.direction === 'long') || (activeTab === 'short' && t.direction === 'short')
    const q = search.toLowerCase()
    const matchesSearch = !q || asset.name.toLowerCase().includes(q) || asset.symbol.toLowerCase().includes(q) || trader.name.toLowerCase().includes(q)
    return matchesTab && matchesSearch
  })

  const totalUsdc = account ? account.withdrawable + account.spotUsdcTotal : 0

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Today's Trades</h1>
            <p className="text-neutral-400">All Centaur trading events posted since midnight UTC.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/signals">
              <Button variant="outline">📊 Signals</Button>
            </Link>
            <Link href="/bot">
              <Button variant="outline">🤖 Bot</Button>
            </Link>
          </div>
        </div>

        <Card className="bg-neutral-900 border-neutral-800">
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2 space-y-1">
                <Label>API Key</Label>
                <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="open_... or centaur_..." className="bg-neutral-950 border-neutral-800" />
              </div>
              <div className="space-y-1">
                <Label>Key Type</Label>
                <select value={keyType} onChange={(e) => setKeyType(e.target.value as any)} className="w-full h-10 px-3 rounded-md bg-neutral-950 border border-neutral-800 text-sm">
                  <option value="centaur">Centaur (direct)</option>
                  <option value="openfinance">OpenFinance</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button className="w-full" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Load Trades'}</Button>
              </div>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            {account && (
              <div className="text-sm text-neutral-400">
                Hyperliquid balance: <span className="text-neutral-200 font-semibold">${formatPrice(totalUsdc)} USDC</span>
                {' '}({formatPrice(totalUsdc - account.spotUsdcHold)} free, {formatPrice(account.spotUsdcHold)} locked)
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-neutral-900 border border-neutral-800 flex-wrap h-auto py-1">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="long">Long</TabsTrigger>
              <TabsTrigger value="short">Short</TabsTrigger>
              <TabsTrigger value="open">Opens</TabsTrigger>
              <TabsTrigger value="close">Closes</TabsTrigger>
              <TabsTrigger value="increase">Increases</TabsTrigger>
              <TabsTrigger value="decrease">Decreases</TabsTrigger>
            </TabsList>
          </Tabs>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search asset / trader…" className="w-full md:w-64 bg-neutral-950 border-neutral-800" />
        </div>

        {trades.length === 0 && !loading && !error && (
          <p className="text-neutral-500 text-center py-12">Load trades to see them here.</p>
        )}

        <div className="space-y-3">
          {filtered.map((t, i) => (
            <TradeRow
              key={i}
              t={t}
              assetCache={assetCache}
              traderCache={traderCache}
              hlAssets={hlAssets}
              hlMids={hlMids}
              account={account}
              note={savedNotes[t.id || `${t.assetId}-${t.traderId}-${t.happenedAt}`] || ''}
              noteDraft={noteDrafts[t.id || `${t.assetId}-${t.traderId}-${t.happenedAt}`] || ''}
              setNoteDraft={(id, v) => setNoteDrafts((prev) => ({ ...prev, [id]: v }))}
              saveNote={(id, v) => setSavedNotes((prev) => ({ ...prev, [id]: v }))}
              apiKey={apiKey}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function TradeRow({
  t,
  assetCache,
  traderCache,
  hlAssets,
  hlMids,
  account,
  note,
  noteDraft,
  setNoteDraft,
  saveNote,
  apiKey,
}: {
  t: Trade
  assetCache: AssetCache
  traderCache: Record<number, { name: string; handle?: string }>
  hlAssets: HLAsset[]
  hlMids: Record<string, string>
  account: AccountSummary | null
  note: string
  noteDraft: string
  setNoteDraft: (id: string, v: string) => void
  saveNote: (id: string, v: string) => void
  apiKey: string
}) {
  const asset = getAsset(t.assetId, assetCache)
  const trader = traderCache[t.traderId] || { name: `Trader #${t.traderId}` }
  const time = t.happenedAt ? new Date(t.happenedAt).toLocaleString() : '-'
  const id = t.id || `${t.assetId}-${t.traderId}-${t.happenedAt}`

  const [expanded, setExpanded] = useState(false)
  const [usdNotional, setUsdNotional] = useState('100')
  const [leverage, setLeverage] = useState('1')
  const [orderType, setOrderType] = useState<'Ioc' | 'Gtc' | 'Alo'>('Ioc')
  const [confirming, setConfirming] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [result, setResult] = useState<string>('')

  const hlAsset = hlAssets.find((h) => h.coin === asset.symbol || h.coin.endsWith(`:${asset.symbol}`))
  const mid = hlAsset ? Number(hlMids[hlAsset.coin] || 0) : 0
  const baseSize = mid && Number(usdNotional) ? (Number(usdNotional) / mid) : 0
  const roundedSize = hlAsset && baseSize ? baseSize.toFixed(hlAsset.szDecimals) : baseSize.toString()
  const notional = mid * Number(roundedSize)
  const required = notional / Math.max(1, Number(leverage) || 1)

  const placeOrder = async () => {
    if (!hlAsset || !mid) return setResult('Hyperliquid market data missing for this asset.')
    setPlacing(true)
    setResult('')
    try {
      const isBuy = t.direction === 'long'
      const payload = {
        orders: [
          {
            a: hlAsset.a,
            b: isBuy,
            p: String(mid),
            s: roundedSize,
            r: false,
            t: { limit: { tif: orderType } },
          },
        ],
        grouping: 'na',
      }
      const res = await fetch('/api/hyperliquid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'order', apiKey, payload }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || JSON.stringify(json))
      setResult(`Order placed: ${JSON.stringify(json)}`)
      setConfirming(false)
    } catch (e: any) {
      setResult(`Order failed: ${e.message}`)
    } finally {
      setPlacing(false)
    }
  }

  return (
    <Card className="bg-neutral-900 border-neutral-800 hover:border-neutral-700 transition">
      <CardContent className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-lg">{asset.name}</span>
              <span className="text-neutral-500 text-sm">({asset.symbol})</span>
              <Badge variant={t.direction === 'long' ? 'default' : 'destructive'}>{(t.direction || '?').toUpperCase()}</Badge>
              <Badge variant="outline">{typeLabels[t.type] || t.type}</Badge>
            </div>
            <div className="text-sm text-neutral-400">
              by <span className="text-neutral-200">{trader.name}</span>{trader.handle ? ` (@${trader.handle})` : ''} • {time}
            </div>
            {note && <div className="text-sm text-amber-300 mt-1">📝 {note}</div>}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-lg font-mono">{formatPrice(t.price)} <span className="text-sm text-neutral-500">{t.quoteSymbol || 'USD'}</span></div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setExpanded((v) => !v)}>{expanded ? 'Close' : 'Trade'}</Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-neutral-800 space-y-4">
            <div>
              <Label className="text-sm">Note</Label>
              <div className="flex gap-2 mt-1">
                <Textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(id, e.target.value)}
                  placeholder="Why this trade?"
                  className="bg-neutral-950 border-neutral-800 text-sm min-h-[60px]"
                />
                <Button size="sm" className="self-start" onClick={() => saveNote(id, noteDraft)}>Save</Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-sm">USD Notional</Label>
                <Input value={usdNotional} onChange={(e) => setUsdNotional(e.target.value)} className="bg-neutral-950 border-neutral-800" />
              </div>
              <div>
                <Label className="text-sm">Leverage</Label>
                <Input value={leverage} onChange={(e) => setLeverage(e.target.value)} className="bg-neutral-950 border-neutral-800" />
              </div>
              <div>
                <Label className="text-sm">Order Type</Label>
                <select value={orderType} onChange={(e) => setOrderType(e.target.value as any)} className="w-full h-10 px-3 rounded-md bg-neutral-950 border border-neutral-800 text-sm">
                  <option value="Ioc">Ioc (market fill)</option>
                  <option value="Gtc">Gtc (resting limit)</option>
                  <option value="Alo">Alo (post only)</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button size="sm" className="w-full" variant="secondary" disabled={!hlAsset || !mid} onClick={() => setConfirming(true)}>Preview Order</Button>
              </div>
            </div>

            {confirming && (
              <Card className="bg-neutral-950 border-neutral-800">
                <CardContent className="p-4 space-y-2 text-sm">
                  <p>Place this Hyperliquid order?</p>
                  <ul className="text-neutral-400 space-y-1">
                    <li>Asset: <span className="text-neutral-200">{hlAsset?.coin || asset.symbol}</span> (a={hlAsset?.a})</li>
                    <li>Side: <span className="text-neutral-200">{t.direction === 'long' ? 'Buy' : 'Sell'}</span></li>
                    <li>Size: <span className="text-neutral-200">{roundedSize}</span> @ ~{formatPrice(mid)}</li>
                    <li>Notional: <span className="text-neutral-200">${formatPrice(notional)}</span></li>
                    <li>Leverage: <span className="text-neutral-200">{leverage}x</span></li>
                    <li>Required margin: <span className="text-neutral-200">${formatPrice(required)}</span></li>
                    <li>Available: <span className="text-neutral-200">${formatPrice((account?.withdrawable || 0) + (account?.spotUsdcTotal || 0))}</span></li>
                    <li>Order type: <span className="text-neutral-200">{orderType}</span></li>
                  </ul>
                  {Number(required) > ((account?.withdrawable || 0) + (account?.spotUsdcTotal || 0)) && (
                    <p className="text-red-400">⚠️ Insufficient margin for this order.</p>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="destructive" onClick={() => setConfirming(false)}>Cancel</Button>
                    <Button size="sm" onClick={placeOrder} disabled={placing || Number(required) > ((account?.withdrawable || 0) + (account?.spotUsdcTotal || 0))}>
                      {placing ? 'Placing…' : 'Confirm & Place Order'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {result && (
              <div className="text-xs font-mono text-neutral-300 whitespace-pre-wrap">{result}</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
