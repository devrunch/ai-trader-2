# Third-party skill packs

The day-trader skills (`apps/api/src/modules/agent/prompts/skill-day-trader.md`, `skill-dt-*.md`) are adapted from these MIT-licensed packs, rewritten to use this app's tools instead of the packs' Python scripts:

- day-trader-skill, https://github.com/Jakeschincariol/day-trader-skill, commit 3d0f4ef (2026-10-20)
- trader-skills-india, https://github.com/ankurgoels/trader-skills-india, commit a42eae9 (2026-10-30)

## day-trader-skill licence

```
MIT License

Copyright (c) 2026 Jake Schincariol

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## trader-skills-india licence

```
MIT License

Copyright (c) 2026 Jake Schincariol (day-trader-skill, the work this one is derived from)
Copyright (c) 2026 trader-skills-india contributors (changes for the Indian market)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Trading skill packs added 2026-11-12 (AG-1)

Rewritten to use this app's tools only; no upstream scripts, data feeds or order templates are carried over (FR-AG-7). Paper trading only.

| Pack | Licence | Commit | Skills |
|---|---|---|---|
| https://github.com/tradermonty/claude-trading-skills | MIT, Copyright (c) 2026 TraderMonty | 6202e67 (2026-11-12) | `vcp-setup`, `breakout-trade-plan`, `momentum-burst`, `earnings-reaction`, `backtest-review` |
| https://github.com/SKE-Labs/agent-trading-skills | Apache-2.0 (no copyright holder stated in the repo; author `ske-labs`) | b14565f (2026-07-18) | `breakout-trading`, `gap-trading`, `pullback-trading`, `momentum-trading` |
| https://github.com/anthropics/financial-services | Apache-2.0 (no copyright holder stated in the repo) | 6056506 (2026-10-28) | `sector-overview`, `idea-screen` |

The Apache-2.0 text is in `docs/third-party/LICENSE-Apache-2.0.txt`. The two Apache packs have no NOTICE file. These skills are changed from the originals (paraphrased and re-targeted to this app's tools).

### tradermonty/claude-trading-skills licence

```
MIT License

Copyright (c) 2026 TraderMonty

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Trading desk pattern (AG-5)

The multi-role trading desk (analysts, bull/bear debate, trader, risk manager) follows the pattern of TradingAgents. The pattern only: the code is written natively on this app's own services and prompts; none of the Python is vendored.

- Paper: Xiao, Sun, Luo, Wang, "TradingAgents: Multi-Agents LLM Financial Trading Framework", arXiv:2412.20138 (2024).
- Repository: https://github.com/TauricResearch/TradingAgents, Apache-2.0 (licence text in `docs/third-party/LICENSE-Apache-2.0.txt`), checked at commit 9fa1196 (2026-11-04).

## Market skills written in-house (AG-10)

`risk-atr-correlation`, `macro-fx-carry`, `event-surprise-playbook`, `commodities-crude-gold`, `crypto-24x7`, `us-earnings`, `india-fno-expiry`, `india-gap-playbook`, `screener-ideas` are our own text, written for this app's tools. No upstream pack is vendored for them, so there is no licence or commit to pin. A `Markets:` line in a skill file sets its group in `listSkills`.
