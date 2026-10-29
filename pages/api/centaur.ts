import type { NextApiRequest, NextApiResponse } from 'next'

const endpoints: Record<string, string> = {
  trending: '/trending?windowDays=1&limit=20',
  specialists: '/specialist-ideas?minEvaluations=5&minWinRatePercent=60&minSpecialists=2&limit=20',
  early: '/early-opportunities?windowDays=7&minTraders=2&maxTraders=5&movementThresholdPercent=10&limit=20',
  crowdFade: '/crowd-fade?minAbsNet=7&limit=20',
  smartMoney: '/smart-money?minEvaluations=5&minWinRatePercent=60&minLeaderEvaluations=10&limit=20',
  leadersBook: '/leaders-book',
}

async function fetchWithKeyType(path: string, apiKey: string, keyType: string) {
  if (keyType === 'openfinance') {
    const r = await fetch('https://api.openfinance.tech/agent/mcp', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: `centaur__${path}`, arguments: {} },
      }),
    })
    const txt = await r.text()
    if (!r.ok) return { error: txt, status: r.status }
    try {
      const rpc = JSON.parse(txt)
      const data = rpc.result?.content?.[0]?.structuredContent || JSON.parse(rpc.result?.content?.[0]?.text || '{}')
      return { data }
    } catch {
      return { error: 'Invalid MCP response', status: 500 }
    }
  }

  const r = await fetch(`https://api.centaur.io/v2/signals${path}`, {
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
  })
  const txt = await r.text()
  if (!r.ok) return { error: txt, status: r.status }
  try {
    return { data: JSON.parse(txt) }
  } catch {
    return { error: 'Invalid JSON', status: 500 }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { signals, apiKey, keyType = 'centaur' } = req.body || {}
  if (!apiKey || !signals || !Array.isArray(signals)) {
    return res.status(400).json({ error: 'apiKey and signals[] required' })
  }

  try {
    const results: any[] = []

    for (const signal of signals) {
      const path = endpoints[signal]
      if (!path) continue
      const result = await fetchWithKeyType(path, apiKey, keyType)
      if (result.error) {
        results.push({ type: signal, error: result.error, status: result.status })
      } else {
        results.push({ type: signal, data: result.data })
      }
    }

    const flat = results.flatMap(({ type, data, error }) => {
      if (error) return []
      const payload = data?.data || data
      if (type === 'leadersBook') {
        return (payload?.confluences || []).map((r: any) => normalize(type, r)).filter(Boolean)
      }
      return (payload?.results || []).map((r: any) => normalize(type, r)).filter(Boolean)
    })

    res.status(200).json({ signals: flat, raw: results })
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Centaur error' })
  }
}

function normalize(type: string, r: any) {
  if (!r || typeof r !== 'object') return null
  const dir = typeof r.direction === 'string' ? r.direction.toLowerCase() : undefined
  if (!dir || !['long', 'short'].includes(dir)) return null
  return {
    type,
    assetId: Number(r.assetId) || 0,
    direction: dir,
    traderCount: Number(r.traderCount) || 0,
    positionCount: Number(r.positionCount) || 0,
    averageEntry: Number(r.averageEntry) || 0,
    currentPrice: Number(r.currentPrice) || 0,
    openReturnPercent: Number(r.openReturnPercent) || 0,
    delta: r.delta == null ? undefined : Number(r.delta),
    countBefore: r.countBefore == null ? undefined : Number(r.countBefore),
    netNow: r.netNow == null ? undefined : Number(r.netNow),
    netBefore: r.netBefore == null ? undefined : Number(r.netBefore),
    winRatePercent: r.winRatePercent == null ? undefined : Number(r.winRatePercent),
    specialists: Array.isArray(r.specialists) ? r.specialists : undefined,
    calculationAt: r.calculationAt,
  }
}
