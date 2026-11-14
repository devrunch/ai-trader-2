# News and chatter sources (AG-9)

Every source is an adapter in `apps/api/src/modules/news` (or `research`), called only through `SourceClient`. What we take from each: the headline, a link back, a short summary, and the publish time. Nothing is republished beyond that.

| Source | Endpoint | Basis |
|---|---|---|
| Publisher RSS (ET, Mint, BS, CNBC-TV18, BusinessLine, CNBC, MarketWatch, OilPrice, CoinDesk, Cointelegraph, FXStreet, Investing.com) | each publisher's public RSS URL | Offered for syndication; headline, link and summary only, one request per 5 minutes, linked to the publisher. **Verify each URL and its terms on first live run; hand-written fixtures only.** |
| Yahoo Finance per-ticker RSS | `feeds.finance.yahoo.com/rss/2.0/headline?s=<ticker>` | Public RSS; six tickers per run in rotation. Not an official API: it may change without notice. |
| newsdata.io | `/api/1/latest`, own key, free plan | Free plan permits personal use; attribution kept in `source`. |
| Alpha Vantage | `NEWS_SENTIMENT`, own key, free plan | 25 requests a day; vendor sentiment not used. |
| Reddit | `reddit.com/r/<sub>/hot.json`, no login | Public listing, our own User-Agent, four requests every ten minutes; title and link only. Reddit's terms restrict commercial use of its data: fine for this personal tool, revisit before any public launch. |
| Hugging Face Inference (FinBERT) | `api-inference.huggingface.co/models/<FINBERT_MODEL>` | Own token, free tier; headline text only. FinBERT (ProsusAI/finbert) is Apache-2.0. |
| Tavily | `api.tavily.com/search`, own key | Query text only; results shown with title and link. |
