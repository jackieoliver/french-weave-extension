# Model eval, 2026-09-19 (Level 1, 10 tweets, prompt.md)

| Model | Latency | JSON | Density | Traps (so-intensifier / "Well," / health / band name / code) | Verdict |
|---|---|---|---|---|---|
| Sonnet 5 (via Claude Code) | ~5s | ok | 1 per tweet | ok / ok / ok / hit / ok | reference quality |
| Haiku 4.5 (via Claude Code) | ~5s | ok | 3 per tweet on #7, #10 (too dense) | "so"->très (fine) / ok / ok / hit / ok | too dense |
| Gemini 3.1 Flash-Lite | 2.8s | ok | 3 on #7, 2 on #10 | ok / ok / ok / hit / ok | dense |
| Gemini 3.5 Flash-Lite, no schema | 1.1s | BROKEN | ok | ok / ok / ok / ok / ok | invalid output |
| Gemini 3.5 Flash-Lite + responseSchema (3 runs) | 1.1-1.3s | ok x3 | max 2 per tweet | ok / ok / ok / ok / ok | **best cheap** |
| Gemini 3.8 Flash | 503 both tries | - | - | - | untested |
| DeepSeek V4.1 Flash, GPT-5.4 nano | needs OpenRouter key (Mac offline) | - | - | - | untested |

Tokens per 10 tweets: ~625 in, ~200 out. Flash-Lite at $0.30/$2.50 per M => ~$0.0007 per 10 tweets.
Decision: default gemini-3.5-flash-lite with strict JSON schema; Sonnet 5 as optional "premium" model.
