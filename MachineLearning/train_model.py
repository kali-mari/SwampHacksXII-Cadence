import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.preprocessing import StandardScaler

# 1. Load your collected run dataset from CSV
CSV_FILE = "run_training_data.csv"

try:
    df = pd.read_csv(CSV_FILE)
    print(f"Successfully loaded dataset with {len(df)} rows!")
except FileNotFoundError:
    print(f"Error: Could not find {CSV_FILE}. Make sure you ran your data generator first.")
    exit()

# 2. Separate your Features (X) and your Target Label (y)
# We drop non-feature metadata columns like 'run_id' and 'timestamp', along with the 'label' column
X = df.drop(columns=["label", "run_id", "timestamp"])
y = df["label"]  # 0 for Good Form, 1 for Poor Form

# 3. Split the data into 80% for training and 20% for testing
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# 4. Scale your features so sensors with larger numeric ranges don't dominate the model
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# 5. Train the Random Forest Classifier
print("Training the Random Forest model...")
model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train_scaled, y_train)

# 6. Evaluate the model on unseen test data
y_pred = model.predict(X_test_scaled)

print("\n--- Model Evaluation Results ---")
print("Confusion Matrix:")
print(confusion_matrix(y_test, y_pred))

print("\nClassification Report:")
print(classification_report(y_test, y_pred))

# Optional: Print out which sensors mattered the most to the model
importances = model.feature_importances_
feature_names = X.columns
print("\nFeature Importances:")
for name, score in zip(feature_names, importances):
    print(f" - {name}: {score:.4f}")

# 7. Save the trained model and scaler for future use
joblib.dump(model, "running_model.pkl")
joblib.dump(scaler, "scaler.pkl")
print("\nModel and scaler saved successfully as 'running_model.pkl' and 'scaler.pkl'!")