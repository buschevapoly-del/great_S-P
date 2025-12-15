// app.js
import { DataLoader } from './data-loader.js';
import { GRUModel } from './gru.js';

class StockPredictorApp {
    constructor() {
        this.dataLoader = new DataLoader();
        this.model = new GRUModel();
        this.historicalChart = null;
        this.predictionChart = null;
        this.isTraining = false;
        this.predictions = null;
        
        this.initUI();
        this.setupEventListeners();
        
        // Автоматически загружаем данные при запуске
        this.autoLoadData();
    }

    initUI() {
        document.getElementById('dataStatus').textContent = 'Automatically loading data from GitHub...';
        document.getElementById('trainingStatus').textContent = 'Model ready';
    }

    setupEventListeners() {
        document.getElementById('loadDataBtn').addEventListener('click', () => {
            this.loadData();
        });

        document.getElementById('viewDataBtn').addEventListener('click', () => {
            this.displayHistoricalData();
        });

        document.getElementById('trainBtn').addEventListener('click', async () => {
            const epochs = parseInt(document.getElementById('epochs').value);
            await this.trainModel(epochs);
        });

        document.getElementById('predictBtn').addEventListener('click', () => {
            this.makePredictions();
        });
    }

    async autoLoadData() {
        try {
            this.updateStatus('dataStatus', '📥 Loading data from GitHub repository...', 'info');
            
            await this.dataLoader.loadCSVFromGitHub();
            this.dataLoader.prepareData();
            
            document.getElementById('viewDataBtn').disabled = false;
            document.getElementById('trainBtn').disabled = false;
            document.getElementById('loadDataBtn').textContent = '🔄 Reload Data';
            
            const summary = this.dataLoader.getDataSummary();
            this.updateStatus('dataStatus', 
                `✅ Data loaded successfully from GitHub! ${summary.totalDays} days, ${summary.dateRange}. Last price: $${summary.priceRange.last.toFixed(2)}`,
                'success'
            );
            
            this.displayDataSummary(summary);
            
            setTimeout(() => {
                this.displayHistoricalData();
            }, 500);
            
        } catch (error) {
            this.updateStatus('dataStatus', `❌ Error loading data: ${error.message}`, 'error');
            console.error('Data loading error:', error);
        }
    }

    async loadData() {
        try {
            this.updateStatus('dataStatus', 'Reloading data from GitHub...', 'info');
            
            this.dataLoader.dispose();
            this.model.dispose();
            this.predictions = null;
            
            await this.dataLoader.loadCSVFromGitHub();
            this.dataLoader.prepareData();
            
            const summary = this.dataLoader.getDataSummary();
            this.updateStatus('dataStatus', 
                `✅ Data reloaded! ${summary.totalDays} days, ${summary.dateRange}`,
                'success'
            );
            
            this.displayDataSummary(summary);
            this.displayHistoricalData();
            
        } catch (error) {
            this.updateStatus('dataStatus', `❌ Error: ${error.message}`, 'error');
            console.error('Data loading error:', error);
        }
    }

    displayDataSummary(summary) {
        const metricsContainer = document.getElementById('metricsContainer');
        metricsContainer.innerHTML = '';
        metricsContainer.style.display = 'grid';
        
        const metrics = [
            { label: 'Total Days', value: summary.totalDays },
            { label: 'Start Date', value: summary.dateRange.split(' to ')[0] },
            { label: 'End Date', value: summary.dateRange.split(' to ')[1] },
            { label: 'Min Price', value: `$${summary.priceRange.min.toFixed(2)}` },
            { label: 'Max Price', value: `$${summary.priceRange.max.toFixed(2)}` },
            { label: 'Last Price', value: `$${summary.priceRange.last.toFixed(2)}` },
            { label: 'Mean Return', value: (summary.returnsStats.mean * 100).toFixed(4) + '%' },
            { label: 'Return Std', value: (summary.returnsStats.std * 100).toFixed(4) + '%' }
        ];
        
        metrics.forEach(metric => {
            const metricCard = document.createElement('div');
            metricCard.className = 'metric-card';
            metricCard.innerHTML = `
                <div class="metric-value">${metric.value}</div>
                <div class="metric-label">${metric.label}</div>
            `;
            metricsContainer.appendChild(metricCard);
        });
    }

    displayHistoricalData() {
        const historicalData = this.dataLoader.getHistoricalData();
        if (!historicalData) {
            this.updateStatus('dataStatus', 'No data available. Loading data...', 'error');
            return;
        }

        const ctx = document.getElementById('historicalChart').getContext('2d');
        
        if (this.historicalChart) {
            this.historicalChart.destroy();
        }
        
        this.historicalChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: historicalData.dates,
                datasets: [{
                    label: 'S&P 500 Price',
                    data: historicalData.prices,
                    borderColor: '#ff6b81',
                    backgroundColor: 'rgba(255, 107, 129, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Historical S&P 500 Prices',
                        color: '#ffccd5',
                        font: { size: 16 }
                    },
                    legend: {
                        labels: { color: '#ffccd5' }
                    }
                },
                scales: {
                    x: {
                        ticks: { 
                            color: '#ffccd5',
                            maxTicksLimit: 10,
                            callback: function(value, index) {
                                if (index % Math.ceil(this.chart.data.labels.length / 10) === 0) {
                                    return this.getLabelForValue(value);
                                }
                                return '';
                            }
                        },
                        grid: { color: 'rgba(255,255,255,0.1)' }
                    },
                    y: {
                        ticks: { 
                            color: '#ffccd5',
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        },
                        grid: { color: 'rgba(255,255,255,0.1)' }
                    }
                }
            }
        });
    }

    async trainModel(epochs = 20) {
        if (this.isTraining) {
            return;
        }

        try {
            this.isTraining = true;
            this.updateStatus('trainingStatus', 'Building GRU model...', 'info');
            
            const progressBar = document.getElementById('progressBar');
            const progressFill = document.getElementById('progressFill');
            progressBar.classList.add('active');
            progressFill.style.width = '0%';
            
            if (!this.dataLoader.X_train) {
                throw new Error('Training data not loaded. Please load data first.');
            }
            
            console.log('Data shapes:', {
                X_train: this.dataLoader.X_train.shape,
                y_train: this.dataLoader.y_train.shape
            });
            
            this.model.buildModel();
            
            this.updateStatus('trainingStatus', `Starting training for ${epochs} epochs...`, 'info');
            
            let currentEpoch = 0;
            const startTime = Date.now();
            
            await this.model.train(
                this.dataLoader.X_train,
                this.dataLoader.y_train,
                this.dataLoader.X_test,
                this.dataLoader.y_test,
                epochs,
                32,
                {
                    onEpochEnd: (epoch, logs) => {
                        currentEpoch = epoch + 1;
                        const progress = (currentEpoch / epochs) * 100;
                        progressFill.style.width = `${progress}%`;
                        
                        const elapsed = (Date.now() - startTime) / 1000;
                        const timePerEpoch = elapsed / currentEpoch;
                        const remaining = Math.round(timePerEpoch * (epochs - currentEpoch));
                        
                        const status = `🏃‍♂️ Epoch ${currentEpoch}/${epochs} - Loss: ${logs.loss.toFixed(6)} - ~${remaining}s remaining`;
                        this.updateStatus('trainingStatus', status, 'info');
                        
                        if (currentEpoch % 3 === 0) {
                            tf.nextFrame();
                        }
                    },
                    onTrainEnd: () => {
                        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
                        this.isTraining = false;
                        progressBar.classList.remove('active');
                        document.getElementById('predictBtn').disabled = false;
                        
                        const metrics = this.model.evaluate(this.dataLoader.X_test, this.dataLoader.y_test);
                        
                        this.updateStatus('trainingStatus', 
                            `✅ Training completed in ${totalTime}s! RMSE: ${metrics.rmse.toFixed(6)}`,
                            'success'
                        );
                        
                        this.displayTrainingMetrics(metrics);
                    }
                }
            );
            
        } catch (error) {
            this.isTraining = false;
            document.getElementById('progressBar').classList.remove('active');
            this.updateStatus('trainingStatus', `❌ Training error: ${error.message}`, 'error');
            console.error('Training error:', error);
        }
    }

    displayTrainingMetrics(metrics) {
        const metricsContainer = document.getElementById('metricsContainer');
        const trainingMetrics = [
            { label: 'Test RMSE', value: metrics.rmse.toFixed(6) },
            { label: 'Test MSE', value: metrics.mse.toFixed(6) },
            { label: 'Test Loss', value: metrics.loss.toFixed(6) },
            { label: 'RMSE (% returns)', value: (metrics.rmse * 100).toFixed(4) + '%' }
        ];
        
        trainingMetrics.forEach(metric => {
            const metricCard = document.createElement('div');
            metricCard.className = 'metric-card';
            metricCard.innerHTML = `
                <div class="metric-value">${metric.value}</div>
                <div class="metric-label">${metric.label}</div>
            `;
            metricsContainer.appendChild(metricCard);
        });
    }

    async makePredictions() {
        try {
            if (!this.model || !this.model.isTrained) {
                throw new Error('Model not trained. Please train the model first.');
            }
            
            this.updateStatus('trainingStatus', 'Making predictions for next 5 days...', 'info');
            
            const normalizedData = this.dataLoader.normalizedData;
            const windowSize = this.model.windowSize;
            
            if (normalizedData.length < windowSize) {
                throw new Error('Not enough data for prediction');
            }
            
            const lastWindow = normalizedData.slice(-windowSize);
            const lastWindowFormatted = lastWindow.map(val => [val]);
            const inputTensor = tf.tensor3d([lastWindowFormatted], [1, windowSize, 1]);
            
            const normalizedPredictions = await this.model.predict(inputTensor);
            inputTensor.dispose();
            
            this.predictions = normalizedPredictions[0].map(pred => 
                this.dataLoader.denormalize(pred)
            );
            
            this.displayPredictions();
            this.createPredictionChart();
            
            this.updateStatus('trainingStatus', '✅ Predictions generated!', 'success');
            
        } catch (error) {
            this.updateStatus('trainingStatus', `❌ Prediction error: ${error.message}`, 'error');
            console.error('Prediction error:', error);
        }
    }

    displayPredictions() {
        const predictionsContainer = document.getElementById('predictionsContainer');
        predictionsContainer.innerHTML = '';
        predictionsContainer.style.display = 'grid';
        
        const lastPrice = this.dataLoader.data[this.dataLoader.data.length - 1].price;
        let cumulativePrice = lastPrice;
        
        this.predictions.forEach((pred, index) => {
            const day = index + 1;
            const predictedReturn = pred;
            const priceChange = cumulativePrice * predictedReturn;
            const newPrice = cumulativePrice + priceChange;
            
            const predictionCard = document.createElement('div');
            predictionCard.className = 'prediction-card';
            predictionCard.innerHTML = `
                <div class="prediction-day">Day +${day}</div>
                <div class="prediction-value ${predictedReturn >= 0 ? 'positive' : 'negative'}">
                    ${(predictedReturn * 100).toFixed(4)}%
                </div>
                <div class="prediction-change">
                    Expected price: $${newPrice.toFixed(2)}
                </div>
            `;
            
            predictionsContainer.appendChild(predictionCard);
            
            cumulativePrice = newPrice;
        });
    }

    createPredictionChart() {
        const historicalData = this.dataLoader.getHistoricalData();
        if (!historicalData || !this.predictions) return;
        
        const ctx = document.getElementById('predictionChart').getContext('2d');
        
        if (this.predictionChart) {
            this.predictionChart.destroy();
        }
        
        const lastReturns = historicalData.returns.slice(-20);
        const predictionReturns = this.predictions;
        
        const labels = [
            ...Array.from({ length: lastReturns.length }, (_, i) => `D-${lastReturns.length - i}`),
            'Today',
            ...Array.from({ length: predictionReturns.length }, (_, i) => `D+${i + 1}`)
        ];
        
        const data = [
            ...lastReturns.map(r => r * 100),
            0,
            ...predictionReturns.map(r => r * 100)
        ];
        
        const backgroundColors = [
            ...Array(lastReturns.length).fill('rgba(255, 107, 129, 0.7)'),
            'rgba(255, 255, 255, 0.7)',
            ...Array(predictionReturns.length).fill('rgba(144, 238, 144, 0.7)')
        ];
        
        this.predictionChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Daily Returns (%)',
                    data: data,
                    backgroundColor: backgroundColors,
                    borderColor: backgroundColors.map(c => c.replace('0.7', '1')),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Historical vs Predicted Returns',
                        color: '#ffccd5',
                        font: { size: 16 }
                    },
                    legend: {
                        labels: { color: '#ffccd5' }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Return: ${context.parsed.y.toFixed(4)}%`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#ffccd5' },
                        grid: { color: 'rgba(255,255,255,0.1)' }
                    },
                    y: {
                        ticks: { 
                            color: '#ffccd5',
                            callback: function(value) {
                                return value.toFixed(2) + '%';
                            }
                        },
                        grid: { color: 'rgba(255,255,255,0.1)' }
                    }
                }
            }
        });
    }

    updateStatus(elementId, message, type = 'info') {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = message;
            element.className = 'status active';
            
            if (type === 'success') {
                element.style.borderLeftColor = '#90ee90';
                element.style.background = 'rgba(144, 238, 144, 0.1)';
            } else if (type === 'error') {
                element.style.borderLeftColor = '#ff6b81';
                element.style.background = 'rgba(220, 53, 69, 0.1)';
            } else {
                element.style.borderLeftColor = '#ffccd5';
                element.style.background = 'rgba(255, 204, 213, 0.1)';
            }
        }
    }

    dispose() {
        this.dataLoader.dispose();
        this.model.dispose();
        
        if (this.historicalChart) {
            this.historicalChart.destroy();
        }
        if (this.predictionChart) {
            this.predictionChart.destroy();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new StockPredictorApp();
    
    window.addEventListener('beforeunload', () => {
        if (window.app) {
            window.app.dispose();
        }
    });
});
