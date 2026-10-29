import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 flex flex-col items-center justify-center gap-6">
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-bold">Centaur Signals</h1>
        <p className="text-neutral-400 max-w-md mx-auto">
          Browse live trader-intelligence signals from Centaur, or configure a Telegram bot to push them to your chat.
        </p>
      </div>
      <div className="flex flex-wrap gap-4 justify-center">
        <Link href="/signals">
          <Button size="lg">📊 View Signals</Button>
        </Link>
        <Link href="/feed">
          <Button size="lg" variant="outline">📜 Today's Trades</Button>
        </Link>
        <Link href="/bot">
          <Button size="lg" variant="secondary">🤖 Telegram Bot</Button>
        </Link>
      </div>
    </div>
  )
}
