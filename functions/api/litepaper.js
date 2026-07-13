export async function onRequest(context) {
  const request = context.request;
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  const data = {
    title: "Rynix AI Litepaper",
    updatedAt: Date.now(),
    sections: [
      {
        title: "Abstract",
        heading: "What is Rynix AI?",
        body: [
          "Rynix AI is an autonomous, natural-language powered trading interface for the HyperLiquid ecosystem and broader EVM markets. Users describe what they want to do in plain English and Rynix AI translates intent into on-chain actions, monitors positions, and executes strategies around the clock.",
          "The protocol combines an LLM intent layer, a deterministic execution engine, and an autonomous compute network (ACP) so that trades, automations, and theses can run without manual intervention."
        ],
        bullets: [
          "Vibe trading: think it, say it, trade it.",
          "24/7 autonomous monitoring and execution.",
          "Portfolio-aware risk management and retry logic."
        ]
      },
      {
        title: "Architecture",
        heading: "Agent + Execution Stack",
        body: [
          "Rynix AI is split into three layers: the Intent Layer, the Agent Layer, and the Execution Layer.",
          "The Intent Layer parses natural language, identifies assets, quantities, and conditions, then outputs a structured trading plan. The Agent Layer validates the plan against market data, user portfolio, and risk parameters. The Execution Layer signs and submits transactions through HyperLiquid, EVM wallets, or whitelisted DEX aggregators."
        ],
        bullets: [
          "Intent parsing: symbol detection, quantity extraction, side classification.",
          "Live price feeds: CoinGecko, HyperLiquid, and on-chain oracles.",
          "Secure execution: wallet signatures, smart retries, error handling."
        ]
      },
      {
        title: "Autonomous Compute Protocol",
        heading: "ACP Network",
        body: [
          "The Autonomous Compute Protocol (ACP) allows Rynix AI agents to receive jobs from other agents, DAOs, and protocols. A job is a structured request containing a trading objective, constraints, and settlement rules.",
          "Agent nodes validate job feasibility, execute according to the defined rules, and submit proof of execution. The network is designed to be permissioned during the launch phase and progressively decentralised."
        ],
        bullets: [
          "Job queue for cross-agent tasks.",
          "Proof-of-execution and reputation scoring.",
          "Settlement via smart contracts or HyperLiquid clearing."
        ]
      },
      {
        title: "Tokenomics",
        heading: "$RYNIX Token",
        body: [
          "The $RYNIX token is the native utility and governance token of the Rynix AI ecosystem. It is used to pay execution fees, access premium agent strategies, stake for ACP node eligibility, and vote on protocol upgrades.",
          "A portion of protocol fees is directed to the treasury and used to reward stakers, operators, and contributors."
        ],
        bullets: [
          "Total supply: 1,000,000,000 $RYNIX.",
          "Fee sharing for stakers and node operators.",
          "Governance over agent parameters and fee schedules."
        ]
      },
      {
        title: "Governance",
        heading: "Decentralised Governance",
        body: [
          "Rynix AI governance is token-weighted. $RYNIX holders can propose and vote on protocol upgrades, new agent strategies, fee changes, and treasury allocations.",
          "The protocol starts with a core team multisig and transitions to on-chain governance as the agent network matures."
        ],
        bullets: [
          "On-chain proposals and voting.",
          "Multisig guardrails during the launch phase.",
          "Transparent treasury and fee distribution."
        ]
      },
      {
        title: "Roadmap",
        heading: "Development Timeline",
        body: [
          "The Rynix AI roadmap is split into four phases: Launch, Expansion, Autonomy, and Decentralisation."
        ],
        bullets: [
          "Phase 1 — Launch: chatbot trading, price feeds, wallet integration, and litepaper.",
          "Phase 2 — Expansion: terminal UI, advanced automations, multi-asset support, and ACP beta.",
          "Phase 3 — Autonomy: full self-custody automations, strategy marketplace, and agent-to-agent jobs.",
          "Phase 4 — Decentralisation: on-chain governance, permissionless ACP nodes, and DAO treasury."
        ]
      }
    ]
  };

  return new Response(JSON.stringify(data), { status: 200, headers });
}
