/** Popular models that users can download from the catalogue. */
export const CATALOGUE_MODELS = [
  { id: 'qwen3.5:0.8b', size: '~1 GB', desc: 'Qwen 3.5 0.8B — fast, lightweight' },
  { id: 'qwen3.5:2b', size: '~2.7 GB', desc: 'Qwen 3.5 2B' },
  { id: 'qwen3.5:4b', size: '~3.4 GB', desc: 'Qwen 3.5 4B — recommended default' },
  { id: 'qwen3.5:9b', size: '~6.6 GB', desc: 'Qwen 3.5 9B' },
  { id: 'qwen3.5:27b', size: '~17 GB', desc: 'Qwen 3.5 27B' },
  { id: 'qwen3.5:35b', size: '~24 GB', desc: 'Qwen 3.5 35B' },
  { id: 'qwen3.5:122b', size: '~81 GB', desc: 'Qwen 3.5 122B — largest' },
  { id: 'llama3.3:latest', size: '~4.9 GB', desc: 'Llama 3.3 8B' },
  { id: 'mistral:latest', size: '~4.1 GB', desc: 'Mistral 7B' },
  { id: 'gemma3:latest', size: '~3.3 GB', desc: 'Gemma 3 4B' },
  { id: 'deepseek-r1:7b', size: '~4.7 GB', desc: 'DeepSeek R1 7B' },
  { id: 'phi4:latest', size: '~9.1 GB', desc: 'Phi-4 14B' },
];

/** Cloud provider definitions */
export interface CloudProvider {
  name: string;
  envKey: string;
  models: Array<{ id: string; desc: string }>;
}

export const CLOUD_PROVIDERS: CloudProvider[] = [
  {
    name: 'NVIDIA NIM (Free Hosted)',
    envKey: 'NIM_API_KEY',
    models: [
      { id: 'nvidia/nemotron-3-ultra-550b-a55b', desc: 'Nemotron 3 Ultra 550B — Flagship frontier reasoning' },
      { id: 'nvidia/nemotron-3.5-super-vl-120b-a12b', desc: 'Nemotron 3.5 Super VL 120B — High-capacity vision-language' },
      { id: 'minimaxai/minimax-m3.1-flash', desc: 'MiniMax M3.1 Flash — High-speed conversational & agentic (Intel 29)' },
      { id: 'meta/muse-glimmer-30b', desc: 'Muse Glimmer 30B — Multimodal reasoning with native tool calling' },
      { id: 'nvidia/nemotron-3.5-lightning-30b-a3b', desc: 'Nemotron 3.5 Lightning 30B — Fast MoE architecture' },
      { id: 'nvidia/nemotron-3.5-bolt-e4b', desc: 'Nemotron 3.5 Bolt E4B — Compact reasoning & agentic chat' },
      { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', desc: 'Nemotron 3 Nano 30B — Omni chain-of-thought reasoning' },
      { id: 'moonshotai/kimi-k3.1-pro', desc: 'Kimi K3.1 Pro — 3T-class 1M context agentic model (Intel 46)' },
      { id: 'z-ai/glm-5.3-flash', desc: 'GLM 5.3 Flash — Multimodal MoE with MLA attention (Intel 28)' },
      { id: 'mistralai/mistral-large-4-1t-a52b', desc: 'Mistral Large 4 — 1T/52B-active MoE reasoning (Intel 26)' },
    ],
  },
  {
    name: 'Groq (Free Ultra-Fast)',
    envKey: 'GROQ_API_KEY',
    models: [
      { id: 'groq/openai/gpt-oss-120b', desc: 'GPT-OSS 120B — Flagship open reasoning on Groq' },
      { id: 'groq/qwen/qwen3.8-27b', desc: 'Qwen 3.8 27B — Multimodal & deep reasoning' },
      { id: 'groq/openai/gpt-oss-20b', desc: 'GPT-OSS 20B — Hyper-fast (~1000 tps) reasoning' },
      { id: 'groq/allam-2-7b', desc: 'Allam 2 7B — Ultra-lightweight conversational' },
    ],
  },
  {
    name: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    models: [
      { id: 'gpt-4o', desc: 'GPT-4o — fast, multimodal' },
      { id: 'gpt-4o-mini', desc: 'GPT-4o Mini — cheap, fast' },
      { id: 'o3-mini', desc: 'o3-mini — reasoning' },
    ],
  },
  {
    name: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    models: [
      { id: 'claude-sonnet-4-6', desc: 'Claude Sonnet 4.6 — balanced' },
      { id: 'claude-opus-4-6', desc: 'Claude Opus 4.6 — most capable' },
      { id: 'claude-haiku-4-5', desc: 'Claude Haiku 4.5 — fastest' },
    ],
  },
  {
    name: 'Google',
    envKey: 'GEMINI_API_KEY',
    models: [
      { id: 'gemini-3.8-flash', desc: 'Gemini 3.8 Flash — fast' },
      { id: 'gemini-3.1-pro-preview', desc: 'Gemini 3.1 Pro Preview — reasoning' },
      { id: 'gemini-3.1-flash-lite', desc: 'Gemini 3.1 Flash Lite — lightweight' },
    ],
  },
  {
    name: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    models: [
      { id: 'openrouter/auto', desc: 'Auto — best model for the task' },
      { id: 'openrouter/anthropic/claude-sonnet-4.5', desc: 'Claude Sonnet 4.5 via OpenRouter' },
      { id: 'openrouter/deepseek/deepseek-r1-0528', desc: 'DeepSeek R1 via OpenRouter' },
    ],
  },
  {
    name: 'Atlas Cloud',
    envKey: 'ATLASCLOUD_API_KEY',
    models: [
      { id: 'atlascloud/openai/gpt-4.1-mini', desc: 'GPT-4.1 Mini via Atlas Cloud' },
      { id: 'atlascloud/deepseek-ai/deepseek-v3.2', desc: 'DeepSeek V3.2 via Atlas Cloud' },
      { id: 'atlascloud/Qwen/Qwen3-235B-A22B-Instruct-2507', desc: 'Qwen3 235B via Atlas Cloud' },
    ],
  },
];
