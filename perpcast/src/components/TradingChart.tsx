import { useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries, HistogramSeries, LineStyle, type IChartApi, type ISeriesApi, type IPriceLine, type UTCTimestamp } from 'lightweight-charts'
import { fetchCandles, subscribeCandle, INTERVALS, type Interval, type Candle } from '../lib/hyperliquid'
import { useUI } from '../store/ui'
import type { Position } from '../store/trading'
import { cx, px } from '../lib/format'
import { Spinner } from './ui'
import { CHART_PALETTE as PALETTE, CHART_LONG as LONG, CHART_SHORT as SHORT, CHART_LONG_VOL as LONG_VOL, CHART_SHORT_VOL as SHORT_VOL, chartOptions } from '../lib/chartTheme'

export function TradingChart({ coin, szDecimals, positions, className }: { coin: string; szDecimals: number; positions: Position[]; className?: string }) {
  const [interval, setInterval_] = useState<Interval>(() => (localStorage.getItem('perpcast:interval') as Interval) || '15m')
  const theme = useUI((s) => s.theme)
  const box = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const candles = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volume = useRef<ISeriesApi<'Histogram'> | null>(null)
  const lines = useRef<IPriceLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hover, setHover] = useState<Candle | null>(null)
  const last = useRef<Candle | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const base = chartOptions(theme)
    const c = createChart(el, {
      autoSize: true,
      ...base,
      rightPriceScale: { ...base.rightPriceScale, scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: { ...base.timeScale, timeVisible: true, secondsVisible: false, rightOffset: 4 },
      localization: { priceFormatter: (p: number) => px(p, szDecimals) },
    })
    const cs = c.addSeries(CandlestickSeries, { upColor: LONG, downColor: SHORT, wickUpColor: LONG, wickDownColor: SHORT, borderVisible: false, priceFormat: { type: 'price', precision: pricePrecision(szDecimals), minMove: 1 / 10 ** pricePrecision(szDecimals) } })
    const vs = c.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false })
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    chart.current = c
    candles.current = cs
    volume.current = vs
    c.subscribeCrosshairMove((p) => {
      if (!p.time || !p.seriesData.size) {
        setHover(null)
        return
      }
      const d = p.seriesData.get(cs) as { open: number; high: number; low: number; close: number } | undefined
      const v = p.seriesData.get(vs) as { value: number } | undefined
      if (d) setHover({ time: p.time as number, open: d.open, high: d.high, low: d.low, close: d.close, volume: v?.value ?? 0 })
    })
    return () => {
      c.remove()
      chart.current = null
      candles.current = null
      volume.current = null
      lines.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coin, szDecimals])

  useEffect(() => {
    chart.current?.applyOptions(chartOptions(theme))
  }, [theme])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    last.current = null
    fetchCandles(coin, interval, 400)
      .then((data) => {
        if (!alive || !candles.current || !volume.current) return
        candles.current.setData(data.map((d) => ({ time: d.time as UTCTimestamp, open: d.open, high: d.high, low: d.low, close: d.close })))
        volume.current.setData(data.map((d) => ({ time: d.time as UTCTimestamp, value: d.volume, color: d.close >= d.open ? LONG_VOL : SHORT_VOL })))
        last.current = data[data.length - 1] ?? null
        chart.current?.timeScale().scrollToRealTime()
        setLoading(false)
      })
      .catch((e: Error) => {
        if (!alive) return
        setError(e.message)
        setLoading(false)
      })
    const unsub = subscribeCandle(coin, interval, (c) => {
      if (!candles.current || !volume.current) return
      if (last.current && c.time < last.current.time) return
      candles.current.update({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })
      volume.current.update({ time: c.time as UTCTimestamp, value: c.volume, color: c.close >= c.open ? LONG_VOL : SHORT_VOL })
      last.current = c
    })
    return () => {
      alive = false
      unsub()
    }
  }, [coin, interval])

  useEffect(() => {
    const cs = candles.current
    if (!cs) return
    lines.current.forEach((l) => cs.removePriceLine(l))
    lines.current = []
    positions
      .filter((p) => p.coin === coin)
      .forEach((p) => {
        const color = p.side === 'long' ? LONG : SHORT
        lines.current.push(cs.createPriceLine({ price: p.entry, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `${p.side === 'long' ? 'Long' : 'Short'} ${p.leverage.toFixed(0)}x` }))
        lines.current.push(cs.createPriceLine({ price: p.liq, color: '#f59e0b', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'Liq' }))
        if (p.tp) lines.current.push(cs.createPriceLine({ price: p.tp, color: LONG, lineWidth: 1, lineStyle: LineStyle.SparseDotted, axisLabelVisible: true, title: 'TP' }))
        if (p.sl) lines.current.push(cs.createPriceLine({ price: p.sl, color: SHORT, lineWidth: 1, lineStyle: LineStyle.SparseDotted, axisLabelVisible: true, title: 'SL' }))
      })
  }, [positions, coin, loading])

  const pickInterval = (i: Interval) => {
    setInterval_(i)
    localStorage.setItem('perpcast:interval', i)
  }

  const shown = hover ?? last.current
  const up = shown ? shown.close >= shown.open : true

  return (
    <div className={cx('relative flex flex-col', className)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
        <div className="segment !p-0.5">
          {INTERVALS.map((i) => (
            <button key={i} className="!px-2.5 !py-1 text-xs" onClick={() => pickInterval(i)} data-active={interval === i}>
              {i}
            </button>
          ))}
        </div>
        {shown && (
          <div className={cx('mono ml-auto hidden items-center gap-3 text-[11px] sm:flex', up ? 'text-long' : 'text-short')}>
            <span>
              <span className="text-ink-3">O </span>
              {px(shown.open, szDecimals)}
            </span>
            <span>
              <span className="text-ink-3">H </span>
              {px(shown.high, szDecimals)}
            </span>
            <span>
              <span className="text-ink-3">L </span>
              {px(shown.low, szDecimals)}
            </span>
            <span>
              <span className="text-ink-3">C </span>
              {px(shown.close, szDecimals)}
            </span>
            <span className="text-ink-3">Vol {Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(shown.volume)}</span>
          </div>
        )}
      </div>
      <div className="relative min-h-[280px] flex-1" style={{ background: PALETTE[theme].bg }}>
        <div ref={box} className="absolute inset-0" />
        <div className="pointer-events-none absolute left-3 top-2 z-10 select-none font-display text-2xl font-extrabold tracking-tight" style={{ color: PALETTE[theme].watermark }}>
          {coin.replace(/^xyz:/, '')} · Perpcast
        </div>
      </div>
      {loading && (
        <div className="absolute inset-x-0 bottom-0 top-10 flex items-center justify-center bg-bg/40">
          <Spinner />
        </div>
      )}
      {error && !loading && <div className="absolute inset-x-0 bottom-0 top-10 flex items-center justify-center text-sm text-ink-3">Chart unavailable: {error}</div>}
    </div>
  )
}

function pricePrecision(szDecimals: number) {
  return Math.max(1, Math.min(6, 6 - szDecimals))
}
