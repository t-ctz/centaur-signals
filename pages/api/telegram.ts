import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { botToken, chatId, text } = req.body || {}
  if (!botToken || !chatId || !text) {
    return res.status(400).json({ error: 'botToken, chatId and text required' })
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`
    const tRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    })
    const json = await tRes.json()
    if (!tRes.ok || !json.ok) {
      return res.status(502).json({ error: json.description || 'Telegram API error' })
    }
    res.status(200).json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Telegram send failed' })
  }
}
