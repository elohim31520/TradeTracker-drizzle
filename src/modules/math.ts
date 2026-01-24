export function calculateMean(values: number[]): number {
	const sum = values.reduce((acc, val) => acc + val, 0)
	return sum / values.length
}

export function calculateStdDev(values: number[], mean: number): number {
	const squaredDiffs = values.map((val) => (val - mean) ** 2)
	const avgSquaredDiff = calculateMean(squaredDiffs)
	return Math.sqrt(avgSquaredDiff)
}

export function calculateCorrelation(valuesX: number[], valuesY: number[]): number {
	const meanX = calculateMean(valuesX)
	const meanY = calculateMean(valuesY)
	const numerator = valuesX.reduce((sum, x, i) => sum + (x - meanX) * (valuesY[i] - meanY), 0)
	const denomX = Math.sqrt(valuesX.reduce((sum, x) => sum + (x - meanX) ** 2, 0))
	const denomY = Math.sqrt(valuesY.reduce((sum, y) => sum + (y - meanY) ** 2, 0))
	return numerator / (denomX * denomY) || 0
}
