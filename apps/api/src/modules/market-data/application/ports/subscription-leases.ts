export interface SubscriptionLeases {
  add(instrumentId: string): Promise<void>;
  remove(instrumentId: string): Promise<void>;
  removeAll(): Promise<void>;
}
