# Breakout watch
Set a background task that acts when price leaves a range.

1. `proposeDrawing` with kind `range` (or `levels`) to get the range high and low from real bars.
2. `scheduleTask` with two price conditions, or one, as the user asks: above the high, below the low.
3. The task instruction says exactly what to do when it fires, for example: "confirm with volume on the last bar, then place a paper buy sized by the position-sizing skill with the stop at the range midpoint".
4. Keep `maxRuns` at 1 unless the user wants repeats. Tell the user the levels and when the task expires.
