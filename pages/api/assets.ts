import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { ids, apiKey, keyType = 'centaur' } = req.body || {}
  if (!apiKey || !Array.isArray(ids)) return res.status(400).json({ error: 'apiKey and ids[] required' })

  try {
    const unique = [...new Set(ids)].filter((id) => typeof id === 'number')
    if (unique.length === 0) return res.status(200).json({ assets: {} })

    let rows: any[] = []

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
          params: { name: 'centaur__list_assets', arguments: { assetIds: unique, assetClass: '' } },
        }),
      })
      const txt = await r.text()
      if (!r.ok) return res.status(502).json({ error: txt })
      const rpc = JSON.parse(txt)
      const data = rpc.result?.content?.[0]?.structuredContent || JSON.parse(rpc.result?.content?.[0]?.text || '{}')
      rows = data?.results || data?.data || []
    } else {
      const r = await fetch(`https://api.centaur.io/v2/assets?ids=${unique.join(',')}`, {
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      })
      const txt = await r.text()
      if (!r.ok) return res.status(502).json({ error: txt })
      const data = JSON.parse(txt)
      rows = data?.data?.results || data?.data || []
    }

    const map: Record<number, { name: string; symbol: string }> = {}
    for (const row of rows) {
      const id = Number(row.id ?? row.assetId)
      if (!id) continue
      map[id] = {
        name: row.name || row.displayName || `Asset #${id}`,
        symbol: row.symbol || row.ticker || `#${id}`,
      }
    }

    res.status(200).json({ assets: map })
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Asset lookup failed' })
  }
}
