import type { ChartConfiguration } from 'chart.js';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import type { StarDataPoint } from './star-history.ts';

/**
 * Configuration for the chart canvas
 */
const CHART_WIDTH = 1200;
const CHART_HEIGHT = 600;

/**
 * Generates a PNG buffer containing a line chart of star history.
 *
 * This function creates a chart styled similar to star-history.com:
 * - Line chart showing cumulative stars over time
 * - Clean, modern styling
 * - Formatted date labels on x-axis
 * - Star count on y-axis
 *
 * @param dataPoints - Array of star history data points
 * @param repoName - Full repository name (owner/repo) for the chart title
 * @returns Promise that resolves to a Buffer containing the PNG image
 */
export async function generateStarHistoryChart(
	dataPoints: StarDataPoint[],
	repoName: string
): Promise<Buffer> {
	// Initialize the canvas renderer
	const chartJSNodeCanvas = new ChartJSNodeCanvas({
		width: CHART_WIDTH,
		height: CHART_HEIGHT,
		backgroundColour: 'white',
	});

	// Prepare data for Chart.js
	const labels = dataPoints.map((point) => point.date);
	const data = dataPoints.map((point) => point.count);

	// Configure the chart
	const configuration: ChartConfiguration = {
		type: 'line',
		data: {
			labels,
			datasets: [
				{
					label: 'GitHub Stars',
					data,
					borderColor: 'rgb(75, 192, 192)',
					backgroundColor: 'rgba(75, 192, 192, 0.1)',
					borderWidth: 2,
					fill: true,
					tension: 0.4, // Smooth curve
					pointRadius: 0, // Hide individual points for cleaner look
					pointHoverRadius: 5,
				},
			],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				title: {
					display: true,
					text: `Star History for ${repoName}`,
					font: {
						size: 20,
						weight: 'bold',
					},
					padding: 20,
				},
				legend: {
					display: true,
					position: 'top',
				},
				tooltip: {
					mode: 'index',
					intersect: false,
					callbacks: {
						title: (context) => {
							const date = new Date(context[0].parsed.x ?? 0);
							return date.toLocaleDateString('en-US', {
								year: 'numeric',
								month: 'short',
								day: 'numeric',
							});
						},
						label: (context) => {
							return `Stars: ${(context.parsed.y ?? 0).toLocaleString()}`;
						},
					},
				},
			},
			scales: {
				x: {
					type: 'time',
					time: {
						unit: 'month',
						displayFormats: {
							month: 'MMM yyyy',
						},
					},
					title: {
						display: true,
						text: 'Date',
						font: {
							size: 14,
							weight: 'bold',
						},
					},
					grid: {
						display: true,
						color: 'rgba(0, 0, 0, 0.05)',
					},
				},
				y: {
					beginAtZero: true,
					title: {
						display: true,
						text: 'Total Stars',
						font: {
							size: 14,
							weight: 'bold',
						},
					},
					grid: {
						display: true,
						color: 'rgba(0, 0, 0, 0.05)',
					},
					ticks: {
						callback: (value) => {
							// Format large numbers with K/M suffixes
							if (typeof value === 'number') {
								if (value >= 1000000) {
									return `${(value / 1000000).toFixed(1)}M`;
								}
								if (value >= 1000) {
									return `${(value / 1000).toFixed(1)}K`;
								}
								return value.toString();
							}
							return value;
						},
					},
				},
			},
			interaction: {
				mode: 'nearest',
				axis: 'x',
				intersect: false,
			},
		},
		plugins: [
			{
				id: 'customCanvasBackgroundColor',
				beforeDraw: (chart) => {
					const ctx = chart.canvas.getContext('2d');
					if (ctx) {
						ctx.save();
						ctx.globalCompositeOperation = 'destination-over';
						ctx.fillStyle = 'white';
						ctx.fillRect(0, 0, chart.width, chart.height);
						ctx.restore();
					}
				},
			},
		],
	};

	// Generate the chart as a PNG buffer
	const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
	return buffer;
}
