// data-loader.js (исправленная версия с автоматической загрузкой из GitHub)
class DataLoader {
    constructor() {
        this.data = null;
        this.normalizedData = null;
        this.X_train = null;
        this.y_train = null;
        this.X_test = null;
        this.y_test = null;
        this.min = null;
        this.max = null;
        this.dateLabels = [];
        this.returns = [];
        this.trainIndices = [];
        this.testIndices = [];
        this.dataUrl = 'https://raw.githubusercontent.com/buschevapoly-del/again/main/my_data.csv';
    }

    async loadCSVFromGitHub() {
        try {
            this.updateStatus('dataStatus', 'Loading data from GitHub...', 'info');
            
            const response = await fetch(this.dataUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const content = await response.text();
            this.parseCSV(content);
            
            return this.data;
        } catch (error) {
            throw new Error(`Failed to load data from GitHub: ${error.message}`);
        }
    }

    parseCSV(content) {
        const lines = content.trim().split('\n');
        const parsedData = [];
        this.dateLabels = [];
        this.returns = [];

        // Skip header and parse lines
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Handle semicolon separated values
            const parts = line.split(';');
            
            if (parts.length >= 2) {
                const dateStr = parts[0].trim();
                const price = parseFloat(parts[1].trim());
                
                if (!isNaN(price) && price > 0) {
                    parsedData.push({ date: dateStr, price: price });
                    this.dateLabels.push(dateStr);
                }
            }
        }

        // Sort by date
        parsedData.sort((a, b) => {
            const dateA = this.parseDate(a.date);
            const dateB = this.parseDate(b.date);
            return dateA - dateB;
        });
        
        // Calculate returns
        for (let i = 1; i < parsedData.length; i++) {
            const ret = (parsedData[i].price - parsedData[i-1].price) / parsedData[i-1].price;
            this.returns.push(ret);
        }

        this.data = parsedData;
        
        if (this.data.length < 65) {
            throw new Error(`Insufficient data. Need at least 65 days, got ${this.data.length}`);
        }
    }

    parseDate(dateStr) {
        // Parse date in format DD.MM.YYYY
        const parts = dateStr.split('.');
        if (parts.length === 3) {
            return new Date(parts[2], parts[1] - 1, parts[0]);
        }
        return new Date(dateStr);
    }

    prepareData(windowSize = 60, predictionHorizon = 5, testSplit = 0.2) {
        if (!this.returns || this.returns.length === 0) {
            throw new Error('No data available. Load CSV first.');
        }

        const totalSamples = this.returns.length - windowSize - predictionHorizon + 1;
        
        if (totalSamples <= 0) {
            throw new Error('Not enough data for the specified window size and prediction horizon');
        }

        // Normalize returns
        this.normalizeReturns();

        // Create sequences
        const sequences = [];
        const targets = [];

        for (let i = 0; i < totalSamples; i++) {
            const seq = this.normalizedData.slice(i, i + windowSize);
            const target = this.normalizedData.slice(i + windowSize, i + windowSize + predictionHorizon);
            
            sequences.push(seq);
            targets.push(target);
        }

        // Split chronologically
        const splitIdx = Math.floor(sequences.length * (1 - testSplit));
        this.trainIndices = Array.from({ length: splitIdx }, (_, i) => i);
        this.testIndices = Array.from({ length: sequences.length - splitIdx }, (_, i) => i + splitIdx);

        // Convert to tensors - исправлено для tensor3d
        const trainSequences = sequences.slice(0, splitIdx);
        const testSequences = sequences.slice(splitIdx);
        
        // Преобразуем для tensor3d: [[[val1], [val2], ...], ...]
        const trainSequences3D = trainSequences.map(seq => seq.map(val => [val]));
        const testSequences3D = testSequences.map(seq => seq.map(val => [val]));

        this.X_train = tf.tensor3d(
            trainSequences3D,
            [splitIdx, windowSize, 1]
        );
        
        this.y_train = tf.tensor2d(
            targets.slice(0, splitIdx),
            [splitIdx, predictionHorizon]
        );

        this.X_test = tf.tensor3d(
            testSequences3D,
            [sequences.length - splitIdx, windowSize, 1]
        );
        
        this.y_test = tf.tensor2d(
            targets.slice(splitIdx),
            [sequences.length - splitIdx, predictionHorizon]
        );

        console.log(`Created ${sequences.length} samples: ${splitIdx} train, ${sequences.length - splitIdx} test`);
        console.log(`X_train shape: ${this.X_train.shape}`);
        console.log(`y_train shape: ${this.y_train.shape}`);
    }

    normalizeReturns() {
        if (!this.returns || this.returns.length === 0) {
            throw new Error('No returns data available');
        }

        this.min = Math.min(...this.returns);
        this.max = Math.max(...this.returns);
        
        // Avoid division by zero
        const range = this.max - this.min || 1;
        
        this.normalizedData = this.returns.map(ret => 
            (ret - this.min) / range
        );
    }

    denormalize(value) {
        if (this.min === null || this.max === null) {
            throw new Error('Normalization parameters not available');
        }
        const range = this.max - this.min || 1;
        return value * range + this.min;
    }

    getHistoricalData() {
        if (!this.data) return null;
        
        return {
            dates: this.dateLabels,
            prices: this.data.map(d => d.price),
            returns: this.returns,
            normalizedReturns: this.normalizedData || []
        };
    }

    getDataSummary() {
        if (!this.data) return null;
        
        return {
            totalDays: this.data.length,
            dateRange: `${this.data[0].date} to ${this.data[this.data.length - 1].date}`,
            priceRange: {
                min: Math.min(...this.data.map(d => d.price)),
                max: Math.max(...this.data.map(d => d.price)),
                last: this.data[this.data.length - 1].price
            },
            returnsStats: {
                min: Math.min(...this.returns),
                max: Math.max(...this.returns),
                mean: this.returns.reduce((a, b) => a + b, 0) / this.returns.length,
                std: Math.sqrt(this.returns.reduce((sq, n) => sq + Math.pow(n - this.returns.reduce((a, b) => a + b, 0) / this.returns.length, 2), 0) / this.returns.length)
            }
        };
    }

    updateStatus(elementId, message, type = 'info') {
        console.log(`${type}: ${message}`);
    }

    dispose() {
        if (this.X_train) this.X_train.dispose();
        if (this.y_train) this.y_train.dispose();
        if (this.X_test) this.X_test.dispose();
        if (this.y_test) this.y_test.dispose();
        
        this.X_train = null;
        this.y_train = null;
        this.X_test = null;
        this.y_test = null;
        this.normalizedData = null;
    }
}

export { DataLoader };
