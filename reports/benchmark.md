# Model comparison on the CICIDS2017 test split

Generated 2026-09-06T14:31:18+00:00 on 691,941 flows, 136,187 of them attacks.

| Model | Type | Recall | False positive rate | Precision | F1 | ROC AUC | Latency per flow |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Random Forest | supervised | 0.999 | 0.0007 | 0.997 | 0.998 | 1.000 | 1.66 ms |
| Isolation Forest | unsupervised | 0.172 | 0.0101 | 0.807 | 0.283 | 0.921 | 3.29 ms |
| Autoencoder | deep learning | 0.377 | 0.0101 | 0.901 | 0.532 | 0.930 | 0.33 ms |
