class QuickStats {
    /**
     * @param {number[]} series
     * @returns {string}
     */
    static makeSvg(series) {
        // Normalize
        const min = Math.min.apply(Math, series);
        const max = Math.max.apply(Math, series);
        const spread = max - min;
        const scale = QuickStats.SVG_HEIGHT / spread;

        console.log(min, max, spread, scale);

        const normalizedSeries = series.map(value => (value - min) * scale);

        // Invert values (SVG coord system has 0 on top)
        const invertedSeries = normalizedSeries.map(value => -value + QuickStats.SVG_HEIGHT);

        // Draw
        const path = invertedSeries.map((value, index) => `${index * QuickStats.SVG_STEP},${value}`).join(' ');

        const width = QuickStats.SVG_WIDTH + 2 * QuickStats.SVG_PADDING;
        const height = QuickStats.SVG_HEIGHT + 2 * QuickStats.SVG_PADDING;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg"
            viewBox="-${QuickStats.SVG_PADDING} -${QuickStats.SVG_PADDING} ${width} ${height}"
            width="${width}"
            height="${height}">
            <path
                d="M ${path}"
                fill="none"
                stroke="black"
                stroke-width="4"
                stroke-linecap="round"
                stroke-linejoin="round" />
        </svg>`;

        return svg;
    }
}

QuickStats.SVG_HEIGHT = 40;
QuickStats.SVG_WIDTH = 120;
QuickStats.SVG_STEP = 20;
QuickStats.SVG_PADDING = 3;
