# Breakout watch
Keep an eye on a range and act when price leaves it.
Needs: bars to find the range, and the live price.

1. Load `chart` with `loadTools` first. `proposeDrawing` with kind `range` (or `levels`) to get the range high and low from real bars.
2. Load `execution` with `loadTools`. `scheduleTask` with two price conditions, or one, as the user asks: above the high, below the low. For a single price move, `watchMove` or `createAlert` may be enough.
3. The task instruction says exactly what to do when it fires, for example: "confirm with volume on the last bar, then place a paper buy sized by the position-sizing playbook with the stop at the range midpoint".
4. Keep `maxRuns` at 1 unless the user wants repeats. Tell the user the levels and when the task expires. Use `listTasks` to show what is running and `cancelTask` to stop it.
Paper only; the task never reaches a broker.
