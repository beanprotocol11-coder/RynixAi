(function () {
  'use strict';

  const CHAT_STORAGE_KEY = 'rynix_chat_session';
  const MAX_HISTORY = 40;

  const chatbotWindow = document.getElementById('chatbotWindow');
  const chatbotMessages = document.getElementById('chatbotMessages');
  const chatbotForm = document.getElementById('chatbotForm');
  const chatbotInput = document.getElementById('chatbotInput');
  const chatLauncher = document.getElementById('chatLauncher');
  const chatbotClose = document.getElementById('chatbotClose');
  const featureBadges = document.querySelectorAll('.feature-badge');

  let messages = loadMessages();
  let typingIndicator = null;
  let abortController = null;
  let currentContext = '';

  const priceMap = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', HYPE: 'hyperliquid' };
  const fallbackPrices = {
    BTC: { price: 94500, change: 2.4 },
    ETH: { price: 3450, change: -1.2 },
    SOL: { price: 180, change: 0.8 },
    HYPE: { price: 20, change: 5.1 }
  };
  let prices = { ...fallbackPrices };
  let lastFetchTime = 0;

  function getWalletInfo() {
    const navText = document.getElementById('connectWalletNav');
    const heroText = document.getElementById('connectWalletHeroText');
    const text = (navText && navText.textContent) || (heroText && heroText.textContent) || '';
    const connected = text && text.includes('0x') && text.includes('...');
    return { connected, wallet: connected ? text.trim() : null };
  }

  function loadMessages() {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(-MAX_HISTORY) : [];
    } catch (e) {
      return [];
    }
  }

  function saveMessages() {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-MAX_HISTORY)));
    } catch (e) {
      // ignore storage errors
    }
  }

  function formatPrice(n) {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function updatePriceTicker() {
    for (const symbol of Object.keys(prices)) {
      const priceEl = document.getElementById('price-' + symbol);
      const changeEl = document.getElementById('change-' + symbol);
      const item = document.querySelector('.ticker-item[data-symbol="' + symbol + '"]');
      if (priceEl) priceEl.textContent = formatPrice(prices[symbol].price);
      if (changeEl) {
        const change = prices[symbol].change;
        const sign = change >= 0 ? '+' : '';
        changeEl.textContent = sign + change.toFixed(2) + '%';
        changeEl.className = 'ticker-change ' + (change >= 0 ? 'up' : 'down');
      }
      if (item) {
        const status = item.querySelector('.ticker-status');
        if (status) status.textContent = 'Live · updated ' + new Date().toLocaleTimeString();
      }

      const termPrice = document.getElementById('terminal-price-' + symbol);
      if (termPrice) termPrice.textContent = formatPrice(prices[symbol].price);

      const snap = document.getElementById('snap-' + symbol);
      if (snap) {
        const change = prices[symbol].change;
        const sign = change >= 0 ? '+' : '';
        snap.textContent = formatPrice(prices[symbol].price) + ' (' + sign + change.toFixed(2) + '%)';
      }
    }
  }

  async function fetchPrices() {
    const now = Date.now();
    if (now - lastFetchTime < 15000) return;
    lastFetchTime = now;

    try {
      const proxyResponse = await fetch('/api/prices');
      if (proxyResponse.ok) {
        const data = await proxyResponse.json();
        for (const symbol of Object.keys(priceMap)) {
          if (data[symbol] && typeof data[symbol].price === 'number') {
            prices[symbol] = { price: data[symbol].price, change: data[symbol].change || 0 };
          }
        }
        updatePriceTicker();
      }
    } catch (err) {
      console.warn('Failed to fetch live prices:', err);
    }
  }

  function addMessage(text, sender) {
    const div = document.createElement('div');
    div.className = 'chatbot-message ' + sender;
    div.textContent = text;
    chatbotMessages.appendChild(div);
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
    return div;
  }

  function removeTyping() {
    if (typingIndicator) {
      typingIndicator.remove();
      typingIndicator = null;
    }
  }

  function showTyping() {
    removeTyping();
    typingIndicator = document.createElement('div');
    typingIndicator.className = 'chatbot-typing';
    typingIndicator.innerHTML = '<span></span><span></span><span></span>';
    chatbotMessages.appendChild(typingIndicator);
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
  }

  function addBotMessage(text, delay) {
    removeTyping();
    if (delay) {
      setTimeout(() => addMessage(text, 'bot'), delay);
    } else {
      addMessage(text, 'bot');
    }
  }

  function renderHistory() {
    if (!chatbotMessages) return;
    chatbotMessages.innerHTML = '';
    for (const m of messages) {
      if (m.role === 'user' || m.role === 'assistant') {
        addMessage(m.content, m.role === 'user' ? 'user' : 'bot');
      }
    }
  }

  function openChatbot(context) {
    if (!chatbotWindow) return;
    chatbotWindow.classList.add('open');
    chatbotWindow.setAttribute('aria-hidden', 'false');
    if (chatLauncher) chatLauncher.style.display = 'none';
    if (chatbotInput) chatbotInput.focus();
    if (context) currentContext = context;

    if (chatbotMessages && chatbotMessages.children.length === 0) {
      if (!messages.length) {
        const greeting = getGreeting(context);
        messages.push({ role: 'assistant', content: greeting });
        saveMessages();
      }
      renderHistory();
    }
  }

  function closeChatbot() {
    if (!chatbotWindow) return;
    chatbotWindow.classList.remove('open');
    chatbotWindow.setAttribute('aria-hidden', 'true');
    if (chatLauncher) chatLauncher.style.display = 'flex';
    if (abortController) abortController.abort();
  }

  function getGreeting(context) {
    if (context === 'Active Trading') {
      return 'Active Trading selected. I can help you build grid, DCA, or indicator-based automations. What would you like to automate?';
    }
    if (context === 'Set & Forget') {
      return 'Set & Forget selected. Tell me your thesis and I will help you turn it into a monitored strategy.';
    }
    return 'Hi, I am Rynix AI. Ask me about prices, strategies, Robinhood Chain, or the Rynix litepaper.';
  }

  async function handleSubmit(text) {
    if (!text.trim()) return;
    addMessage(text, 'user');
    messages.push({ role: 'user', content: text });
    saveMessages();
    if (chatbotInput) chatbotInput.value = '';

    showTyping();

    if (abortController) abortController.abort();
    abortController = new AbortController();
    const { connected, wallet } = getWalletInfo();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, wallet, connected, context: currentContext || null }),
        signal: abortController.signal
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.details || 'Chat failed');
      }

      const data = await response.json();
      const reply = data.content || 'Rynix AI is thinking...';
      messages.push({ role: 'assistant', content: reply });
      saveMessages();
      addBotMessage(reply);
    } catch (err) {
      removeTyping();
      if (err.name !== 'AbortError') {
        const msg = err.message && err.message.includes('API key')
          ? 'Rynix AI is not fully configured yet. The administrator needs to set an LLM API key.'
          : 'Rynix AI is unavailable right now. Please try again in a moment.';
        addBotMessage(msg);
      }
    }
  }

  if (chatbotForm) {
    chatbotForm.addEventListener('submit', function (e) {
      e.preventDefault();
      handleSubmit(chatbotInput.value);
    });
  }

  if (chatLauncher) {
    chatLauncher.addEventListener('click', () => openChatbot());
  }

  if (chatbotClose) {
    chatbotClose.addEventListener('click', closeChatbot);
  }

  featureBadges.forEach(function (badge) {
    badge.addEventListener('click', function (e) {
      e.preventDefault();
      openChatbot(badge.textContent);
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && chatbotWindow && chatbotWindow.classList.contains('open')) {
      closeChatbot();
    }
  });

  updatePriceTicker();
  fetchPrices();
  setInterval(fetchPrices, 60000);

  if (window.location.hash === '#chat') {
    openChatbot();
  }
})();
