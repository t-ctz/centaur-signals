import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { signalLabels, getAsset, formatPrice, formatPct, type AssetCache } from '@/lib/assets'
import type { Signal } from '@/lib/types'

const signalTypes = Object.entries(signalLabels).map(([key, label]) => ({ key, label }))

export default function SignalsPage() {
  const [apiKey, setApiKey] = useState('')
  const [keyType, setKeyType] = useState<'centaur' | 'openfinance'>('centaur')
  const [signals, setSignals] = useState<Signal[]>([])
  const [assetCache, setAssetCache] = useState<AssetCache>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [raw, setRaw] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    setApiKey(localStorage.getItem('centaurApiKey') || '')
    setKeyType((localStorage.getItem('centaurKeyType') as any) || 'centaur')
  }, [])

  useEffect(() => {
    localStorage.setItem('centaurApiKey', apiKey)
    localStorage.setItem('centaurKeyType', keyType)
  }, [apiKey, keyType])

  const load = async () => {
    if (!apiKey) return setError('Paste your API key first.')
    setLoading(true)
    setError('')
    setRaw([])
    try {
      const res = await fetch('/api/centaur', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signals: signalTypes.map((s) => s.key), apiKey, keyType }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to fetch')
      const fetched: Signal[] = json.signals || []
      setSignals(fetched)
      setRaw(json.raw || [])

      const ids = [...new Set(fetched.map((s) => s.assetId))].filter((id) => !assetCache[id])
      if (ids.length > 0) {
        const aRes = await fetch('/api/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, apiKey, keyType }),
        })
        const aJson = await aRes.json()
        if (aRes.ok && aJson.assets) {
          setAssetCache((prev) => ({ ...prev, ...aJson.assets }))
        }
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const filtered = signals.filter((s) => {
    const asset = getAsset(s.assetId, assetCache)
    const matchesTab = activeTab === 'all' || s.type === activeTab
    const q = search.toLowerCase()
    const matchesSearch = !q || asset.name.toLowerCase().includes(q) || asset.symbol.toLowerCase().includes(q) || s.type.includes(q)
    return matchesTab && matchesSearch
  })

  const grouped = filtered.reduce((acc, s) => {
    acc[s.type] = acc[s.type] || []
    acc[s.type].push(s)
    return acc
  }, {} as Record<string, Signal[]>)

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Live Centaur Signals</h1>
            <p className="text-neutral-400">Browse trader-intelligence signals across all sources.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/feed">
              <Button variant="outline">📜 Trades</Button>
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
                <Button className="w-full" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Load Signals'}</Button>
              </div>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            {raw.length > 0 && (
              <div className="text-xs text-neutral-500 space-y-1">
                {raw.map((r: any, i) => (
                  <div key={i}>
                    {r.type}: {r.error ? <span className="text-red-400">HTTP {r.status} — {r.error.slice(0, 120)}</span> : <span className="text-emerald-400">ok</span>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-neutral-900 border border-neutral-800 flex-wrap h-auto py-1">
              <TabsTrigger value="all">All</TabsTrigger>
              {signalTypes.map((s) => (
                <TabsTrigger key={s.key} value={s.key}>{s.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search asset / symbol…" className="w-full md:w-64 bg-neutral-950 border-neutral-800" />
        </div>

        {signals.length === 0 && !loading && !error && (
          <p className="text-neutral-500 text-center py-12">Load signals to see them here.</p>
        )}

        {activeTab === 'all' ? (
          signalTypes.map(({ key, label }) => {
            const group = grouped[key] || []
            if (group.length === 0) return null
            return (
              <div key={key}>
                <h2 className="text-xl font-semibold mb-3">{label}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.map((s, i) => <SignalCard key={`${key}-${i}`} s={s} cache={assetCache} />)}
                </div>
              </div>
            )
          })
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((s, i) => <SignalCard key={`${activeTab}-${i}`} s={s} cache={assetCache} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function SignalCard({ s, cache }: { s: Signal; cache: AssetCache }) {
  const asset = getAsset(s.assetId, cache)
  const positive = s.openReturnPercent >= 0
  const dirLabel = (s.direction || '?').toUpperCase()
  return (
    <Card className="bg-neutral-900 border-neutral-800 hover:border-neutral-700 transition">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{asset.name}</CardTitle>
            <p className="text-sm text-neutral-500">{asset.symbol} • Asset #{s.assetId}</p>
          </div>
          <Badge variant={s.direction === 'long' ? 'default' : s.direction === 'short' ? 'destructive' : 'outline'}>{dirLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-400">Source</span>
          <span>{signalLabels[s.type] || s.type}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-400">Traders / Positions</span>
          <span>{s.traderCount} / {s.positionCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-400">Avg Entry</span>
          <span>${formatPrice(s.averageEntry)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-400">Current Price</span>
          <span>${formatPrice(s.currentPrice)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-neutral-400">Open Return</span>
          <span className={positive ? 'text-emerald-400' : 'text-red-400'}>{formatPct(s.openReturnPercent)}</span>
        </div>
        {s.delta !== undefined && (
          <div className="flex justify-between">
            <span className="text-neutral-400">Net-count delta</span>
            <span>+{s.delta}</span>
          </div>
        )}
        {s.winRatePercent && (
          <div className="flex justify-between">
            <span className="text-neutral-400">Specialist Win Rate</span>
            <span>{s.winRatePercent}%</span>
          </div>
        )}
        {s.specialists && s.specialists.length > 0 && (
          <div className="pt-2 border-t border-neutral-800">
            <p className="text-xs text-neutral-500 mb-1">Specialists</p>
            <div className="flex flex-wrap gap-1">
              {s.specialists.map((sp, i) => (
                <Badge key={i} variant="outline" className="text-xs">#{sp.traderId} {sp.winRatePercent}%</Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
