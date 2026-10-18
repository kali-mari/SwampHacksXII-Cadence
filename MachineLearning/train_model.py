import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier  # Import XGBoost

# 1. Load your collected run dataset from CSV
CSV_FILE = "run_training_data.csv"

try:
    df = pd.read_csv(CSV_FILE)
    print(f"Successfully loaded dataset with {len(df)} rows!")
except FileNotFoundError:
    print(f"Error: Could not find {CSV_FILE}. Make sure you ran your data generator first.")
    exit()

# 2. Separate your Features (X) and your Target Label (y)
X = df.drop(columns=["label", "run_id", "timestamp"])
y = df["label"]  # 0 for Good Form, 1 for Poor Form

# 3. Split the data into 80% for training and 20% for testing
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# 4. Scale your features
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# 5. Train the XGBoost Classifier
# 5. Train the XGBoost Classifier with feature subsampling
print("Training the XGBoost model with balanced feature constraints...")
model = XGBClassifier(
    n_estimators=100,
    learning_rate=0.1,
    max_depth=4,
    colsample_bytree=0.6,  # Forces each tree to only look at a random 60% of sensors
    subsample=0.8,         # Uses 80% of the rows per tree to add healthy randomness
    random_state=42,
    eval_metric="logloss"
)
model.fit(X_train_scaled, y_train)

# 6. Evaluate the model on unseen test data
y_pred = model.predict(X_test_scaled)

print("\n--- Model Evaluation Results ---")
print("Confusion Matrix:")
print(confusion_matrix(y_test, y_pred))

print("\nClassification Report:")
print(classification_report(y_test, y_pred))

# Print out feature importances
importances = model.feature_importances_
feature_names = X.columns
print("\nFeature Importances:")
for name, score in zip(feature_names, importances):
    print(f" - {name}: {score:.4f}")

# 7. Save the trained model and scaler
joblib.dump(model, "running_model.pkl")
joblib.dump(scaler, "scaler.pkl")
print("\nModel and scaler saved successfully as 'running_model.pkl' and 'scaler.pkl'!")