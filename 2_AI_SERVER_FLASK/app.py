from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import numpy as np
import pandas as pd 
app = Flask(__name__)
CORS(app) 
MODEL_PATH = 'model/heart_disease_model.pkl'
SCALER_PATH = 'model/scaler.pkl'
model = None
scaler = None
try:
    model = joblib.load(MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)
    print(f"Modèle de prédiction chargé depuis : {MODEL_PATH}")
except FileNotFoundError:
    print("Erreur: Fichiers de modèle ou de scaler non trouvés dans le dossier 'model/'.")
except Exception as e:
    print(f"Erreur lors du chargement du modèle: {e}")
FEATURES = ['age', 'sex', 'cp', 'trestbps', 'chol', 'fbs', 'restecg', 'thalach', 'exang', 'oldpeak', 'slope', 'ca', 'thal']
@app.route('/predict_risk', methods=['POST'])
def predict():
    if model is None or scaler is None:
        return jsonify({'error': 'Le serveur IA n\'a pas pu charger le modèle.'}), 500
    try:
        data = request.json
        if not all(feature in data for feature in FEATURES):
            return jsonify({'error': 'Données d\'entrée manquantes ou incomplètes.'}), 400
        input_data = [data[feature] for feature in FEATURES]
        input_array = np.array([input_data], dtype=float)
        input_scaled = scaler.transform(input_array)
        prediction = model.predict(input_scaled)
        result = int(prediction[0])
        return jsonify({'risk_prediction': result})
    except Exception as e:
        print(f"Erreur interne lors de la prédiction: {e}")
        return jsonify({'error': f'Erreur de traitement des données: {e}'}), 500
if __name__ == '__main__':
    app.run(debug=True, port=5000)