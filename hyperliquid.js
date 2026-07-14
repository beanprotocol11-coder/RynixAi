// Real HyperLiquid execution layer (non-custodial).
// The connected wallet signs each L1 action (EIP-712); orders go straight to
// HyperLiquid's /exchange endpoint. No operator key, no custody. Defaults to
// testnet — switch with the terminal `network mainnet` command.
import { ExchangeClient, InfoClient, HttpTransport } from 'https://esm.sh/@nktkas/hyperliquid@0.33.1?bundle';

let isTestnet = true;
let transport = new HttpTransport({ isTestnet: isTestnet });
let info = new InfoClient({ transport: transport });
let metaCache = null;

function rebuild() {
  transport = new HttpTransport({ isTestnet: isTestnet });
  info = new InfoClient({ transport: transport });
  metaCache = null;
}

function norm(n) {
  return Number(n).toString();
}

// HyperLiquid: max 5 significant figures, and no more than (6 - szDecimals) decimals for perps.
function roundPrice(px, szDecimals) {
  const maxDec = Math.max(0, 6 - szDecimals);
  let p = Number(Number(px).toPrecision(5));
  return Number(p.toFixed(maxDec));
}

function roundSize(sz, szDecimals) {
  return Number(Number(sz).toFixed(szDecimals));
}

// Adapter matching the SDK's viem JSON-RPC account interface, backed by an
// injected EIP-1193 provider (window.ethereum / connected wallet).
function makeWallet(provider, address) {
  return {
    signTypedData: async ({ domain, types, primaryType, message }) => {
      return await provider.request({
        method: 'eth_signTypedData_v4',
        params: [address, JSON.stringify({ domain: domain, types: types, primaryType: primaryType, message: message })]
      });
    },
    getAddresses: async () => [address],
    getChainId: async () => {
      const c = await provider.request({ method: 'eth_chainId' });
      return parseInt(c, 16);
    }
  };
}

async function meta() {
  if (!metaCache) metaCache = await info.meta();
  return metaCache;
}

async function assetInfo(symbol) {
  const m = await meta();
  const idx = m.universe.findIndex(a => a.name === symbol);
  return idx >= 0 ? { index: idx, szDecimals: m.universe[idx].szDecimals } : null;
}

window.RynixHL = {
  get isTestnet() { return isTestnet; },
  setNetwork(net) {
    isTestnet = (net !== 'mainnet');
    rebuild();
    return isTestnet ? 'testnet' : 'mainnet';
  },
  async midPrice(symbol) {
    const mids = await info.allMids();
    return parseFloat(mids[symbol]);
  },
  async placeOrder(opts) {
    const provider = opts.provider, address = opts.address, symbol = opts.symbol, isBuy = opts.isBuy;
    const ai = await assetInfo(symbol);
    if (!ai) throw new Error(symbol + ' is not listed on HyperLiquid perps.');
    const mid = await this.midPrice(symbol);
    if (!mid) throw new Error('No market price for ' + symbol + '.');

    let size;
    if (opts.tokenQty != null) {
      size = opts.tokenQty;
    } else if (opts.usdAmount != null) {
      size = opts.usdAmount / mid;
    } else if (opts.percent != null) {
      const st = await info.clearinghouseState({ user: address });
      const acct = parseFloat((st && st.withdrawable) || (st && st.marginSummary && st.marginSummary.accountValue) || '0');
      if (!acct) throw new Error('No HyperLiquid balance to size % against.');
      size = (acct * (opts.percent / 100)) / mid;
    } else {
      throw new Error('Specify a size: token qty, $ amount, or %.');
    }
    size = roundSize(size, ai.szDecimals);
    if (!(size > 0)) throw new Error('Size rounds to 0 — increase the amount.');

    const wallet = makeWallet(provider, address);
    const exch = new ExchangeClient({ transport: transport, wallet: wallet });

    if (opts.leverage != null) {
      try { await exch.updateLeverage({ asset: ai.index, isCross: true, leverage: Math.max(1, Math.round(opts.leverage)) }); } catch (e) { /* leverage optional */ }
    }

    const px = roundPrice(isBuy ? mid * 1.02 : mid * 0.98, ai.szDecimals);
    const entry = await exch.order({
      orders: [{ a: ai.index, b: isBuy, p: norm(px), s: norm(size), r: false, t: { limit: { tif: 'Ioc' } } }],
      grouping: 'na'
    });
    const result = { entry: entry, size: size, px: px, assetIndex: ai.index, mid: mid };

    const triggers = [];
    if (opts.takeProfit != null) {
      const tp = roundPrice(opts.takeProfit, ai.szDecimals);
      triggers.push({ a: ai.index, b: !isBuy, p: norm(tp), s: norm(size), r: true, t: { trigger: { isMarket: true, triggerPx: norm(tp), tpsl: 'tp' } } });
    }
    if (opts.stopLoss != null) {
      const sl = roundPrice(opts.stopLoss, ai.szDecimals);
      triggers.push({ a: ai.index, b: !isBuy, p: norm(sl), s: norm(size), r: true, t: { trigger: { isMarket: true, triggerPx: norm(sl), tpsl: 'sl' } } });
    }
    if (triggers.length) {
      try { result.tpsl = await exch.order({ orders: triggers, grouping: 'na' }); } catch (e) { result.tpslError = e.message; }
    }
    return result;
  }
};

document.dispatchEvent(new Event('rynix:hl-ready'));
