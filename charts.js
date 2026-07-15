/* Rynix AI — Live charts terminal.
   Real-time on-chain OHLCV via GeckoTerminal (CORS-enabled), rendered with
   TradingView lightweight-charts. EMA20/50 + RSI(14) + volume computed client-side. */
(function () {
  'use strict';
  if (typeof LightweightCharts === 'undefined') return;
  var mount = document.getElementById('priceChart');
  if (!mount) return;

  var MARKETS = [
    { sym: 'BTC', label: 'BTC', net: 'eth', pool: '0x56534741cd8b152df6d48adf7ac51f75169a83b2' },
    { sym: 'ETH', label: 'ETH', net: 'eth', pool: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640' },
    { sym: 'SOL', label: 'SOL', net: 'solana', pool: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE' },
    { sym: 'CASHCAT', label: '$CASHCAT', net: 'robinhood', pool: '0xA70fc67C9F69da90B63a0e4C05D229954574E313' }
  ];
  var TIMEFRAMES = [
    { label: '15m', tf: 'minute', agg: 15, perDay: 96 },
    { label: '1H', tf: 'hour', agg: 1, perDay: 24 },
    { label: '4H', tf: 'hour', agg: 4, perDay: 6 },
    { label: '1D', tf: 'day', agg: 1, perDay: 1 }
  ];

  var ACCENT = '#ccff00', UP = '#ccff00', DOWN = '#ff4444';
  var EMA20C = '#7fd4ff', EMA50C = '#ffb347', VOLC = 'rgba(120,140,120,0.45)';

  var state = { market: MARKETS[0], tf: TIMEFRAMES[1], timer: null, precision: 2, minMove: 0.01 };

  // ---- indicators ----
  function ema(vals, span) {
    var k = 2 / (span + 1), out = [], prev = vals.length ? vals[0] : 0;
    for (var i = 0; i < vals.length; i++) { prev = k * vals[i] + (1 - k) * prev; out.push(prev); }
    return out;
  }
  function rsi(closes, period) {
    var out = new Array(closes.length).fill(null);
    if (closes.length <= period) return out;
    var gain = 0, loss = 0, i;
    for (i = 1; i <= period; i++) {
      var d = closes[i] - closes[i - 1];
      if (d >= 0) gain += d; else loss -= d;
    }
    var ag = gain / period, al = loss / period;
    out[period] = 100 - 100 / (1 + ag / (al || 1e-12));
    for (i = period + 1; i < closes.length; i++) {
      var ch = closes[i] - closes[i - 1];
      var g = ch > 0 ? ch : 0, l = ch < 0 ? -ch : 0;
      ag = (ag * (period - 1) + g) / period;
      al = (al * (period - 1) + l) / period;
      out[i] = 100 - 100 / (1 + ag / (al || 1e-12));
    }
    return out;
  }
  function precisionFor(p) {
    if (p >= 100) return { p: 2, m: 0.01 };
    if (p >= 1) return { p: 3, m: 0.001 };
    if (p >= 0.01) return { p: 5, m: 0.00001 };
    return { p: 7, m: 0.0000001 };
  }
  function fmtPrice(p) {
    if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (p >= 1) return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 0.01) return '$' + p.toFixed(5);
    return '$' + p.toFixed(7);
  }

  // ---- charts ----
  var priceChart = LightweightCharts.createChart(mount, chartOpts(mount.clientHeight || 380));
  var candle = priceChart.addCandlestickSeries({
    upColor: UP, downColor: DOWN, wickUpColor: UP, wickDownColor: DOWN,
    borderVisible: false
  });
  var ema20 = priceChart.addLineSeries({ color: EMA20C, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
  var ema50 = priceChart.addLineSeries({ color: EMA50C, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
  var vol = priceChart.addHistogramSeries({
    priceScaleId: '', priceFormat: { type: 'volume' }, color: VOLC
  });
  vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

  var rsiMount = document.getElementById('rsiChart');
  var rsiChart = LightweightCharts.createChart(rsiMount, chartOpts(rsiMount.clientHeight || 120, true));
  var rsiLine = rsiChart.addLineSeries({
    color: ACCENT, lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
    autoscaleInfoProvider: function () { return { priceRange: { minValue: 0, maxValue: 100 } }; }
  });
  [30, 70].forEach(function (lv) {
    rsiLine.createPriceLine({ price: lv, color: '#333', lineWidth: 1, lineStyle: 2, axisLabelVisible: true });
  });

  // sync time axes
  priceChart.timeScale().subscribeVisibleLogicalRangeChange(function (r) {
    if (r) rsiChart.timeScale().setVisibleLogicalRange(r);
  });
  rsiChart.timeScale().subscribeVisibleLogicalRangeChange(function (r) {
    if (r) priceChart.timeScale().setVisibleLogicalRange(r);
  });

  function chartOpts(h, isRsi) {
    return {
      height: h,
      layout: { background: { type: 'solid', color: '#050505' }, textColor: '#888' },
      grid: { vertLines: { color: '#141414' }, horzLines: { color: '#141414' } },
      rightPriceScale: { borderColor: '#262626' },
      timeScale: { borderColor: '#262626', timeVisible: true, secondsVisible: false, visible: !isRsi },
      crosshair: { mode: 0 },
      handleScale: { axisPressedMouseMove: true },
      autoSize: false
    };
  }

  // ---- data ----
  function url(m, tf) {
    return 'https://api.geckoterminal.com/api/v2/networks/' + m.net + '/pools/' + m.pool +
      '/ohlcv/' + tf.tf + '?aggregate=' + tf.agg + '&limit=300&currency=usd&token=base';
  }
  function setStatus(txt, cls) {
    var el = document.getElementById('chartStatusText');
    if (!el) return;
    el.textContent = txt;
    el.className = cls || '';
  }
  function loading(on) {
    var el = document.getElementById('chartLoading');
    if (el) el.hidden = !on;
  }

  function load(showLoader) {
    var m = state.market, tf = state.tf;
    if (showLoader) loading(true);
    setStatus('fetching ' + m.sym + ' · ' + tf.label + ' from on-chain feed…');
    fetch(url(m, tf), { cache: 'no-store' })
      .then(function (r) {
        if (r.status === 429) throw new Error('rate-limited — retrying shortly');
        if (!r.ok) throw new Error('feed HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        var list = d && d.data && d.data.attributes && d.data.attributes.ohlcv_list;
        if (!list || !list.length) throw new Error('no data for this market');
        list = list.slice().reverse(); // oldest -> newest
        render(m, tf, list);
      })
      .catch(function (e) {
        setStatus(e.message || 'feed error', 'cs-err');
      })
      .then(function () { loading(false); });
  }

  function render(m, tf, list) {
    var candles = [], closes = [], vols = [], t;
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      t = row[0];
      var o = +row[1], h = +row[2], l = +row[3], c = +row[4], v = +row[5];
      candles.push({ time: t, open: o, high: h, low: l, close: c });
      closes.push(c);
      vols.push({ time: t, value: v, color: c >= o ? 'rgba(204,255,0,0.30)' : 'rgba(255,68,68,0.30)' });
    }
    var last = closes[closes.length - 1];
    var pr = precisionFor(last);
    candle.applyOptions({ priceFormat: { type: 'price', precision: pr.p, minMove: pr.m } });

    var e20 = ema(closes, 20), e50 = ema(closes, 50), rv = rsi(closes, 14);
    var e20d = [], e50d = [], rd = [], rsiVals = [];
    for (var j = 0; j < candles.length; j++) {
      e20d.push({ time: candles[j].time, value: e20[j] });
      e50d.push({ time: candles[j].time, value: e50[j] });
      // keep index alignment with price chart using whitespace points
      if (rv[j] === null) {
        rd.push({ time: candles[j].time });
      } else {
        rd.push({ time: candles[j].time, value: rv[j] });
        rsiVals.push(rv[j]);
      }
    }
    candle.setData(candles);
    ema20.setData(e20d);
    ema50.setData(e50d);
    vol.setData(vols);
    rsiLine.setData(rd);

    // quote header
    var backIdx = Math.max(0, closes.length - 1 - tf.perDay);
    var ref = closes[backIdx];
    var chg = ref ? (last / ref - 1) * 100 : 0;
    document.getElementById('cqSym').textContent = m.label + '/USD';
    document.getElementById('cqPrice').textContent = fmtPrice(last);
    var chgEl = document.getElementById('cqChg');
    chgEl.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '% · 24h';
    chgEl.className = 'cq-chg ' + (chg >= 0 ? 'up' : 'down');
    var rsiNow = rd.length ? rd[rd.length - 1].value : null;
    document.getElementById('cqMeta').textContent =
      (rsiNow !== null ? 'RSI ' + rsiNow.toFixed(0) + ' · ' : '') +
      (last > e20[e20.length - 1] ? 'above EMA20' : 'below EMA20');

    var now = new Date();
    setStatus('live · ' + m.sym + ' ' + tf.label + ' · ' + candles.length +
      ' candles · updated ' + now.toLocaleTimeString() + ' · source: GeckoTerminal', 'cs-ok');
  }

  // ---- controls ----
  function buildTabs() {
    var tabs = document.getElementById('chartTabs');
    MARKETS.forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = m.label;
      if (m === state.market) b.className = 'active';
      b.addEventListener('click', function () {
        state.market = m;
        setActive(tabs, b);
        load(true);
      });
      tabs.appendChild(b);
    });
    var tfWrap = document.getElementById('chartTf');
    TIMEFRAMES.forEach(function (tf) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = tf.label;
      if (tf === state.tf) b.className = 'active';
      b.addEventListener('click', function () {
        state.tf = tf;
        setActive(tfWrap, b);
        load(true);
      });
      tfWrap.appendChild(b);
    });
  }
  function setActive(wrap, btn) {
    Array.prototype.forEach.call(wrap.children, function (c) { c.className = ''; });
    btn.className = 'active';
  }

  function resize() {
    priceChart.applyOptions({ width: mount.clientWidth });
    rsiChart.applyOptions({ width: rsiMount.clientWidth });
  }
  window.addEventListener('resize', resize);

  // ---- lifecycle: only poll while section is on screen ----
  buildTabs();
  resize();
  var started = false;
  function start() {
    if (started) return;
    started = true;
    load(true);
    state.timer = setInterval(function () { load(false); }, 45000);
  }
  var section = document.getElementById('charts');
  if ('IntersectionObserver' in window && section) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          start();
          if (!state.timer) state.timer = setInterval(function () { load(false); }, 45000);
        } else if (state.timer) {
          clearInterval(state.timer);
          state.timer = null;
        }
      });
    }, { threshold: 0.15 });
    io.observe(section);
  } else {
    start();
  }
})();
