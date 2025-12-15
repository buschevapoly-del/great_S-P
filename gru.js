// gru.js
class GRUModel {
    constructor(windowSize = 60, predictionHorizon = 5) {
        this.windowSize = windowSize;
        this.predictionHorizon = predictionHorizon;
        this.model = null;
        this.trainingHistory = null;
        this.isTrained = false;
    }

    buildModel() {
        tf.disposeVariables();
        
        this.model = tf.sequential();
        
        // First GRU layer
        this.model.add(tf.layers.gru({
            units: 64,
            inputShape: [this.windowSize, 1],
            returnSequences: true,
            kernelInitializer: 'glorotUniform',
            recurrentInitializer: 'orthogonal',
            dropout: 0.2,
            recurrentDropout: 0.2
        }));
        
        // Second GRU layer
        this.model.add(tf.layers.gru({
            units: 32,
            returnSequences: false,
            kernelInitializer: 'glorotUniform',
            recurrentInitializer: 'orthogonal',
            dropout: 0.2
        }));
        
        // Dense layer
        this.model.add(tf.layers.dense({
            units: 16,
            activation: 'relu',
            kernelInitializer: 'heNormal'
        }));
        
        // Output layer
        this.model.add(tf.layers.dense({
            units: this.predictionHorizon,
            activation: 'linear',
            kernelInitializer: 'glorotUniform'
        }));
        
        // Compile model
        this.model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'meanSquaredError',
            metrics: ['mse']
        });
        
        console.log('Model built successfully');
        console.log(this.model.summary());
        
        return this.model;
    }

    async train(X_train, y_train, X_val = null, y_val = null, epochs = 50, batchSize = 32, callbacks = {}) {
        if (!this.model) {
            throw new Error('Model not built. Call buildModel() first.');
        }
        
        if (!X_train || !y_train) {
            throw new Error('Training data not provided');
        }

        const validationData = X_val && y_val ? [X_val, y_val] : undefined;
        
        const fitCallbacks = {
            onEpochEnd: async (epoch, logs) => {
                if (callbacks.onEpochEnd) {
                    callbacks.onEpochEnd(epoch, logs);
                }
                
                // Memory cleanup
                if (epoch % 5 === 0) {
                    await tf.nextFrame();
                }
            },
            onTrainEnd: () => {
                if (callbacks.onTrainEnd) {
                    callbacks.onTrainEnd();
                }
            }
        };

        try {
            this.trainingHistory = await this.model.fit(X_train, y_train, {
                epochs: epochs,
                batchSize: batchSize,
                validationData: validationData,
                verbose: 0,
                callbacks: fitCallbacks
            });
            
            this.isTrained = true;
            return this.trainingHistory;
        } catch (error) {
            console.error('Training error:', error);
            throw error;
        }
    }

    async predict(X) {
        if (!this.model || !this.isTrained) {
            throw new Error('Model not trained');
        }
        
        if (!X) {
            throw new Error('Input data not provided');
        }

        try {
            const predictions = this.model.predict(X);
            const predictionsArray = await predictions.array();
            predictions.dispose();
            return predictionsArray;
        } catch (error) {
            console.error('Prediction error:', error);
            throw error;
        }
    }

    evaluate(X_test, y_test) {
        if (!this.model || !this.isTrained) {
            throw new Error('Model not trained');
        }
        
        if (!X_test || !y_test) {
            throw new Error('Test data not provided');
        }

        try {
            const evaluation = this.model.evaluate(X_test, y_test);
            const loss = evaluation[0].arraySync();
            const mse = evaluation[1].arraySync();
            
            evaluation[0].dispose();
            evaluation[1].dispose();
            
            const rmse = Math.sqrt(mse);
            
            return {
                loss: loss,
                mse: mse,
                rmse: rmse
            };
        } catch (error) {
            console.error('Evaluation error:', error);
            throw error;
        }
    }

    async saveWeights() {
        if (!this.model || !this.isTrained) {
            throw new Error('Model not trained');
        }
        
        const saveResult = await this.model.save('indexeddb://sp500-gru-model');
        console.log('Model weights saved:', saveResult);
        return saveResult;
    }

    async loadWeights() {
        try {
            if (!this.model) {
                this.buildModel();
            }
            
            await this.model.load('indexeddb://sp500-gru-model');
            this.isTrained = true;
            console.log('Model weights loaded');
            return true;
        } catch (error) {
            console.log('No saved weights found or error loading:', error);
            return false;
        }
    }

    dispose() {
        if (this.model) {
            this.model.dispose();
            this.model = null;
        }
        this.trainingHistory = null;
        this.isTrained = false;
    }
}

export { GRUModel };
