# Network intrusion detection on CICIDS2017

Three detectors look at the same network traffic and disagree about it, live.

A random forest, an isolation forest and an autoencoder are trained on the
CICIDS2017 capture, then served behind one API that scores flows one at a time.
A dashboard replays held out traffic through all three at once and shows what
each of them catches, what each of them misses, and how long each of them takes
to decide.

The point of the project is the comparison, not any single model. A supervised
classifier reaches 99.9 percent recall on this dataset and that number is
almost meaningless on its own, so the interesting work is in the parts that
explain it: what the split does to the score, where the unsupervised models beat
the supervised one, and what it costs to decide.

## What is in the box

| Piece | What it does |
| --- | --- |
| Data pipeline | Downloads the eight capture files, cleans them, splits them |
| Random Forest | Supervised, learns from labelled attacks, scikit-learn |
| Isolation Forest | Unsupervised, isolates points that sit apart, scikit-learn |
| Autoencoder | Unsupervised, flags flows it cannot rebuild, PyTorch |
| Benchmark | Recall, false positive rate and latency on a held out split |
| Validation | Measures how much the split flatters the models |
| API | FastAPI, REST plus a WebSocket that replays traffic |
| Dashboard | Next.js and shadcn, live alerts and the comparison tables |
| Threat intel | VirusTotal, AbuseIPDB, Shodan and GreyNoise |

Everything used here is free. Two of the four intelligence sources need no
account at all.

## Running it

Python 3.11 or newer, Node 20 or newer. Nothing else has to be installed.

### 1. Set up

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe -m pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu
.venv/Scripts/python.exe -m pip install -e . --no-deps
```

The second line is deliberate. The default PyTorch wheel bundles CUDA and
weighs several gigabytes, which this project has no use for: the autoencoder is
a small dense network over 69 tabular features and scores a flow in well under
a millisecond on a CPU.

On Linux or macOS, `.venv/bin/python` replaces `.venv/Scripts/python.exe`
throughout.

### 2. Get the data and look at it

```bash
.venv/Scripts/python.exe -m ids.data.download
```

Roughly 300 MB, into `data/raw`. The dataset home page at the University of New
Brunswick is behind a registration form that cannot be scripted, so the files
come from a public mirror instead.

```bash
.venv/Scripts/python.exe -m ids.data.explore --out reports
```

Read this before the modelling code. It writes
[reports/dataset-overview.txt](reports/dataset-overview.txt) and answers the
questions that shaped everything downstream: how the attacks are spread across
the week, which columns are dead, which values are broken, how skewed the
numbers are, and who talks to whom.

### 3. Clean, train, measure

```bash
.venv/Scripts/python.exe -m ids.data.preprocess
```

```bash
.venv/Scripts/python.exe -m ids.train
```

```bash
.venv/Scripts/python.exe -m ids.benchmark
```

Preprocessing takes about two minutes, training about ten, the benchmark about
four. Training writes to `models/`, the benchmark to
[reports/benchmark.md](reports/benchmark.md).

### 4. Run it

Two terminals.

```bash
.venv/Scripts/python.exe -m uvicorn ids.api.main:app --port 8000
```

```bash
cd frontend && npm install && npm run dev
```

The dashboard is at <http://localhost:3000>. The API documents itself at
<http://localhost:8000/docs>.

### With Docker instead

```bash
docker compose up --build
```

Same two addresses. The trained models and the replay split are mounted from
the host rather than baked into the image, so steps 2 and 3 still have to run
first. They are build output, not source.

## What the dashboard shows

The page is one screen split into sections, and the sidebar scrolls between
them.

**Overview** counts flows replayed, alerts raised, attacks missed and the false
positive rate, all for the random forest, which is the model that would actually
be deployed.

**Replay control** starts, stops and restarts the stream and sets its speed from
4 to 80 flows per second. Every flow it sends was held out before training, so
nothing on screen was ever seen by a model.

**Attack mix** is what the replay has produced so far, by family.

**Threat intelligence** shows what the outside world knows about the public
addresses behind alerts. Most of the capture runs on a private test bed, so this
fills slowly, and that is the honest behaviour: asking VirusTotal about
192.168.10.9 wastes a request and answers nothing.

**Alerts per second** and **Inference latency** are the two live charts. The
first shows how loud each model is on identical traffic. The second is the
number that decides whether a model can be deployed at all, measured rather than
quoted.

**Live alerts** is the feed. One row per flow that at least one model flagged,
with the ground truth beside it, so a real catch and a false positive are
visible at a glance and the verdict column shows which models agreed.

**Running scoreboard** recomputes recall, false positive rate and precision from
the flows that have gone past on this connection. Watching it converge on the
benchmark is the check that the served models are the ones that were measured.

**Model comparison** and **Coverage by attack family** are the offline results,
read from the benchmark report.

## Results

Measured on 691,941 held out flows, 136,187 of them attacks. Both unsupervised
models are thresholded on the benign score distribution at a 1 percent target
false positive rate, so the comparison is fair.

| Model | Type | Recall | False positives | Precision | ROC AUC | Latency per flow |
| --- | --- | --- | --- | --- | --- | --- |
| Random Forest | supervised | 99.87% | 0.07% | 99.70% | 1.000 | 3.09 ms |
| Isolation Forest | unsupervised | 11.32% | 1.00% | 73.40% | 0.901 | 3.43 ms |
| Autoencoder | deep learning | 37.69% | 1.01% | 90.15% | 0.930 | 0.34 ms |

The headline is not the interesting part. This is:

| Attack family | Flows | Random Forest | Isolation Forest | Autoencoder |
| --- | --- | --- | --- | --- |
| DoS Hulk | 56,320 | 100% | 15% | 61% |
| PortScan | 38,855 | 100% | 0% | 1% |
| DoS Slowhttptest | 1,345 | 100% | 75% | 90% |
| Bot | 479 | 79% | 2% | 0% |
| Infiltration | 9 | 67% | 67% | 89% |
| Heartbleed | 3 | 100% | 100% | 100% |

The supervised model wins almost everywhere, and it is weakest on Bot and
Infiltration, the two families with the fewest labelled examples. Those are
exactly the families where the unsupervised models still have something to say.
The autoencoder beats the random forest on Infiltration. Neither unsupervised
model sees a port scan at all, because a port scan looks like a very small,
very ordinary flow.

That is the argument for keeping all three rather than shipping the one with
the best headline number.

## Reading the code

In this order:

1. [src/ids/data/explore.py](src/ids/data/explore.py) what the dataset looks like
2. [src/ids/config.py](src/ids/config.py) paths, sessions, which columns are features
3. [src/ids/data/preprocess.py](src/ids/data/preprocess.py) cleaning and splitting
4. [src/ids/models/scaling.py](src/ids/models/scaling.py) why a signed logarithm
5. [src/ids/models/autoencoder.py](src/ids/models/autoencoder.py) the network
6. [src/ids/train.py](src/ids/train.py) the three models and their thresholds
7. [src/ids/detectors.py](src/ids/detectors.py) the shared serving interface
8. [src/ids/benchmark.py](src/ids/benchmark.py) the metrics that matter here
9. [src/ids/validate.py](src/ids/validate.py) how much the split flatters everything

Then the API in [src/ids/api/](src/ids/api/) and the dashboard in
[frontend/src/](frontend/src/).

## Decisions worth explaining

**Why the labelled flow release.** CICIDS2017 ships in two forms. The widely
used machine learning CSVs keep the 78 flow features and drop the addresses. The
labelled flow release keeps the same features and adds source and destination
IP, ports, protocol and timestamp. Without addresses the threat intelligence
lookups would have nothing real to look up. The feature set handed to the models
is the standard one either way.

**Why accuracy is never quoted.** Four flows in five are benign. A model that
never raises an alert scores above 80 percent. Recall and false positive rate
are the only numbers that mean anything here.

**Why a signed logarithm rather than a quantile transform.** The features are
extremely heavy tailed: the largest value of some columns sits nine thousand
times above the 99th percentile. A quantile transform handles that well and cost
20 ms to transform a single row, which was more than all three models spent
deciding put together. A signed logarithm compresses the same tails in
microseconds.

**Why the tree models drop to one worker when serving.** Training spreads over
every core. Serving scores one flow at a time, and handing a single row to a
thread pool costs more than the work itself. Dropping to one worker took the
random forest from about 17 ms per flow to about 3 ms.

**Why the replay is shuffled.** The capture runs Monday to Friday and Monday is
benign only, so a strictly chronological replay spends its first quarter with
nothing to detect. Shuffling gives every second of the stream the attack density
of the capture as a whole. Chronological order is still available with
`--replay-order chronological`.

**Why the unsupervised models share one threshold rule.** Both are fitted on
benign traffic only, and both take their threshold from the benign score
distribution at the same target false positive rate. Without that they would be
compared at whatever operating point each library happened to default to.

## Tests

```bash
.venv/Scripts/python.exe -m pytest
```

Covers the scaler, the cleaning step and the threat intelligence client. The
scaler tests found a real bug: a feature that never varies has a standard
deviation around 1e-16 rather than zero, so the guard against dividing by zero
never fired.

## Threat intelligence keys

Optional. Shodan and GreyNoise answer without an account, so enrichment works on
a fresh clone. Copy `.env.example` to `.env` and fill in the two free keys to
add the reputation sources:

- <https://www.virustotal.com/gui/my-apikey>
- <https://www.abuseipdb.com/account/api>

## Dataset

Sharafaldin, Lashkari and Ghorbani, *Toward Generating a New Intrusion Detection
Dataset and Intrusion Traffic Characterization*, ICISSP 2018.
<https://www.unb.ca/cic/datasets/ids-2017.html>
