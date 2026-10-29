import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { action, apiKey, payload } = req.body || {}
  if (!apiKey) return res.status(400).json({ error: 'apiKey required' })
  if (!action) return res.status(400).json({ error: 'action required' })

  const base = 'https://api.openfinance.tech/agent/trading'
  const headers = { 'x-api-key': apiKey, 'Content-Type': 'application/json' }

  try {
    if (action === 'account') {
      const r = await fetch(`${base}/account`, { headers })
      const txt = await r.text()
      if (!r.ok) return res.status(r.status).json({ error: txt })
      return res.status(200).json(JSON.parse(txt))
    }

    if (action === 'metas') {
      const r = await fetch(`${base}/market/metas`, { headers })
      const txt = await r.text()
      if (!r.ok) return res.status(r.status).json({ error: txt })
      return res.status(200).json(JSON.parse(txt))
    }

    if (action === 'mids') {
      const r = await fetch(`${base}/market/mids`, { headers })
      const txt = await r.text()
      if (!r.ok) return res.status(r.status).json({ error: txt })
      return res.status(200).json(JSON.parse(txt))
    }

    if (action === 'order') {
      const r = await fetch(`${base}/orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })
      const txt = await r.text()
      if (!r.ok) return res.status(r.status).json({ error: txt })
      return res.status(200).json(JSON.parse(txt))
    }

    if (action === 'abstraction') {
      const r = await fetch(`${base}/abstraction`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })
      const txt = await r.text()
      if (!r.ok) return res.status(r.status).json({ error: txt })
      return res.status(200).json(JSON.parse(txt))
    }

    return res.status(400).json({ error: 'unknown action' })
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Hyperliquid request failed' })
  }
}
