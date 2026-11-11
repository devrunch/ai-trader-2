/** Timing budgets. They run alone in test:perf, one file at a time: parallel suites on one machine skew them. */
export const PERF_TESTS = /100,000 instruments|Pine ticks p95 within 10 ms|reads 5,000 5m bars within 800 ms|uncached p95 under 100 ms/;
/** Every other test: the parallel unit and integration runs filter the budgets out by name. */
export const NOT_PERF_TESTS = new RegExp(`^(?!.*(?:${PERF_TESTS.source}))`);
