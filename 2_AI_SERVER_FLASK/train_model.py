import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.neighbors import KNeighborsClassifier
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
import os
# Lecture des données
try:
    data = pd.read_csv('heart_disease.csv')
except FileNotFoundError:
    print("Erreur: Le fichier 'heart_disease.csv' est introuvable. Veuillez vérifier le chemin.")
    exit()
features = ['age', 'sex', 'cp', 'trestbps', 'chol', 'fbs', 'restecg', 'thalach', 'exang', 'oldpeak', 'slope', 'ca', 'thal']
target = 'condition' 
X = data[features]
y = data[target]
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)
# Division des données en ensembles d'entraînement et de test (80%/20%)
X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2, random_state=42)
# Définition des modèles de Classification
models = {
    'Logistic Regression': LogisticRegression(solver='liblinear', random_state=42),
    'K-Nearest Neighbors (KNN)': KNeighborsClassifier(n_neighbors=5),
    'Support Vector Machine (SVC)': SVC(kernel='linear', random_state=42),
    'Decision Tree': DecisionTreeClassifier(random_state=42),
    'Random Forest': RandomForestClassifier(n_estimators=100, random_state=42)
}
results = {}
print("Début de l'entraînement et de l'évaluation des modèles")
# Entraînement et Évaluation 
best_model_name = ""
best_accuracy = 0
best_model = None
for name, model in models.items():
    # Entraînement
    model.fit(X_train, y_train)
    # Prédiction sur l'ensemble de test
    y_pred = model.predict(X_test)
    # Évaluation (Précision/Accuracy)
    accuracy = accuracy_score(y_test, y_pred)
    results[name] = accuracy
    print(f"✔️ {name}: Précision = {accuracy:.4f}")
    # Déterminer le meilleur modèle
    if accuracy > best_accuracy:
        best_accuracy = accuracy
        best_model_name = name
        best_model = model

print("\n------------------------------------")
print(f"Meilleur modèle: {best_model_name} avec une précision de {best_accuracy:.4f}")
print("------------------------------------")
# Sauvegarde du meilleur modèle et du Scaler
MODEL_PATH = 'model/heart_disease_model.pkl'
SCALER_PATH = 'model/scaler.pkl'
# Créer le répertoire 'model' s'il n'existe pas
os.makedirs('model', exist_ok=True)
# Sauvegarde du meilleur modèle
joblib.dump(best_model, MODEL_PATH)
# Sauvegarde du Scaler (très important pour les nouvelles données)
joblib.dump(scaler, SCALER_PATH)
print(f"\n Le meilleur modèle ({best_model_name}) est sauvegardé dans : {MODEL_PATH}")
print(f" Le Scaler est sauvegardé dans : {SCALER_PATH}")