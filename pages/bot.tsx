import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { signalLabels, getAsset, formatPrice, formatPct, type AssetCache } from '@/lib/assets'
import type { Signal } from '@/lib/types'

const signalTypes = Object.entries(signalLabels).map(([key, label]) => ({ key, label }))

export default function BotPage() {
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [centaurKey, setCentaurKey] = useState('')
  const [keyType, setKeyType] = useState<'centaur' | 'openfinance'>('centaur')
  const [enabled, setEnabled] = useState(false)
  const [intervalMin, setIntervalMin] = useState('5')
  const [selectedSignals, setSelectedSignals] = useState<string[]>(['trending', 'specialists'])
  const [logs, setLogs] = useState<string[]>([])
  const [lastSignals, setLastSignals] = useState<Signal[]>([])
  const [assetCache, setAssetCache] = useState<AssetCache>({})
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const seenRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    setBotToken(localStorage.getItem('telegramBotToken') || '')
    setChatId(localStorage.getItem('telegramChatId') || '')
    setCentaurKey(localStorage.getItem('centaurApiKey') || '')
    setKeyType((localStorage.getItem('centaurKeyType') as any) || 'centaur')
  }, [])

  useEffect(() => {
    localStorage.setItem('telegramBotToken', botToken)
    localStorage.setItem('telegramChatId', chatId)
    localStorage.setItem('centaurApiKey', centaurKey)
    localStorage.setItem('centaurKeyType', keyType)
  }, [botToken, chatId, centaurKey, keyType])

  const log = (msg: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 200))
  }

  const enrichAssets = async (signals: Signal[]) => {
    const missing = signals.map((s) => s.assetId).filter((id) => !assetCache[id] && getAsset(id).symbol.startsWith('#'))
    const needed = [...new Set(missing)]
    if (needed.length === 0) return
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: needed, apiKey: centaurKey, keyType }),
      })
      const json = await res.json()
      if (res.ok && json.assets) {
        setAssetCache((prev) => ({ ...prev, ...json.assets }))
      }
    } catch {}
  }

  const fetchAndNotify = async () => {
    if (!botToken || !chatId || !centaurKey) {
      log('Missing bot token, chat ID, or Centaur key.')
      setEnabled(false)
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/centaur', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signals: selectedSignals, apiKey: centaurKey, keyType }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Centaur fetch failed')

      const fresh: Signal[] = json.signals || []
      await enrichAssets(fresh)
      const unsent = fresh.filter((s) => {
        const key = `${s.type}-${s.assetId}-${s.direction}-${s.traderCount}-${s.delta}-${Math.round(s.openReturnPercent * 100)}`
        if (seenRef.current.has(key)) return false
        seenRef.current.add(key)
        return true
      })

      if (unsent.length === 0) {
        log('Polled Centaur — no new signals.')
      } else {
        log(`Polled Centaur — ${unsent.length} new signal(s).`)
        for (const s of unsent) {
          const text = formatSignal(s, assetCache)
          const tRes = await fetch('/api/telegram', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ botToken, chatId, text }),
          })
          const tJson = await tRes.json()
          if (!tRes.ok) throw new Error(tJson.error || 'Telegram send failed')
          s.sentAt = new Date().toISOString()
          log(`Sent ${s.type} signal for ${getAsset(s.assetId, assetCache).symbol}`)
        }
        setLastSignals((prev) => [...unsent, ...prev].slice(0, 50))
      }
    } catch (e: any) {
      log(`Error: ${e.message}`)
      setEnabled(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (enabled) {
      fetchAndNotify()
      timerRef.current = setInterval(fetchAndNotify, Math.max(1, Number(intervalMin)) * 60 * 1000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMin, selectedSignals, botToken, chatId, centaurKey, keyType])

  const toggleSignal = (key: string) => {
    setSelectedSignals((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Centaur → Telegram Bot</h1>
            <p className="text-neutral-400">Poll signals and push them to Telegram.</p>
          </div>
          <Link href="/signals">
            <Button variant="outline">← Signals</Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-neutral-900 border-neutral-800">
            <CardHeader>
              <CardTitle>Credentials</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>Telegram Bot Token</Label>
                <Input type="password" value={botToken} onChange={(e) => setBotToken(e.target.value)} placeholder="123456:ABC-DEF..." className="bg-neutral-950 border-neutral-800" />
              </div>
              <div className="space-y-1">
                <Label>Telegram Chat ID</Label>
                <Input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="@channelname or -100123..." className="bg-neutral-950 border-neutral-800" />
              </div>
              <div className="space-y-1">
                <Label>API Key</Label>
                <Input type="password" value={centaurKey} onChange={(e) => setCentaurKey(e.target.value)} placeholder="open_... or centaur_..." className="bg-neutral-950 border-neutral-800" />
              </div>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="keyType" checked={keyType === 'centaur'} onChange={() => setKeyType('centaur')} />
                  Centaur key
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="keyType" checked={keyType === 'openfinance'} onChange={() => setKeyType('openfinance')} />
                  OpenFinance key
                </label>
              </div>
              <p className="text-xs text-neutral-500">Stored only in browser localStorage.</p>
            </CardContent>
          </Card>

          <Card className="bg-neutral-900 border-neutral-800">
            <CardHeader>
              <CardTitle>Signal Sources</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {signalTypes.map((s) => (
                  <label key={s.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={selectedSignals.includes(s.key)} onChange={() => toggleSignal(s.key)} className="accent-emerald-500" />
                    {s.label}
                  </label>
                ))}
              </div>
              <div className="space-y-1">
                <Label>Poll Interval</Label>
                <Select value={intervalMin} onValueChange={setIntervalMin}>
                  <SelectTrigger className="bg-neutral-950 border-neutral-800"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-neutral-900 border-neutral-800">
                    {['1', '5', '15', '30', '60'].map((m) => (
                      <SelectItem key={m} value={m}>{m} minute{m !== '1' ? 's' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Switch checked={enabled} onCheckedChange={setEnabled} id="bot-toggle" />
                <Label htmlFor="bot-toggle" className="cursor-pointer">{enabled ? 'Bot running' : 'Bot paused'}</Label>
                {loading && <Badge variant="outline" className="ml-auto">polling…</Badge>}
              </div>
              <Button variant="secondary" className="w-full" disabled={!botToken || !chatId || !centaurKey || loading} onClick={fetchAndNotify}>
                Send test signal now
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader><CardTitle>Recent Signals</CardTitle></CardHeader>
          <CardContent>
            {lastSignals.length === 0 ? (
              <p className="text-neutral-500 text-sm">No signals sent yet.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-auto">
                {lastSignals.map((s, i) => <SignalRow key={i} s={s} cache={assetCache} />)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader><CardTitle>Logs</CardTitle></CardHeader>
          <CardContent>
            <Textarea readOnly value={logs.join('\n')} className="h-48 bg-neutral-950 border-neutral-800 font-mono text-xs resize-none" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function SignalRow({ s, cache }: { s: Signal; cache: AssetCache }) {
  const asset = getAsset(s.assetId, cache)
  return (
    <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{asset.name} <span className="text-neutral-500">({asset.symbol})</span></span>
        <Badge variant={s.direction === 'long' ? 'default' : 'destructive'}>{(s.direction || '?').toUpperCase()}</Badge>
      </div>
      <div className="text-neutral-400 mt-1">
        {signalLabels[s.type] || s.type} • traders {s.traderCount} • return {formatPct(s.openReturnPercent)}
      </div>
      {s.sentAt && <div className="text-xs text-neutral-600 mt-1">sent {new Date(s.sentAt).toLocaleTimeString()}</div>}
    </div>
  )
}

function formatSignal(s: Signal, cache: AssetCache): string {
  const asset = getAsset(s.assetId, cache)
  const emoji = s.direction === 'long' ? '🟢' : '🔴'
  const returnEmoji = s.openReturnPercent >= 0 ? '📈' : '📉'
  let text = `${emoji} *${asset.name} (${asset.symbol}) ${(s.direction || '?').toUpperCase()}*\n`
  text += `Source: ${signalLabels[s.type] || s.type}\n`
  text += `Traders: ${s.traderCount} • Positions: ${s.positionCount}\n`
  text += `Avg entry: $${formatPrice(s.averageEntry)}\n`
  text += `Current: $${formatPrice(s.currentPrice)}\n`
  text += `${returnEmoji} Open return: ${formatPct(s.openReturnPercent)}\n`
  if (s.delta) text += `Net-count delta: +${s.delta}\n`
  if (s.winRatePercent) text += `Specialist win rate: ${s.winRatePercent}%\n`
  if (s.specialists?.length) {
    text += `Top specialists: ${s.specialists.map((sp) => `#${sp.traderId} (${sp.winRatePercent}%)`).join(', ')}\n`
  }
  text += `\n_Powered by Centaur / OpenFinance_`
  return text
}
