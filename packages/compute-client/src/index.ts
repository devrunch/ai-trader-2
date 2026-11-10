export type {
  BacktestRequest, BacktestResponse, Bar, Compare, Condition, Costs, EquityPoint, ErrorBody, Level, Metrics, Operand,
  Segment, Strategy, Trade,
} from './generated/types.gen.js';
export { ComputeHttpError, ComputeResponseError, createComputeClient } from './client.js';
export type { CallOptions, ComputeClient, ComputeClientOptions } from './client.js';
