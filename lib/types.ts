export interface Signal {
  type: string
  assetId: number
  direction: 'long' | 'short'
  traderCount: number
  positionCount: number
  averageEntry: number
  currentPrice: number
  openReturnPercent: number
  delta?: number
  countBefore?: number
  netNow?: number
  netBefore?: number
  winRatePercent?: number
  specialists?: { traderId: number; winRatePercent: number }[]
  calculationAt?: string
  sentAt?: string
}

export interface Trade {
  id?: string
  type: 'open' | 'close' | 'increase' | 'decrease'
  assetId: number
  traderId: number
  direction: 'long' | 'short'
  price: number
  quoteSymbol?: string
  happenedAt?: string
  messageId?: string
}
