/** Template for "New Pine script": valid for the runtime, one input and one plot. */
export const PINE_STARTER = `//@version=6
indicator("My indicator", overlay=false)
length = input.int(14, "Length", minval=1)
plot(ta.sma(close, length), "SMA")
`;
