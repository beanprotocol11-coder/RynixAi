(function () {
  'use strict';
  const chatbotWindow = document.getElementById('chatbotWindow');
  const chatbotMessages = document.getElementById('chatbotMessages');
  const chatbotForm = document.getElementById('chatbotForm');
  const chatbotInput = document.getElementById('chatbotInput');
  const chatLauncher = document.getElementById('chatLauncher');
  const chatbotClose = document.getElementById('chatbotClose');
  const featureBadges = document.querySelectorAll('.feature-badge');

  const priceMap = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', HYPE: 'hyperliquid' };
  const fallbackPrices = {
    BTC: { base: 94500, change: 2.4 },
    ETH: { base: 3450, change: -1.2 },
    SOL: { base: 180, change: 0.8 },
    HYPE: { base: 20, change: 5.1 }
  };
  let prices = JSON.parse(JSON.stringify(fallbackPrices));
  let lastFetchTime = 0;
  const tokens = Object.keys(prices);
  let openPositions = 2;
  let tradesThisMonth = 0;
  let analysisRuns = 1348;
  let activeAutomations = 3;
  let uniqueAssets = 4;
  let totalJobs = 308;
  let totalTrades = 47569;
  let connectedWallets = 265;
  let currentContext = '';
  let typingIndicator = null;

  // i18n is loaded from chatbot-locales.js before this script
  const i18nGlobal = (typeof i18n !== 'undefined') ? i18n : { en: { strings: {}, intents: {} } };

  function formatString(str, vars) {
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
  }

  function t(lang, key, vars) {
    const loc = i18nGlobal[lang] || i18nGlobal.en;
    const s = loc.strings[key] || i18nGlobal.en.strings[key] || key;
    return formatString(s, vars);
  }

  function normalizeLang(lang) {
    if (!lang) return 'en';
    const code = String(lang).split('-')[0].toLowerCase();
    return i18nGlobal[code] ? code : 'en';
  }

  function hasWord(text, word) {
    if (!word) return false;
    const w = word.toLowerCase();
    if (/[^\x00-\x7F]/.test(w)) return text.indexOf(w) !== -1;
    const spaced = ' ' + text.replace(/[^a-z0-9]+/g, ' ') + ' ';
    return spaced.indexOf(' ' + w + ' ') !== -1;
  }

  function detectLanguage(text) {
    const lower = text.toLowerCase().replace(/&/g, ' and ');
    // Score Indonesian-specific words higher than universal English intent words
    let idScore = 0;
    const idDetect = i18nGlobal.id && i18nGlobal.id.detect;
    if (idDetect && Array.isArray(idDetect)) {
      for (let i = 0; i < idDetect.length; i++) {
        if (hasWord(lower, idDetect[i])) idScore += 3;
      }
    }
    const idIntents = i18nGlobal.id && i18nGlobal.id.intents;
    if (idIntents) {
      for (const key in idIntents) {
        if (!Array.isArray(idIntents[key])) continue;
        for (let i = 0; i < idIntents[key].length; i++) {
          if (hasWord(lower, idIntents[key][i])) idScore++;
        }
      }
    }
    let enScore = 0;
    const enIntents = i18nGlobal.en && i18nGlobal.en.intents;
    if (enIntents) {
      for (const key in enIntents) {
        if (!Array.isArray(enIntents[key])) continue;
        for (let i = 0; i < enIntents[key].length; i++) {
          if (hasWord(lower, enIntents[key][i])) enScore++;
        }
      }
    }
    if (idScore > enScore) return 'id';
    if (enScore > idScore) return 'en';
    return memory.lang || normalizeLang(navigator.language) || 'en';
  }

  function hasIntent(lang, key, text) {
    const lower = text.toLowerCase().replace(/&/g, ' and ');
    const words = [];
    if (i18nGlobal[lang] && i18nGlobal[lang].intents && i18nGlobal[lang].intents[key]) {
      for (let i = 0; i < i18nGlobal[lang].intents[key].length; i++) words.push(i18nGlobal[lang].intents[key][i]);
    }
    if (i18nGlobal.en && i18nGlobal.en.intents && i18nGlobal.en.intents[key]) {
      for (let i = 0; i < i18nGlobal.en.intents[key].length; i++) words.push(i18nGlobal.en.intents[key][i]);
    }
    for (let i = 0; i < words.length; i++) {
      if (hasWord(lower, words[i])) return true;
    }
    return false;
  }

  // Memory using localStorage
  function loadMemory() {
    const defaults = {
      lang: '',
      lastSymbol: '',
      lastTopic: '',
      lastSide: '',
      lastPrice: 0,
      lastChange: 0,
      lastQty: 0.1,
      chatHistory: []
    };
    try {
      const raw = localStorage.getItem('rynixMemory');
      if (raw) return Object.assign(defaults, JSON.parse(raw));
    } catch (e) { console.warn('Memory parse error', e); }
    return defaults;
  }

  function persistMemory() {
    try {
      localStorage.setItem('rynixMemory', JSON.stringify(memory));
    } catch (e) { console.warn('Memory persist error', e); }
  }

  const memory = loadMemory();
  let isRestoring = false;

  function pushHistory(text, sender) {
    memory.chatHistory.push({ text: text, sender: sender, ts: Date.now() });
    if (memory.chatHistory.length > 50) memory.chatHistory.shift();
    if (!isRestoring) persistMemory();
  }

  function renderMessage(text, sender) {
    const div = document.createElement('div');
    div.className = 'chatbot-message ' + sender;
    div.textContent = text;
    chatbotMessages.appendChild(div);
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
  }

  function addMessage(text, sender) {
    renderMessage(text, sender);
    if (!isRestoring) pushHistory(text, sender);
  }

  function addBotMessage(text, delay) {
    if (typingIndicator) {
      typingIndicator.remove();
      typingIndicator = null;
    }
    delay = delay || 600;
    typingIndicator = document.createElement('div');
    typingIndicator.className = 'chatbot-typing';
    typingIndicator.innerHTML = '<span></span><span></span><span></span>';
    chatbotMessages.appendChild(typingIndicator);
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
    setTimeout(function () {
      if (typingIndicator) {
        typingIndicator.remove();
        typingIndicator = null;
      }
      addMessage(text, 'bot');
    }, delay);
  }

  function getPrice(symbol) {
    const ticker = symbol.toUpperCase();
    const data = prices[ticker];
    if (!data) return null;
    const variation = (Math.random() - 0.5) * 0.0008;
    const price = data.base * (1 + variation);
    const change = data.change.toFixed(2);
    return { price: price, change: parseFloat(change), symbol: ticker };
  }

  function formatPrice(n) {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatNumber(n) {
    return n.toLocaleString('en-US');
  }

  function getSymbolFromText(text) {
    const clean = text.replace(/[$,]/g, ' ').toUpperCase();
    const aliases = {
      BTC: [/\bBTC\b/, /\bBITCOIN\b/, /\bXBT\b/],
      ETH: [/\bETH\b/, /\bETHEREUM\b/, /\bETHER\b/],
      SOL: [/\bSOL\b/, /\bSOLANA\b/],
      HYPE: [/\bHYPE\b/, /\bHYPERLIQUID\b/]
    };
    for (let i = 0; i < tokens.length; i++) {
      const symbol = tokens[i];
      const reList = aliases[symbol];
      for (let j = 0; j < reList.length; j++) {
        if (reList[j].test(clean)) {
          memory.lastSymbol = symbol;
          return symbol;
        }
      }
    }
    return memory.lastSymbol || null;
  }

  function parseQuantity(text) {
    const m = text.match(/(\d+[\d,.]*\d+|\d+)/);
    if (m) {
      let str = m[1];
      const parts = str.split(',');
      if (parts.length === 2) {
        if (parts[1].length === 3) str = parts[0] + parts[1];
        else str = parts[0] + '.' + parts[1];
      }
      const n = parseFloat(str);
      if (!isNaN(n) && n > 0) {
        memory.lastQty = n;
        return n;
      }
    }
    return memory.lastQty || 0.1;
  }

  function parseSide(text, lang) {
    const lower = text.toLowerCase();
    const collect = function (key) {
      const words = [];
      if (i18nGlobal[lang] && i18nGlobal[lang].intents && i18nGlobal[lang].intents[key]) {
        for (let i = 0; i < i18nGlobal[lang].intents[key].length; i++) words.push(i18nGlobal[lang].intents[key][i]);
      }
      if (i18nGlobal.en && i18nGlobal.en.intents && i18nGlobal.en.intents[key]) {
        for (let i = 0; i < i18nGlobal.en.intents[key].length; i++) words.push(i18nGlobal.en.intents[key][i]);
      }
      return words;
    };
    const buyWords = collect('buy');
    const sellWords = collect('sell');
    for (let i = 0; i < buyWords.length; i++) if (hasWord(lower, buyWords[i])) return 'buy';
    for (let i = 0; i < sellWords.length; i++) if (hasWord(lower, sellWords[i])) return 'sell';
    return null;
  }

  async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, timeoutMs);
    try {
      const response = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
      clearTimeout(timer);
      return response;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  async function fetchPrices() {
    const now = Date.now();
    if (now - lastFetchTime < 15000) return;
    lastFetchTime = now;

    let data = null;
    try {
      const proxyResponse = await fetchWithTimeout('/api/prices', {}, 10000);
      if (proxyResponse.ok) data = await proxyResponse.json();
    } catch (err) {
      console.warn('Proxy unavailable, falling back to CoinGecko:', err);
    }

    if (!data) {
      try {
        const ids = Object.values(priceMap).join(',');
        const response = await fetchWithTimeout('https://api.coingecko.com/api/v3/simple/price?ids=' + ids + '&vs_currencies=usd&include_24hr_change=true', {}, 10000);
        if (!response.ok) throw new Error('Network response was not ok');
        const cgData = await response.json();
        data = {};
        for (const [symbol, id] of Object.entries(priceMap)) {
          if (cgData[id] && typeof cgData[id].usd === 'number') {
            data[symbol] = { price: cgData[id].usd, change24h: cgData[id].usd_24h_change || 0 };
          }
        }
      } catch (err) {
        console.warn('Failed to fetch live prices:', err);
        return;
      }
    }

    for (const symbol of Object.keys(priceMap)) {
      if (data[symbol] && typeof data[symbol].price === 'number') {
        prices[symbol] = { base: data[symbol].price, change: data[symbol].change24h || 0 };
      }
    }
    updatePriceTicker();
  }

  function updatePriceTicker() {
    for (const symbol of Object.keys(prices)) {
      const priceEl = document.getElementById('price-' + symbol);
      const changeEl = document.getElementById('change-' + symbol);
      const item = document.querySelector('.ticker-item[data-symbol="' + symbol + '"]');
      if (priceEl) priceEl.textContent = formatPrice(prices[symbol].base);
      if (changeEl) {
        const change = prices[symbol].change;
        const sign = change >= 0 ? '+' : '';
        changeEl.textContent = sign + change.toFixed(2) + '%';
        changeEl.className = 'ticker-change ' + (change >= 0 ? 'up' : 'down');
      }
      if (item) {
        const status = item.querySelector('.ticker-status');
        if (status) status.textContent = 'Live • updated ' + new Date().toLocaleTimeString();
      }
    }
  }

  function updateMetric(label, value) {
    const metrics = document.querySelectorAll('.terminal-metric');
    metrics.forEach(function(el) {
      const labelEl = el.querySelector('span:first-child');
      if (labelEl && labelEl.textContent.trim().toLowerCase().includes(label.toLowerCase())) {
        const valueEl = el.querySelector('span:last-child');
        if (valueEl) valueEl.textContent = value;
      }
    });
    const statusItems = document.querySelectorAll('.terminal-status li');
    statusItems.forEach(function(li) {
      if (li.textContent.toLowerCase().includes(label.toLowerCase())) {
        const span = li.querySelector('span');
        if (span) span.textContent = value;
      }
    });
  }

  function updateStatElement(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    const num = Number(value);
    const display = formatNumber(num);
    el.textContent = display;
    const metric = el.parentElement;
    if (!metric || !metric.classList.contains('stat-card-metrics')) return;
    if (id === 'statTrades') {
      metric.innerHTML = '<span id="statTrades">' + display + '</span> ' + (num === 1 ? 'trade' : 'trades') + ' this month • <span id="statVolume">$168,553,875.50</span> total volume';
    } else if (id === 'statOpenPositions') {
      const activeEl = document.getElementById('statActive');
      const active = activeEl ? Number(activeEl.textContent.replace(/,/g, '')) : activeAutomations;
      metric.innerHTML = '<span id="statActive">' + formatNumber(active) + '</span> active • <span id="statOpenPositions">' + display + '</span> open ' + (num === 1 ? 'position' : 'positions');
    } else if (id === 'statActive') {
      const posEl = document.getElementById('statOpenPositions');
      const pos = posEl ? Number(posEl.textContent.replace(/,/g, '')) : openPositions;
      metric.innerHTML = '<span id="statActive">' + display + '</span> active • <span id="statOpenPositions">' + formatNumber(pos) + '</span> open ' + (pos === 1 ? 'position' : 'positions');
    } else if (id === 'statAnalysis') {
      const assetsEl = document.getElementById('statAssets');
      const assets = assetsEl ? Number(assetsEl.textContent.replace(/,/g, '')) : uniqueAssets;
      metric.innerHTML = '<span id="statAnalysis">' + display + '</span> analysis ' + (num === 1 ? 'run' : 'runs') + ' • <span id="statAssets">' + formatNumber(assets) + '</span> unique ' + (assets === 1 ? 'asset' : 'assets');
    } else if (id === 'statAssets') {
      const analysisEl = document.getElementById('statAnalysis');
      const analysis = analysisEl ? Number(analysisEl.textContent.replace(/,/g, '')) : analysisRuns;
      metric.innerHTML = '<span id="statAnalysis">' + formatNumber(analysis) + '</span> analysis ' + (analysis === 1 ? 'run' : 'runs') + ' • <span id="statAssets">' + display + '</span> unique ' + (num === 1 ? 'asset' : 'assets');
    } else if (id === 'statJobs') {
      const tradesEl = document.getElementById('statTotalTrades');
      const trades = tradesEl ? Number(tradesEl.textContent.replace(/,/g, '')) : totalTrades;
      metric.innerHTML = '<span id="statJobs">' + display + '</span> ' + (num === 1 ? 'job' : 'jobs') + ' processed • <span id="statTotalTrades">' + formatNumber(trades) + '</span> total ' + (trades === 1 ? 'trade' : 'trades');
    } else if (id === 'statTotalTrades') {
      const jobsEl = document.getElementById('statJobs');
      const jobs = jobsEl ? Number(jobsEl.textContent.replace(/,/g, '')) : totalJobs;
      metric.innerHTML = '<span id="statJobs">' + formatNumber(jobs) + '</span> ' + (jobs === 1 ? 'job' : 'jobs') + ' processed • <span id="statTotalTrades">' + display + '</span> total ' + (num === 1 ? 'trade' : 'trades');
    } else if (id === 'statWallets') {
      metric.innerHTML = '<span id="statWallets">' + display + '</span> unique wallet' + (num === 1 ? '' : 's') + ' connected';
    }
  }

  function addActivity(tickType, message, link) {
    const activityList = document.getElementById('activityList');
    if (!activityList) return;
    const now = new Date();
    const time = '[' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0') + ']';
    const item = document.createElement('div');
    item.className = 'activity-item';
    let textHtml = '';
    if (link) {
      textHtml = '<a href="' + link + '" target="_blank" rel="noopener">' + tickType + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>:' + message;
    } else {
      textHtml = 'Automation:' + tickType + ' - ' + message;
    }
    item.innerHTML = '<div class="activity-time">' + time + '</div><div class="activity-text">' + textHtml + '</div>';
    activityList.insertBefore(item, activityList.firstElementChild);
    while (activityList.children.length > 20) {
      activityList.removeChild(activityList.lastElementChild);
    }
  }

  function pushFeed(tickType, message) {
    const feedList = document.getElementById('liveFeed');
    if (!feedList) return;
    const cursor = feedList.querySelector('.term-cursor');
    const cursorLi = cursor ? cursor.parentElement : null;
    if (!cursorLi) return;
    const li = document.createElement('li');
    li.innerHTML = '<span class="term-tick">' + tickType + '</span>' + message;
    feedList.insertBefore(li, cursorLi);
    if (feedList.children.length > 7) {
      feedList.removeChild(feedList.firstElementChild);
    }
  }

  function scrollToStatistics() {
    const stats = document.getElementById('statistics');
    if (stats) stats.scrollIntoView({ behavior: 'smooth' });
  }

  function getStatisticsSummary() {
    return '• Wallets connected: ' + formatNumber(connectedWallets) + '\n' +
      '• Trades this month: ' + formatNumber(tradesThisMonth) + '\n' +
      '• Total volume: $168,553,875.50\n' +
      '• Analysis runs: ' + formatNumber(analysisRuns) + '\n' +
      '• Active automations: ' + activeAutomations + '\n' +
      '• Open positions: ' + openPositions + '\n' +
      '• ACP jobs processed: ' + formatNumber(totalJobs) + '\n' +
      '• Total ACP trades: ' + formatNumber(totalTrades);
  }

  function openChatbot(context) {
    chatbotWindow.classList.add('open');
    chatbotWindow.setAttribute('aria-hidden', 'false');
    chatLauncher.style.display = 'none';
    chatbotInput.focus();
    if (context) currentContext = context;
    const lang = memory.lang || 'en';
    if (chatbotMessages.children.length === 0) {
      if (context === 'Active Trading') {
        addBotMessage(t(lang, 'greetingActive'));
      } else if (context === 'Set & Forget') {
        addBotMessage(t(lang, 'greetingSet'));
      } else {
        addBotMessage(t(lang, 'greeting'));
      }
    } else if (context) {
      addBotMessage(t(lang, 'switchedContext', { context: context }));
    }
  }

  function closeChatbot() {
    chatbotWindow.classList.remove('open');
    chatbotWindow.setAttribute('aria-hidden', 'true');
    chatLauncher.style.display = 'flex';
  }

  function computeResponse(text) {
    const clean = text.trim();
    const lower = clean.toLowerCase().replace(/&/g, ' and ');
    if (!lower) return;

    const lang = detectLanguage(clean);
    memory.lang = lang;
    persistMemory();

    const _has = function (key) { return hasIntent(lang, key, lower); };

    if (_has('greeting')) {
      return t(lang, 'greeting');
    }
    if (_has('stats')) {
      scrollToStatistics();
      return t(lang, 'stats', { summary: getStatisticsSummary() });
    }

    let symbol = getSymbolFromText(clean);
    if (!symbol) symbol = memory.lastSymbol || 'BTC';

    if (_has('predict')) {
      const p = getPrice(symbol);
      if (!p) return t(lang, 'whichToken', { tokens: tokens.join(', ') });
      memory.lastTopic = 'predict';
      memory.lastSymbol = p.symbol;
      memory.lastPrice = p.price;
      memory.lastChange = p.change;
      persistMemory();
      const predicted = p.price * (1 + p.change / 100);
      const changeStr = (p.change >= 0 ? '+' : '') + p.change.toFixed(2) + '%';
      return t(lang, 'predict', { symbol: p.symbol, price: formatPrice(p.price), predicted: formatPrice(predicted), change: changeStr });
    }

    if (_has('price')) {
      const p = getPrice(symbol);
      if (!p) return t(lang, 'whichToken', { tokens: tokens.join(', ') });
      memory.lastTopic = 'price';
      memory.lastSymbol = p.symbol;
      memory.lastPrice = p.price;
      memory.lastChange = p.change;
      persistMemory();
      const changeStr = (p.change >= 0 ? '+' : '') + p.change.toFixed(2) + '%';
      return t(lang, 'price', { symbol: p.symbol, price: formatPrice(p.price), change: changeStr });
    }

    const side = parseSide(lower, lang);
    if (side) {
      const qty = parseQuantity(clean);
      const p = getPrice(symbol);
      const price = p ? formatPrice(p.price) : '$--';
      if (side === 'buy') {
        openPositions++;
        tradesThisMonth++;
        totalTrades++;
        analysisRuns++;
        updateMetric('open positions', openPositions);
        updateMetric('trades_this_month', tradesThisMonth);
        updateStatElement('statTrades', tradesThisMonth);
        updateStatElement('statOpenPositions', openPositions);
        updateStatElement('statAnalysis', analysisRuns);
        updateStatElement('statTotalTrades', totalTrades);
        pushFeed('$OPEN', qty + ' ' + symbol + ' position opened');
        addActivity('Open long', '$' + symbol + ' position opened', 'https://app.hyperliquid.xyz/explorer/tx/0x' + Math.random().toString(16).slice(2, 42));
        memory.lastTopic = 'trade';
        memory.lastSide = 'buy';
        memory.lastSymbol = symbol;
        memory.lastQty = qty;
        persistMemory();
        return t(lang, 'buy', { qty: qty, symbol: symbol, price: price });
      } else {
        if (openPositions > 0) openPositions--;
        tradesThisMonth++;
        totalTrades++;
        analysisRuns++;
        updateMetric('open positions', openPositions);
        updateMetric('trades_this_month', tradesThisMonth);
        updateStatElement('statTrades', tradesThisMonth);
        updateStatElement('statOpenPositions', openPositions);
        updateStatElement('statAnalysis', analysisRuns);
        updateStatElement('statTotalTrades', totalTrades);
        pushFeed('$CLOSE', qty + ' ' + symbol + ' position closed');
        addActivity('Close long', '$' + symbol + ' position closed', 'https://app.hyperliquid.xyz/explorer/tx/0x' + Math.random().toString(16).slice(2, 42));
        memory.lastTopic = 'trade';
        memory.lastSide = 'sell';
        memory.lastSymbol = symbol;
        memory.lastQty = qty;
        persistMemory();
        return t(lang, 'sell', { qty: qty, symbol: symbol, price: price });
      }
    }

    if (_has('position')) {
      return t(lang, 'positions', { n: openPositions });
    }
    if (_has('portfolio')) {
      return t(lang, 'portfolio');
    }
    if (_has('connect')) {
      connectedWallets++;
      updateStatElement('statWallets', connectedWallets);
      return t(lang, 'connect', { n: connectedWallets });
    }
    if (_has('analysis')) {
      analysisRuns += Math.floor(Math.random() * 3) + 1;
      updateStatElement('statAnalysis', analysisRuns);
      return t(lang, 'analysis', { n: analysisRuns, assets: uniqueAssets });
    }
    if (_has('automation')) {
      currentContext = 'Active Trading';
      activeAutomations = Math.min(activeAutomations + 1, 12);
      updateStatElement('statActive', activeAutomations);
      return t(lang, 'automation');
    }
    if (_has('strategy')) {
      currentContext = 'Set & Forget';
      return t(lang, 'strategy');
    }
    if (_has('acp')) {
      totalJobs += 1;
      totalTrades += Math.floor(Math.random() * 5) + 1;
      updateStatElement('statJobs', totalJobs);
      updateStatElement('statTotalTrades', totalTrades);
      return t(lang, 'acp', { jobs: totalJobs, trades: totalTrades });
    }
    if (_has('terminal')) {
      return t(lang, 'terminal');
    }
    if (lower === 'help' || _has('help')) {
      return t(lang, 'help');
    }

    // follow-up handling using memory
    if (memory.lastTopic) {
      const words = lower.split(/\s+/).filter(Boolean);
      const short = words.length <= 2 || lower.indexOf('?') !== -1;
      if (short || _has('followUp') || _has('up') || _has('down')) {
        if (memory.lastSymbol && (memory.lastTopic === 'price' || memory.lastTopic === 'predict')) {
          if (_has('up') || _has('down') || _has('predict')) {
            const p = getPrice(memory.lastSymbol);
            if (!p) return t(lang, 'whichToken', { tokens: tokens.join(', ') });
            const predicted = p.price * (1 + p.change / 100);
            const changeStr = (p.change >= 0 ? '+' : '') + p.change.toFixed(2) + '%';
            memory.lastTopic = 'predict';
            persistMemory();
            return t(lang, 'predict', { symbol: p.symbol, price: formatPrice(p.price), predicted: formatPrice(predicted), change: changeStr });
          } else {
            const p = getPrice(memory.lastSymbol);
            if (!p) return t(lang, 'whichToken', { tokens: tokens.join(', ') });
            const changeStr = (p.change >= 0 ? '+' : '') + p.change.toFixed(2) + '%';
            memory.lastTopic = 'price';
            persistMemory();
            return t(lang, 'price', { symbol: p.symbol, price: formatPrice(p.price), change: changeStr });
          }
        }
        if (memory.lastTopic === 'trade' && _has('followUp')) {
          const newSide = memory.lastSide || 'buy';
          const qty = parseQuantity(clean);
          const sideWord = (lang === 'id') ? (newSide === 'buy' ? 'beli' : 'jual') : (newSide === 'buy' ? 'buy' : 'sell');
          return computeResponse(sideWord + ' ' + qty + ' ' + (memory.lastSymbol || 'BTC'));
        }
      }
    }

    return t(lang, 'unknown');
  }

  function restoreHistory() {
    if (!chatbotMessages || !memory.chatHistory.length) return;
    isRestoring = true;
    for (let i = 0; i < memory.chatHistory.length; i++) {
      const item = memory.chatHistory[i];
      renderMessage(item.text, item.sender);
    }
    isRestoring = false;
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
  }

  chatLauncher.addEventListener('click', function () { openChatbot(); });
  chatbotClose.addEventListener('click', closeChatbot);
  chatbotForm.addEventListener('submit', function (e) {
    e.preventDefault();
    const text = chatbotInput.value;
    if (!text.trim()) return;
    addMessage(text, 'user');
    chatbotInput.value = '';
    const response = computeResponse(text);
    if (response) addBotMessage(response);
    persistMemory();
  });
  featureBadges.forEach(function (badge) {
    badge.addEventListener('click', function (e) {
      e.preventDefault();
      openChatbot(badge.textContent);
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && chatbotWindow.classList.contains('open')) closeChatbot();
  });

  // Terminal nav/button opens the chatbot terminal directly
  const terminalToggles = document.querySelectorAll('[data-open-terminal]');
  terminalToggles.forEach(function (toggle) {
    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      openChatbot();
      const navLinks = document.querySelector('.nav-links');
      const menuBtn = document.querySelector('.mobile-menu-btn');
      if (navLinks && navLinks.classList.contains('open')) {
        navLinks.classList.remove('open');
        if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
  });

  updatePriceTicker();
  restoreHistory();
  fetchPrices();
  setInterval(fetchPrices, 60000);
})();
