# Does the split flatter the models

14.1% of a random test split has an identical twin in the train half, and
27.8% of the test attacks do. The table compares the same three models
under a random split and under a split that trains on the earlier part of every capture
session and tests on the later part.

| Model | Recall random | Recall time ordered | False positives random | False positives time ordered |
| --- | --- | --- | --- | --- |
| Random Forest | 0.999 | 0.985 | 0.0008 | 0.0003 |
| Isolation Forest | 0.069 | 0.018 | 0.0099 | 0.0081 |
| Autoencoder | 0.432 | 0.228 | 0.0103 | 0.0094 |
