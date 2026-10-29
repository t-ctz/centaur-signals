import type { NextApiRequest, NextApiResponse } from 'next'
import { toISODateUTC } from '@/lib/assets'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { apiKey, keyType = 'centaur', startTime, endTime, cursor, limit = 100 } = req.body || {}
  if (!apiKey) return res.status(400).json({ error: 'apiKey required' })

  const start = startTime || toISODateUTC(new Date(Date.now() - 24 * 60 * 60 * 1000))
  const end = endTime || toISODateUTC(new Date())

  try {
    let rows: any[] = []
    let nextCursor: string | undefined

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
          params: {
            name: 'centaur__list_events',
            arguments: { startTime, endTime, limit, cursor },
          },
        }),
      })
      const txt = await r.text()
      if (!r.ok) return res.status(502).json({ error: txt })
      const rpc = JSON.parse(txt)
      const data = rpc.result?.content?.[0]?.structuredContent || JSON.parse(rpc.result?.content?.[0]?.text || '{}')
      rows = data?.results || data?.data?.results || []
      nextCursor = data?.meta?.nextCursor || data?.nextCursor
    } else {
      const qs = new URLSearchParams({ startTime: start, endTime: end, limit: String(limit) })
      if (cursor) qs.set('cursor', cursor)
      const r = await fetch(`https://api.centaur.io/v2/events?${qs.toString()}`, {
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      })
      const txt = await r.text()
      if (!r.ok) return res.status(502).json({ error: txt })
      const data = JSON.parse(txt)
      rows = data?.data?.results || data?.results || []
      nextCursor = data?.data?.meta?.nextCursor || data?.meta?.nextCursor
    }

    const trades = rows
      .map((r: any) => ({
        id: r.id || r.eventId,
        type: r.type,
        assetId: Number(r.assetId),
        traderId: Number(r.traderId),
        direction: typeof r.direction === 'string' ? r.direction.toLowerCase() : undefined,
        price: Number(r.price),
        quoteSymbol: r.quoteSymbol,
        happenedAt: r.happenedAt || r.createdAt,
        messageId: r.messageId,
      }))
      .filter((r) => r.direction && ['long', 'short'].includes(r.direction))

    res.status(200).json({ trades, nextCursor, startTime: start, endTime: end })
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Trades fetch failed' })
  }
}
