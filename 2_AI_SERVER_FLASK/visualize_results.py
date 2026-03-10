import pandas as pd
import joblib
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
# Charger les données 
data = pd.read_csv('heart_disease.csv')
features = ['age', 'sex', 'cp', 'trestbps', 'chol', 'fbs',
            'restecg', 'thalach', 'exang', 'oldpeak', 'slope', 'ca', 'thal']
target = 'condition'
X = data[features]
y = data[target]
# Normalisation
scaler = joblib.load('model/scaler.pkl')
X_scaled = scaler.transform(X)
X_train, X_test, y_train, y_test = train_test_split(
    X_scaled, y, test_size=0.2, random_state=42
)
# Charger le meilleur modèle 
model = joblib.load('model/heart_disease_model.pkl')
# Bar Chart: Accuracy des modèles
accuracies = {
    'Logistic Regression': 0.0,
    'KNN': 0.0,
    'SVM': 0.0,
    'Decision Tree': 0.0,
    'Random Forest': 0.0
}
accuracies = {
    'Logistic Regression': 0.7333,
    'KNN': 0.7167,
    'SVM': 0.7500,
    'Decision Tree': 0.7667,
    'Random Forest': 0.7000
}
plt.figure()
plt.bar(accuracies.keys(), accuracies.values())
plt.title("Comparaison des performances des modèles (Accuracy)")
plt.ylabel("Accuracy")
plt.xticks(rotation=30)
plt.show()
y_pred = model.predict(X_test)
cm = confusion_matrix(y_test, y_pred)
plt.figure()
sns.heatmap(cm, annot=True, fmt='d')
plt.title("Matrice de Confusion du Meilleur Modèle")
plt.xlabel("Prédiction")
plt.ylabel("Valeur Réelle")
plt.show()
# Feature Importance
if hasattr(model, 'feature_importances_'):
    importances = model.feature_importances_
    plt.figure()
    plt.barh(features, importances)
    plt.title("Importance des variables (Decision Tree)")
    plt.xlabel("Importance")
    plt.show()
