# What happens on an attack nobody trained on

One family at a time is removed from the training data, all three
models are refitted, and each is then asked about the family none of
them was told about. The two unsupervised models never see any attack
during training, so this measures what the supervised model loses.

| Held out family | Flows | Random Forest | Isolation Forest | Autoencoder |
| --- | --- | --- | --- |  --- |
| PortScan | 11,231 | 0.0% | 0.1% | 0.2% |
| DDoS | 9,053 | 63.9% | 1.9% | 33.7% |
| Bot | 138 | 0.0% | 2.2% | 0.0% |
| FTP-Patator | 561 | 0.0% | 0.0% | 0.0% |
| DoS slowloris | 410 | 89.8% | 32.2% | 28.0% |
| Web Attack Brute Force | 107 | 80.4% | 0.0% | 0.0% |
