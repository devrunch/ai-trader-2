/** The page was fetched but no ratios could be read from it: the markup changed or a login wall was served. Never reported as an empty company. */
export class FundamentalsParseError extends Error {
  readonly code = 'FUNDAMENTALS_PARSE';
  override readonly name = 'FundamentalsParseError';
}

/** The source has no company under this ticker. */
export class FundamentalsNotFoundError extends Error {
  readonly code = 'NOT_FOUND';
  override readonly name = 'FundamentalsNotFoundError';
}
