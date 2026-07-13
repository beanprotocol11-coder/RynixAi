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
  const coinGeckoMap = {
    BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', HYPE: 'hyperliquid',
    USDT: 'tether', USDC: 'usd-coin', DAI: 'dai',
    DOGE: 'dogecoin', XRP: 'ripple', ADA: 'cardano', TRX: 'tron', AVAX: 'avalanche-2',
    LINK: 'chainlink', LTC: 'litecoin', DOT: 'polkadot', BCH: 'bitcoin-cash', UNI: 'uniswap',
    AAVE: 'aave', NEAR: 'near', APT: 'aptos', OP: 'optimism', ARB: 'arbitrum',
    INJ: 'injective-protocol', SEI: 'sei-network', MNT: 'mantle', GRT: 'the-graph',
    FTM: 'fantom', SUI: 'sui', FIL: 'filecoin', ETC: 'ethereum-classic', ATOM: 'cosmos',
    IMX: 'immutable-x', XLM: 'stellar', TON: 'the-open-network', SHIB: 'shiba-inu',
    PEPE: 'pepe', BONK: 'bonk', FLOKI: 'floki', WLD: 'worldcoin-wld', ENA: 'ethena',
    JUP: 'jupiter-exchange-solana', PYTH: 'pyth-network', RNDR: 'render-token',
    TIA: 'celestia', KAS: 'kaspa', MANA: 'decentraland', SAND: 'the-sandbox',
    AXS: 'axie-infinity', FLOW: 'flow', XTZ: 'tezos', ALGO: 'algorand', ICP: 'internet-computer',
    VET: 'vechain', THETA: 'theta-token', HBAR: 'hedera-hashgraph', STX: 'blockstack',
    GALA: 'gala', ZIL: 'zilliqa', ROSE: 'oasis-network', MINA: 'mina-protocol',
    EGLD: 'multiversx-egld', CHZ: 'chiliz', ENJ: 'enjincoin', BAT: 'basic-attention-token',
    CRV: 'curve-dao-token', CVX: 'convex-finance', LDO: 'lido-dao', MKR: 'maker',
    SNX: 'havven', COMP: 'compound-governance-token', YFI: 'yearn-finance',
    '1INCH': '1inch', DYDX: 'dydx', SUSHI: 'sushi', PERP: 'perpetual-protocol',
    GMX: 'gmx', GNS: 'gains-network', CAKE: 'pancakeswap-token', BAKE: 'bakerytoken',
    RAY: 'raydium', SRM: 'serum', ALPHA: 'alpha-finance', BAND: 'band-protocol',
    KNC: 'kyber-network-crystal', REN: 'republic-protocol', OCEAN: 'ocean-protocol',
    RLC: 'iexec-rlc', STORJ: 'storj', ANKR: 'ankr', SKL: 'skale', NKN: 'nkn',
    CVC: 'civic', REQ: 'request-network', UMA: 'uma', REP: 'augur', MLN: 'melon',
    WAVES: 'waves', ONT: 'ontology', NEO: 'neo', QTUM: 'qtum', IOTA: 'iota',
    XEM: 'nem', ZEC: 'zcash', DASH: 'dash', XMR: 'monero', RVN: 'ravencoin',
    DGB: 'digibyte', SC: 'siacoin', ZEN: 'horizen', HNT: 'helium', KLAY: 'klay-token',
    CELO: 'celo', AR: 'arweave', ORDI: 'ordinals', SATS: 'sats', BTT: 'bittorrent',
    COTI: 'coti', BEAM: 'beam', HIVE: 'hive', STEEM: 'steem', STMX: 'stormx',
    AMP: 'amp-token', DIA: 'dia-data', API3: 'api3', DODO: 'dodo', XYO: 'xyo-network'
  };
  const fallbackPrices = {
    BTC: { base: 94500, change: 2.4 },
    ETH: { base: 3450, change: -1.2 },
    SOL: { base: 180, change: 0.8 },
    HYPE: { base: 20, change: 5.1 }
  };
  let prices = JSON.parse(JSON.stringify(fallbackPrices));
  let lastFetchTime = 0;
  let tokens = Object.keys(prices);
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

  const marketCache = {};
  const resolvedIds = {};
  const CACHE_TTL = 60 * 1000;

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

  function renderChart(chart) {
    if (!chart || !chart.data || !chart.data.length) return;
    const div = document.createElement('div');
    div.className = 'chatbot-message bot chart';
    const svg = document.createElement('div');
    svg.className = 'chatbot-chart';
    svg.innerHTML = generateChartSVG(chart.data, chart.symbol, chart.price, chart.change);
    div.appendChild(svg);
    chatbotMessages.appendChild(div);
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
  }

  function addMessage(text, sender) {
    renderMessage(text, sender);
    if (!isRestoring) pushHistory(text, sender);
  }

  function addBotMessage(response, delay) {
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
      if (typeof response === 'string') {
        addMessage(response, 'bot');
      } else if (response && typeof response === 'object') {
        if (response.text) addMessage(response.text, 'bot');
        if (response.chart) renderChart(response.chart);
      }
    }, delay);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[m];
    });
  }

  function formatPrice(n) {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatNumber(n) {
    return n.toLocaleString('en-US');
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

  function getSymbolFromText(text, lang) {
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
      if (reList) {
        for (let j = 0; j < reList.length; j++) {
          if (reList[j].test(clean)) {
            memory.lastSymbol = symbol;
            return symbol;
          }
        }
      }
    }

    // Build stop set first so we can also screen all-caps matches
    const commonStops = [
      'the','a','an','of','for','in','on','at','to','is','are','and','or','this','that','these','it','what','how','when','where','why','which','who','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','can','shall','if','then','than','so','as','with','without','from','by','about','into','over','under','above','below','up','down','out','off','on','again','further','here','there','all','any','both','each','few','more','most','other','some','such','no','nor','not','only','own','same','too','very','just','now','today','current','market','price','cost','value','worth','doing','trading','rate','quote','harga','berapa','nilai','pasar','pasaran','saham','kurs','kini','sekarang','harga','harganya','berapakah','prediksi','perkiraan','ramal','ramalan','akan','nanti','depan','kemungkinan','besok','mendatang','kira','forecast','prediction','chart','charts','grafik','chart','mapping','thesis','tesis','analisis','analisa','indikator','sinyal','teknikal','teliti','kaji','bullish','bearish','outlook','prospek','rekomendasi','sentimen','sentiment','opini','opinion','proyeksi','projection','fundamental','on','chain','onchain','on-chain','portfolio','portofolio','dompet','saldo','wallet','rekening','dana','aset','kekayaan','tabungan','balance','funds','beli','borong','ambil','dapatkan','membeli','mau','order','pesan','jual','tutup','lepas','keluarkan','menjual','buy','bought','buying','sell','sold','selling','long','short','order','purchase','accumulate','invest','get','some','put','liquidate','dump','unload','close','exit','take','profit','stop','loss','stop-loss','open','position','positions','statistik','stat','data','metrik','ringkasan','ikhtisar','dashboard','summary','overview','connect','connected','connection','link','login','wallet','metamask','hubungkan','sambungkan','hubung','konek','masuk','kaitkan','automation','automate','automated','bot','bots','grid','dca','trading','otomatis','automasi','robot','strategy','strategies','plan','plans','approach','monitor','monitoring','rule','rules','condition','conditions','setup','strategi','rencana','taktik','aturan','pantau','pengawasan','acp','agent','agents','job','jobs','task','tasks','worker','compute','protocol','network','agen','pekerjaan','tugas','jaringan','komputasi','protokol','terminal','command','commands','cmd','cli','console','shell','execute','run','prompt','command','line','perintah','konsol','ketik','baris','help','bantu','bantuan','tolong','commands','cara','contoh','bantuin','tolongin','greeting','hello','hi','hey','halo','selamat','pagi','siang','sore','malam','hai','good','morning','evening','greetings','yo','sup','howdy','yes','no','ok','oke','iya','tidak','thanks','thank','terima','kasih','sama','kembali','welcome','please','mohon','tolong','sorry','maaf','maybe','mungkin','kira','rata','sekitar','naik','tinggi','melesat','menguat','turun','rendah','melemah','jatuh','anjlok','hancur','up','rise','rising','increase','higher','high','bull','pump','pumping','upward','climb','climbing','gain','gains','grow','growing','down','fall','falling','decrease','lower','low','bear','dump','dumping','downward','drop','dropping','decline','declining','lose','losing','crash','crashing','ribu','juta','miliar','rupiah','cair','sudah','belum','lagi','terus','lanjut','selanjutnya','kemudian','lalu','ini','itu','atau','untuk','dengan','di','ke','dari','saya','kamu','anda','aku','ingin','bisa','dapat','gimana','sih','dong','kan','lah','baik','mantap','keren','hebat','bagus','makasih','dadah','sampai','jumpa','tentu','pasti','betul','benar','salah'
    ];
    const stopSet = new Set(commonStops);
    if (lang && i18nGlobal[lang] && i18nGlobal[lang].intents) {
      for (const key in i18nGlobal[lang].intents) {
        if (Array.isArray(i18nGlobal[lang].intents[key])) {
          i18nGlobal[lang].intents[key].forEach(function (w) { stopSet.add(w.toLowerCase()); });
        }
      }
    }
    if (i18nGlobal.en && i18nGlobal.en.intents) {
      for (const key in i18nGlobal.en.intents) {
        if (Array.isArray(i18nGlobal.en.intents[key])) {
          i18nGlobal.en.intents[key].forEach(function (w) { stopSet.add(w.toLowerCase()); });
        }
      }
    }
    // Try any all-caps ticker symbol that is not a stop word
    const capsMatch = clean.match(/\b[A-Z]{2,6}\b/);
    if (capsMatch && !stopSet.has(capsMatch[0].toLowerCase())) {
      memory.lastSymbol = capsMatch[0];
      return capsMatch[0];
    }
    const words = clean.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (/^\d+$/.test(w)) continue;
      if (stopSet.has(w)) continue;
      if (w.length === 1) continue;
      memory.lastSymbol = w.toUpperCase();
      return memory.lastSymbol;
    }
    return memory.lastSymbol || null;
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

  async function resolveCoinId(query) {
    const q = String(query).toLowerCase().trim();
    if (resolvedIds[q]) return resolvedIds[q];
    const upper = q.toUpperCase();
    if (coinGeckoMap[upper]) return coinGeckoMap[upper];
    try {
      const response = await fetchWithTimeout('https://api.coingecko.com/api/v3/search?query=' + encodeURIComponent(q), {}, 10000);
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      if (data && data.coins && data.coins.length) {
        const coin = data.coins[0];
        resolvedIds[q] = coin.id;
        return coin.id;
      }
    } catch (err) {
      console.warn('resolveCoinId error:', err);
    }
    return null;
  }

  async function getMarketData(symbolOrName) {
    const query = String(symbolOrName || 'BTC').trim();
    const cacheKey = query.toUpperCase();
    const now = Date.now();
    if (marketCache[cacheKey] && now - marketCache[cacheKey].ts < CACHE_TTL) {
      return marketCache[cacheKey].data;
    }

    const fallback = function () {
      const p = getPrice(cacheKey);
      return {
        id: query.toLowerCase(),
        symbol: cacheKey,
        name: query.charAt(0).toUpperCase() + query.slice(1).toLowerCase(),
        price: p ? p.price : 0,
        change: p ? p.change : 0,
        image: '',
        sparkline: []
      };
    };

    let id = await resolveCoinId(query);
    if (!id) {
      const upper = cacheKey;
      if (coinGeckoMap[upper]) id = coinGeckoMap[upper];
      else if (priceMap[upper]) id = priceMap[upper];
      else if (memory.lastSymbol && (coinGeckoMap[memory.lastSymbol.toUpperCase()] || priceMap[memory.lastSymbol.toUpperCase()])) {
        id = coinGeckoMap[memory.lastSymbol.toUpperCase()] || priceMap[memory.lastSymbol.toUpperCase()];
      } else {
        const result = fallback();
        result._unresolved = true;
        return result;
      }
    }

    try {
      const response = await fetchWithTimeout('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=' + id + '&sparkline=true&price_change_percentage=24h', {}, 10000);
      if (!response.ok) throw new Error('Market data failed');
      const data = await response.json();
      if (data && data.length) {
        const coin = data[0];
        const price = typeof coin.current_price === 'number' ? coin.current_price : 0;
        const change = typeof coin.price_change_percentage_24h_in_currency === 'number' ? coin.price_change_percentage_24h_in_currency : (typeof coin.price_change_percentage_24h === 'number' ? coin.price_change_percentage_24h : 0);
        const sparkline = (coin.sparkline_in_7d && coin.sparkline_in_7d.price) || [];
        const result = {
          id: coin.id,
          symbol: (coin.symbol || cacheKey).toUpperCase(),
          name: coin.name || 'Unknown',
          price: price,
          change: change,
          image: coin.image || '',
          sparkline: sparkline
        };
        marketCache[cacheKey] = { data: result, ts: now };
        return result;
      }
    } catch (err) {
      console.warn('getMarketData markets error:', err);
    }

    // Fallback to simple/price if markets (with sparkline) fails
    try {
      const response = await fetchWithTimeout('https://api.coingecko.com/api/v3/simple/price?ids=' + id + '&vs_currencies=usd&include_24hr_change=true', {}, 10000);
      if (response.ok) {
        const data = await response.json();
        if (data[id] && typeof data[id].usd === 'number') {
          const result = {
            id: id,
            symbol: cacheKey,
            name: query.charAt(0).toUpperCase() + query.slice(1).toLowerCase(),
            price: data[id].usd,
            change: data[id].usd_24h_change || 0,
            image: '',
            sparkline: []
          };
          marketCache[cacheKey] = { data: result, ts: now };
          return result;
        }
      }
    } catch (err) {
      console.warn('getMarketData simple/price error:', err);
    }

    return fallback();
  }

  function generateChartSVG(data, symbol, price, change) {
    if (!data || data.length < 2) return '';
    const width = 320;
    const height = 120;
    const padding = 4;
    const min = Math.min.apply(null, data);
    const max = Math.max.apply(null, data);
    const range = max - min || 1;
    const n = data.length - 1;
    const points = data.map(function (v, i) {
      const x = padding + (i / n) * (width - padding * 2);
      const y = height - padding - ((v - min) / range) * (height - padding * 2);
      return x + ',' + y;
    }).join(' ');
    const color = change >= 0 ? '#ccff00' : '#ff4444';
    const gradientId = 'grad-' + Math.random().toString(36).slice(2, 8);
    const areaPoints = points + ' ' + (width - padding) + ',' + (height - padding) + ' ' + padding + ',' + (height - padding);
    return '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
      '<linearGradient id="' + gradientId + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.25"/>' +
      '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/>' +
      '</linearGradient>' +
      '</defs>' +
      '<polyline points="' + areaPoints + '" fill="url(#' + gradientId + ')" stroke="none"/>' +
      '<polyline points="' + points + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<text x="' + (width - 10) + '" y="18" text-anchor="end" fill="' + color + '" font-family="Source Code Pro, monospace" font-size="12" font-weight="700">' + escapeHtml(symbol) + ' ' + (change >= 0 ? '+' : '') + change.toFixed(2) + '%</text>' +
      '</svg>';
  }

  function generateThesis(data, symbol, price, change, lang) {
    if (!data || data.length < 2) return '';
    const start = data[0];
    const end = data[data.length - 1];
    const weekChange = ((end - start) / start) * 100;
    const min = Math.min.apply(null, data);
    const max = Math.max.apply(null, data);
    const volatility = ((max - min) / min) * 100;

    let bias = 'neutral';
    if (change > 0 && weekChange > 0) bias = 'bullish';
    else if (change < 0 && weekChange < 0) bias = 'bearish';
    else if (change > 1) bias = 'bullish';
    else if (change < -1) bias = 'bearish';

    let volDesc = 'low';
    if (volatility > 10) volDesc = 'moderate';
    if (volatility > 20) volDesc = 'high';

    if (lang === 'id') {
      const biasText = bias === 'bullish' ? 'bullish' : bias === 'bearish' ? 'bearish' : 'netral';
      const action = bias === 'bullish' ? 'peluang kenaikan' : bias === 'bearish' ? 'tekanan turun' : 'konsolidasi';
      return 'Sentimen ' + biasText + ' jangka pendek. Perubahan 24 jam ' + (change >= 0 ? '+' : '') + change.toFixed(2) + '% dan perubahan 7 hari ' + (weekChange >= 0 ? '+' : '') + weekChange.toFixed(2) + '%. Volatilitas ' + volDesc + ' (' + volatility.toFixed(1) + '%). Thesis: ' + symbol + ' sedang menunjukkan ' + action + ' dengan support di sekitar ' + formatPrice(min) + ' dan resistance di sekitar ' + formatPrice(max) + '. Ini bukan saran keuangan.';
    }
    const biasText = bias;
    const action = bias === 'bullish' ? 'upside continuation' : bias === 'bearish' ? 'downside pressure' : 'consolidation';
    return 'Short-term sentiment is ' + biasText + '. 24h change is ' + (change >= 0 ? '+' : '') + change.toFixed(2) + '% and 7-day change is ' + (weekChange >= 0 ? '+' : '') + weekChange.toFixed(2) + '%. Volatility is ' + volDesc + ' (' + volatility.toFixed(1) + '%). Thesis: ' + symbol + ' is showing ' + action + ' with support around ' + formatPrice(min) + ' and resistance around ' + formatPrice(max) + '. This is not financial advice.';
  }

  async function fetchPortfolio(lang) {
    const symbols = ['BTC', 'ETH', 'SOL', 'HYPE'];
    const holdings = { BTC: 0.25, ETH: 1.5, SOL: 50, HYPE: 100 };
    const cash = 25000;
    let total = cash;
    let costBasis = 0;
    const lines = [];
    try {
      const data = await Promise.all(symbols.map(function (s) { return getMarketData(s); }));
      for (let i = 0; i < data.length; i++) {
        const m = data[i];
        const qty = holdings[symbols[i]];
        const value = m.price * qty;
        total += value;
        const cb = value * (1 - (Math.random() * 0.06 - 0.02)); // simulated cost basis
        costBasis += cb;
        const pl = value - cb;
        const plStr = (pl >= 0 ? '+' : '') + formatPrice(pl) + ' (' + (pl / cb * 100).toFixed(2) + '%)';
        lines.push(symbols[i] + ' ' + qty + '  ' + formatPrice(value) + '  P&L ' + plStr);
      }
    } catch (err) {
      console.warn('Portfolio fetch error:', err);
      for (let i = 0; i < symbols.length; i++) {
        const p = getPrice(symbols[i]) || { price: 0, change: 0 };
        const qty = holdings[symbols[i]];
        const value = p.price * qty;
        total += value;
        lines.push(symbols[i] + ' ' + qty + '  ' + formatPrice(value));
      }
    }
    const pnl = total - costBasis;
    const pnlStr = (pnl >= 0 ? '+' : '') + formatPrice(pnl);
    const summary = lines.join('\n');
    return t(lang, 'portfolio', { summary: summary, total: formatPrice(total), pnl: pnlStr });
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

  async function computeResponse(text) {
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

    let symbol = getSymbolFromText(clean, lang);
    if (!symbol) symbol = memory.lastSymbol || 'BTC';

    if (_has('thesis') || _has('chart') || _has('price') || _has('predict') || _has('buy') || _has('sell')) {
      // Fetch real-time market data for any requested token
      const market = await getMarketData(symbol);
      if (!market || market._unresolved) return t(lang, 'whichToken', { tokens: tokens.join(', ') });
      const marketSymbol = market.symbol || symbol.toUpperCase();
      const price = market.price;
      const change = market.change;
      const changeStr = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
      const chart = market.sparkline && market.sparkline.length ? { data: market.sparkline, symbol: marketSymbol, price: price, change: change } : null;

      if (_has('thesis')) {
        memory.lastTopic = 'thesis';
        memory.lastSymbol = marketSymbol;
        memory.lastPrice = price;
        memory.lastChange = change;
        persistMemory();
        const thesis = generateThesis(market.sparkline, marketSymbol, price, change, lang);
        return {
          text: t(lang, 'thesisSummary', { symbol: marketSymbol, name: market.name, price: formatPrice(price), change: changeStr, thesis: thesis }),
          chart: chart
        };
      }

      if (_has('chart')) {
        memory.lastTopic = 'chart';
        memory.lastSymbol = marketSymbol;
        memory.lastPrice = price;
        memory.lastChange = change;
        persistMemory();
        return {
          text: t(lang, 'chartSummary', { symbol: marketSymbol, name: market.name, price: formatPrice(price), change: changeStr }),
          chart: chart
        };
      }

      if (_has('predict')) {
        memory.lastTopic = 'predict';
        memory.lastSymbol = marketSymbol;
        memory.lastPrice = price;
        memory.lastChange = change;
        persistMemory();
        const predicted = price * (1 + change / 100);
        return {
          text: t(lang, 'predict', { symbol: marketSymbol, price: formatPrice(price), predicted: formatPrice(predicted), change: changeStr }),
          chart: chart
        };
      }

      if (_has('price')) {
        memory.lastTopic = 'price';
        memory.lastSymbol = marketSymbol;
        memory.lastPrice = price;
        memory.lastChange = change;
        persistMemory();
        return {
          text: t(lang, 'price', { symbol: marketSymbol, price: formatPrice(price), change: changeStr }),
          chart: chart
        };
      }

      const side = parseSide(lower, lang);
      if (side) {
        const qty = parseQuantity(clean);
        const priceStr = formatPrice(price);
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
          pushFeed('$OPEN', qty + ' ' + marketSymbol + ' position opened');
          addActivity('Open long', '$' + marketSymbol + ' position opened', 'https://app.hyperliquid.xyz/explorer/tx/0x' + Math.random().toString(16).slice(2, 42));
          memory.lastTopic = 'trade';
          memory.lastSide = 'buy';
          memory.lastSymbol = marketSymbol;
          memory.lastQty = qty;
          persistMemory();
          return t(lang, 'buy', { qty: qty, symbol: marketSymbol, price: priceStr });
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
          pushFeed('$CLOSE', qty + ' ' + marketSymbol + ' position closed');
          addActivity('Close long', '$' + marketSymbol + ' position closed', 'https://app.hyperliquid.xyz/explorer/tx/0x' + Math.random().toString(16).slice(2, 42));
          memory.lastTopic = 'trade';
          memory.lastSide = 'sell';
          memory.lastSymbol = marketSymbol;
          memory.lastQty = qty;
          persistMemory();
          return t(lang, 'sell', { qty: qty, symbol: marketSymbol, price: priceStr });
        }
      }
    }

    if (_has('position')) {
      return t(lang, 'positions', { n: openPositions });
    }
    if (_has('portfolio')) {
      return await fetchPortfolio(lang);
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
        if (memory.lastSymbol && (memory.lastTopic === 'price' || memory.lastTopic === 'predict' || memory.lastTopic === 'thesis' || memory.lastTopic === 'chart')) {
          if (_has('up') || _has('down') || _has('predict')) {
            const market = await getMarketData(memory.lastSymbol);
            if (!market || market._unresolved) return t(lang, 'whichToken', { tokens: tokens.join(', ') });
            const predicted = market.price * (1 + market.change / 100);
            const changeStr = (market.change >= 0 ? '+' : '') + market.change.toFixed(2) + '%';
            memory.lastTopic = 'predict';
            persistMemory();
            return {
              text: t(lang, 'predict', { symbol: market.symbol, price: formatPrice(market.price), predicted: formatPrice(predicted), change: changeStr }),
              chart: market.sparkline && market.sparkline.length ? { data: market.sparkline, symbol: market.symbol, price: market.price, change: market.change } : null
            };
          } else {
            const market = await getMarketData(memory.lastSymbol);
            if (!market || market._unresolved) return t(lang, 'whichToken', { tokens: tokens.join(', ') });
            const changeStr = (market.change >= 0 ? '+' : '') + market.change.toFixed(2) + '%';
            memory.lastTopic = 'price';
            persistMemory();
            return {
              text: t(lang, 'price', { symbol: market.symbol, price: formatPrice(market.price), change: changeStr }),
              chart: market.sparkline && market.sparkline.length ? { data: market.sparkline, symbol: market.symbol, price: market.price, change: market.change } : null
            };
          }
        }
        if (memory.lastTopic === 'trade' && _has('followUp')) {
          const newSide = memory.lastSide || 'buy';
          const qty = parseQuantity(clean);
          const sideWord = (lang === 'id') ? (newSide === 'buy' ? 'beli' : 'jual') : (newSide === 'buy' ? 'buy' : 'sell');
          return await computeResponse(sideWord + ' ' + qty + ' ' + (memory.lastSymbol || 'BTC'));
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
  chatbotForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const text = chatbotInput.value;
    if (!text.trim()) return;
    addMessage(text, 'user');
    chatbotInput.value = '';
    try {
      const response = await computeResponse(text);
      if (response) addBotMessage(response);
    } catch (err) {
      console.error('Chatbot error:', err);
      addBotMessage('Sorry, I had trouble fetching that. Try again in a moment.');
    }
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

  updatePriceTicker();
  restoreHistory();
  fetchPrices();
  setInterval(fetchPrices, 60000);
})();
