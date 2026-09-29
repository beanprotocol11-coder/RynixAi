import { ColorType, CrosshairMode, LineStyle } from 'lightweight-charts'

/* TradingView-inspired palette: near-black with a warm brown/violet cast in dark mode, paper-white in light mode. */
export const CHART_PALETTE = {
  dark: { bg: '#0d0a0e', text: '#a89fb8', grid: 'rgba(210, 170, 150, 0.07)', border: 'rgba(210, 170, 150, 0.14)', cross: 'rgba(200, 180, 255, 0.55)', crossLabel: '#2a1f3a', watermark: 'rgba(200, 180, 255, 0.06)' },
  light: { bg: '#ffffff', text: '#6b6678', grid: 'rgba(20, 16, 32, 0.06)', border: 'rgba(20, 16, 32, 0.12)', cross: 'rgba(90, 70, 160, 0.55)', crossLabel: '#3b2e66', watermark: 'rgba(20, 16, 32, 0.05)' },
}
export const CHART_LONG = '#26a69a'
export const CHART_SHORT = '#ef5350'
export const CHART_LONG_VOL = 'rgba(38,166,154,0.35)'
export const CHART_SHORT_VOL = 'rgba(239,83,80,0.35)'

export function chartOptions(theme: 'dark' | 'light') {
  const p = CHART_PALETTE[theme]
  return {
    layout: { background: { type: ColorType.Solid, color: p.bg }, textColor: p.text, fontFamily: 'Inter, ui-sans-serif, system-ui', attributionLogo: false },
    grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: p.cross, width: 1 as const, style: LineStyle.LargeDashed, labelBackgroundColor: p.crossLabel },
      horzLine: { color: p.cross, width: 1 as const, style: LineStyle.LargeDashed, labelBackgroundColor: p.crossLabel },
    },
    rightPriceScale: { borderColor: p.border },
    timeScale: { borderColor: p.border },
  }
}
