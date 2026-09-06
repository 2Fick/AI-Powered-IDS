<div align="center">

<img src="docs/banner.svg" alt="The same flow enters three detectors and they return different verdicts" width="620">

# AI-Powered IDS

**Three intrusion detectors watch the same network traffic and disagree about it.
This project measures exactly how.**

[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://www.python.org)
[![scikit-learn](https://img.shields.io/badge/scikit--learn-1.5-F7931E?logo=scikitlearn&logoColor=white)](https://scikit-learn.org)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.5-EE4C2C?logo=pytorch&logoColor=white)](https://pytorch.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![Docker](https://img.shields.io/badge/Docker-compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com)

</div>

---

## What this is

A random forest, an isolation forest and a PyTorch autoencoder are trained on
five days of real network traffic from CICIDS2017, then served behind one API
that scores flows one at a time. A dashboard replays held out traffic through all
three at once and shows what each catches, what each misses, and how long each
takes to decide.

The supervised model reaches 99.87 percent recall. That number is easy to get on
this dataset and easy to overstate, so most of the work here is in the parts that
qualify it.

- A random split leaves **27.8 percent of the test attacks with a byte identical
  twin in the training half**, because a denial of service burst produces
  thousands of identical flows.
- The forest reaches its recall at **five trees**. Every tree after that only
  costs latency, and the scikit-learn default for the isolation forest sits near
  the worst end of its own curve.
- Remove one attack family from training and the supervised model does not
  degrade, it **collapses to zero on three families out of six**.

## Architecture

<div align="center">
<img src="docs/architecture.svg" alt="A flow goes from the capture files through cleaning, then through the three detectors in parallel, then out to the API and the dashboard" width="100%">
</div>

## What it looks like

<table>
<tr>
<td width="50%"><img src="docs/screenshots/live-alerts.png" alt="Live alert feed"></td>
<td width="50%"><img src="docs/screenshots/models.png" alt="Model comparison"></td>
</tr>
<tr>
<td><b>Live traffic.</b> One row per flow a model flagged, with the ground truth
beside it.</td>
<td><b>Models.</b> The comparison table and recall per attack family.</td>
</tr>
<tr>
<td><img src="docs/screenshots/tuning.png" alt="Hyperparameter sweeps"></td>
<td><img src="docs/screenshots/data.png" alt="Dataset shape"></td>
</tr>
<tr>
<td><b>Tuning.</b> Every hyperparameter read off a curve.</td>
<td><b>Data.</b> What the dataset holds and what the pipeline does to it.</td>
</tr>
</table>

## Results

On 691,941 held out flows, 136,187 of them attacks. Both unsupervised models are
thresholded at a 1 percent target false positive rate.

| Model | Type | Recall | False positives | Latency per flow |
| --- | --- | --- | --- | --- |
| Random Forest | supervised | **99.87%** | **0.07%** | 1.66 ms |
| Isolation Forest | unsupervised | 17.24% | 1.01% | 3.29 ms |
| Autoencoder | deep learning | 37.69% | 1.01% | **0.33 ms** |

Recall per attack family is the more useful view:

| Attack family | Test flows | Random Forest | Isolation Forest | Autoencoder |
| --- | --- | --- | --- | --- |
| DoS Hulk | 56,320 | 100% | 28% | 61% |
| PortScan | 38,855 | 100% | 0% | 1% |
| DoS Slowhttptest | 1,345 | 100% | 89% | 90% |
| Bot | 479 | 81% | 3% | 0% |
| Infiltration | 9 | 67% | 67% | **89%** |
| Heartbleed | 3 | 100% | 100% | 100% |

The supervised model is weakest on the two rarest families, which is where the
unsupervised models compete. On Infiltration the autoencoder beats it outright.
Neither unsupervised model sees a port scan, because a port scan is a small,
ordinary looking flow.

## Report

A seven page write up of the method and the measurements: **[report.pdf](report/report.pdf)**.
Source in [`report/main.tex`](report/main.tex).

## Running it

Python 3.11 or newer, Node 20 or newer.

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe -m pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu
.venv/Scripts/python.exe -m pip install -e . --no-deps
```

The CPU wheel index avoids pulling several gigabytes of CUDA that this project
does not use. On Linux or macOS, `.venv/bin/python` replaces
`.venv/Scripts/python.exe`.

```bash
.venv/Scripts/python.exe -m ids.data.download
.venv/Scripts/python.exe -m ids.data.explore --out reports
.venv/Scripts/python.exe -m ids.data.preprocess
.venv/Scripts/python.exe -m ids.train
.venv/Scripts/python.exe -m ids.benchmark
```

That downloads 300 MB, cleans it and trains the three models. Around fifteen
minutes end to end.

Then two terminals:

```bash
.venv/Scripts/python.exe -m uvicorn ids.api.main:app --port 8000
```

```bash
cd frontend && npm install && npm run dev
```

Dashboard on <http://localhost:3000>, API docs on <http://localhost:8000/docs>.
Or `docker compose up --build` for the same two addresses.

Four optional experiments feed the Tuning and Evidence pages:

```bash
.venv/Scripts/python.exe -m ids.sweep
.venv/Scripts/python.exe -m ids.curves
.venv/Scripts/python.exe -m ids.validate
.venv/Scripts/python.exe -m ids.novelty
```

## The dashboard

Six pages, each answering one question.

| Page | Question |
| --- | --- |
| Overview | What is the sensor doing right now |
| Live traffic | Who is being flagged, and what is known about them |
| Data | What does the dataset hold, and what does the pipeline do to it |
| Models | Which detector wins, where, and at what cost |
| Tuning | How was each model sized, and on what evidence |
| Evidence | Why should any of these numbers be believed |

The replay stream sends flows held out before training, one at a time, at 4 to 80
per second. Alerts on public addresses are enriched by VirusTotal, AbuseIPDB,
Shodan and GreyNoise. The last two need no API key.

## Reading the code

| # | File | What you learn |
| --- | --- | --- |
| 1 | [`data/explore.py`](src/ids/data/explore.py) | What the dataset looks like and why it needs cleaning |
| 2 | [`config.py`](src/ids/config.py) | Paths, sessions, which columns are features |
| 3 | [`data/preprocess.py`](src/ids/data/preprocess.py) | Cleaning, timestamp parsing, the three splits |
| 4 | [`models/scaling.py`](src/ids/models/scaling.py) | Why a signed logarithm and not standardisation |
| 5 | [`models/autoencoder.py`](src/ids/models/autoencoder.py) | The network and reconstruction error as a score |
| 6 | [`train.py`](src/ids/train.py) | The three models and how their thresholds are set |
| 7 | [`detectors.py`](src/ids/detectors.py) | The shared serving interface |
| 8 | [`benchmark.py`](src/ids/benchmark.py) | Which metrics mean anything here |

Then [`sweep.py`](src/ids/sweep.py), [`curves.py`](src/ids/curves.py),
[`validate.py`](src/ids/validate.py) and [`novelty.py`](src/ids/novelty.py) for
the experiments, [`api/`](src/ids/api/) for the service and
[`frontend/src/`](frontend/src/) for the dashboard.

## Decisions worth explaining

**The labelled flow release, not the machine learning CSVs.** Both carry the same
78 features, but only the first keeps the addresses and timestamps, without which
the threat intelligence has nothing to look up and the replay has no capture
order.

**Accuracy is never quoted.** Four flows in five are benign, so a model that
never raises an alert scores above 80 percent.

**A signed logarithm rather than a quantile transform.** Some features have a
maximum nine thousand times their own 99th percentile. A quantile transform
handles that and cost 20 ms per row, more than all three models spent deciding.
`sign(x) log(1+|x|)` compresses the same tails in microseconds.

**One worker when serving.** Handing a single row to a thread pool costs more
than scoring it. This took the forest from 17 ms to 3 ms per flow.

**One threshold rule for both unsupervised models.** Each takes its threshold
from its own benign score distribution at the same target false positive rate.

## Tests

```bash
.venv/Scripts/python.exe -m pytest
```

Sixteen tests over the scaler, the cleaning step and the threat intelligence
client.

## Dataset

Sharafaldin, Lashkari and Ghorbani, *Toward Generating a New Intrusion Detection
Dataset and Intrusion Traffic Characterization*, ICISSP 2018.
<https://www.unb.ca/cic/datasets/ids-2017.html>

The University of New Brunswick serves it behind a registration form, so
[`data/download.py`](src/ids/data/download.py) pulls the same files from a public
mirror.
