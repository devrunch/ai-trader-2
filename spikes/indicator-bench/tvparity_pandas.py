import json, sys
import pandas as pd
import pandas_ta as ta
base = sys.argv[1]
r1, r2, r3 = (json.load(open(f"{base}/tv-r{i}.json")) for i in (1, 2, 3))
df = pd.DataFrame([b[:6] for b in r1["bars"]], columns=["t", "open", "high", "low", "close", "volume"])
def tv(d, prefix, col):
    rows = next(v for k, v in d["studies"].items() if k.startswith(prefix))
    m = {r[0]: r[col] for r in rows}
    return pd.Series([m.get(t) for t in df["t"]], dtype="float64")
bb = ta.bbands(df["close"], length=20, std=2)
mac = ta.macd(df["close"], 12, 26, 9)
ours = {
    "rsi": (ta.rsi(df["close"], length=14), tv(r1, "RSI", 1)),
    "atr": (ta.atr(df["high"], df["low"], df["close"], length=14), tv(r1, "ATR", 1)),
    "macd": (mac.iloc[:, 0], tv(r2, "MACD", 2)),
    "bbUpper": (bb.filter(like="BBU").iloc[:, 0], tv(r2, "BB", 2)),
    "ema": (ta.ema(df["close"], length=20), tv(r3, "EMA", 1)),
}
for k, (a, b) in ours.items():
    ok = a.notna() & b.notna() & (a.index >= 300)
    print(f"pandas-ta vs TradingView {k:8s}: max diff {(a[ok] - b[ok]).abs().max():.4g} over {int(ok.sum())} bars")
