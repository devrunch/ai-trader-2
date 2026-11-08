import json
import sys

import pandas as pd
import pandas_ta as ta

base = sys.argv[1]
df = pd.read_csv(f"{base}/bars.csv")
vals = json.load(open(f"{base}/engine-values.json"))
pine = vals["pine"]

ours = {
    "rsi": ta.rsi(df["close"], length=14),
    "ema": ta.ema(df["close"], length=20),
    "atr": ta.atr(df["high"], df["low"], df["close"], length=14),
    "macd": ta.macd(df["close"], 12, 26, 9).iloc[:, 0],
    "bbu": ta.bbands(df["close"], length=20, std=2).filter(like="BBU").iloc[:, 0],
    "st": ta.supertrend(df["high"], df["low"], df["close"], length=10, multiplier=3).iloc[:, 0],
}

for k, s in ours.items():
    p = pd.Series(pine[k], dtype="float64")
    both = s.notna() & p.notna()
    d_all = (s[both] - p[both]).abs()
    late = both & (s.index >= 300)
    d_late = (s[late] - p[late]).abs()
    print(f"pandas-ta vs PineTS {k:5s}: compared {int(both.sum()):5d}  max diff {d_all.max():.6g}  "
          f"after warm-up(300) max diff {d_late.max():.6g}")
