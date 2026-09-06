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
| Sweeps | Hyperparameter curves, so the chosen values are read off a chart |
| Curves | ROC, precision recall, threshold trade off, feature distributions |
| Validation | Measures how much the split flatters the models |
| Novelty | What happens on an attack family nobody trained on |
| API | FastAPI, REST plus a WebSocket that replays traffic |
| Dashboard | Next.js and shadcn, five pages, one question each |
| Threat intel | VirusTotal, AbuseIPDB, Shodan and GreyNoise |
| Written report | Five pages in LaTeX, figures drawn from the same JSON |

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

Preprocessing takes about two minutes, training about seven, the benchmark
about four. Training writes to `models/`, the benchmark to
[reports/benchmark.md](reports/benchmark.md).

The four experiments behind the Tuning and Evidence pages are optional and can
run in any order. Everything else works without them.

```bash
.venv/Scripts/python.exe -m ids.sweep
.venv/Scripts/python.exe -m ids.curves
.venv/Scripts/python.exe -m ids.validate
.venv/Scripts/python.exe -m ids.novelty
```

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

Five pages, each answering one question, so a reader is never asked to hold the
whole system in their head at once.

**Overview** is what the sensor is doing right now: flows replayed, alerts
raised, attacks missed and the false positive rate, all for the random forest
because that is the model that would actually be deployed. The replay control
sets the speed from 4 to 80 flows per second. Every flow it sends was held out
before training, so nothing on screen was ever seen by a model.

**Live traffic** is who is being flagged. One row per flow that at least one
model flagged, with the ground truth beside it, so a real catch and a false
positive are visible at a glance and the verdict column shows which models
agreed. The threat intelligence panel says what the outside world knows about
the public addresses behind those alerts. The running scoreboard recomputes
recall and false positive rate from the flows that have gone past on this
connection, and watching it converge on the benchmark is the check that the
served models are the ones that were measured.

**Models** is the comparison table, recall per attack family, and inference
latency measured live rather than quoted.

**Tuning** is how each model was sized. Four charts, one per decision, read off
the sweep rather than asserted.

**Evidence** is why the numbers should be believed. ROC curves, the threshold
trade off with the operating point in use marked, where benign and attack
scores actually sit, what the forest looks at and how those measurements are
distributed, plus the split validation and the unseen attack results.

## Tuning, what the sweeps say

```bash
.venv/Scripts/python.exe -m ids.sweep
```

Three findings, and two of them changed the configuration.

**The random forest does not need 100 trees.** Recall sits between 99.76 and
99.78 percent from five trees all the way to two hundred, while the time to
score one flow goes from 0.33 ms to 6.70 ms. Every tree after the first handful
buys nothing and costs latency, so the forest is sized for the latency budget.
Dropping to 50 halved the served latency, from 3.09 ms to 1.66 ms per flow,
with no measurable change in recall.

**The isolation forest was crippled by a library default.** Recall climbs
monotonically with the number of flows each tree is fitted on: 0.95 percent at
128 samples, 2.5 percent at 4096, 17.0 percent at 16384. The scikit-learn
default is 256, which sits near the worst end of that curve. Moving to 16384
took recall from 11.3 to 17.2 percent at the same false positive rate.

**The autoencoder loss and its detection quality disagree.** Over 25 epochs the
training loss falls steadily from 0.540 to 0.036, but the ranking quality peaks
at epoch 7 with an area of 0.932 and then drifts back down to 0.918, while
recall keeps climbing until about epoch 16 and then flattens. Training longer
makes the reconstruction better without making the detector better, which is
the reason both are measured every epoch rather than just the loss.


## Results

Measured on 691,941 held out flows, 136,187 of them attacks. Both unsupervised
models are thresholded on the benign score distribution at a 1 percent target
false positive rate, so the comparison is fair.

| Model | Type | Recall | False positives | Precision | ROC AUC | Latency per flow |
| --- | --- | --- | --- | --- | --- | --- |
| Random Forest | supervised | 99.87% | 0.07% | 99.70% | 1.000 | 1.66 ms |
| Isolation Forest | unsupervised | 17.24% | 1.01% | 80.66% | 0.921 | 3.29 ms |
| Autoencoder | deep learning | 37.69% | 1.01% | 90.15% | 0.930 | 0.33 ms |

Both the forest size and the isolation forest sample size come off the sweep
curves rather than from a round number.

The headline is not the interesting part. This is:

| Attack family | Flows | Random Forest | Isolation Forest | Autoencoder |
| --- | --- | --- | --- | --- |
| DoS Hulk | 56,320 | 100% | 28% | 61% |
| PortScan | 38,855 | 100% | 0% | 1% |
| DoS Slowhttptest | 1,345 | 100% | 89% | 90% |
| Bot | 479 | 81% | 3% | 0% |
| Infiltration | 9 | 67% | 67% | 89% |
| Heartbleed | 3 | 100% | 100% | 100% |

The supervised model wins almost everywhere, and it is weakest on Bot and
Infiltration, the two families with the fewest labelled examples. Those are
exactly the families where the unsupervised models still have something to say.
The autoencoder beats the random forest on Infiltration, 89 percent against 67.
Neither unsupervised model sees a port scan at all, because a port scan is a
very small, very ordinary looking flow and neither of them is asking whether a
flow is ordinary for its port.

That is the argument for keeping all three rather than shipping the one with
the best headline number.

## What happens on an attack nobody trained on

```bash
.venv/Scripts/python.exe -m ids.novelty
```

The random forest works under a closed world assumption. It can only recognise
the families it was shown, and real traffic does not agree to stay inside a
training set. So one family at a time is removed from training, all three
models are refitted on what is left, and each is asked about the family none of
them was told about.

| Held out family | Flows | Random Forest | Isolation Forest | Autoencoder |
| --- | --- | --- | --- | --- |
| PortScan | 11,231 | 0.0% | 0.1% | 0.2% |
| DDoS | 9,053 | 63.9% | 1.9% | 33.7% |
| Bot | 138 | 0.0% | 2.2% | 0.0% |
| FTP-Patator | 561 | 0.0% | 0.0% | 0.0% |
| DoS slowloris | 410 | 89.8% | 32.2% | 28.0% |
| Web Attack Brute Force | 107 | 80.4% | 0.0% | 0.0% |

This did not come out the way the pitch for an ensemble usually goes, and the
result is more useful than that pitch would have been.

**The supervised model does not fail gracefully, it fails unpredictably.** On
three of the six families it drops from near perfect to zero. On the other
three it holds up, and the pattern behind that is not subtle: it generalises
when something structurally similar is still in the training data. DDoS
survives because DoS Hulk is still there. Slowloris survives because the other
slow denial of service families are. Web brute force survives because cross
site scripting and SQL injection are. PortScan, Bot and FTP-Patator have no
close relative left, and the model goes to zero on all three.

**The unsupervised models are not a safety net either.** They add something
real on two families, 33.7 percent on DDoS and 32.2 percent on slowloris, and
nothing at all on the other four. A port scan or a single bot callback is a
small, ordinary looking flow, and asking whether a flow is unusual in general
is not the same question as asking whether it is unusual for its port.

So the honest conclusion is not that three models cover each other. It is that
none of these approaches handles a genuinely new attack on its own, and a
system built on them needs a retraining pipeline and human review rather than a
detector that is assumed to catch the unknown. Where the ensemble does earn its
place is narrower and measurable: on the rare families in the main benchmark,
where the autoencoder reaches 89 percent on Infiltration against the forest's
67, and on the two families above where it recovers a third of what the
supervised model lost.

## How much does the split flatter these numbers

A random train and test split on CICIDS2017 is generous, and it is worth
knowing by how much before quoting anything above.

A denial of service burst produces thousands of flows that are identical in
every feature, so a random split puts copies of the same row on both sides.
Measured: 2,497,153 distinct feature vectors for 2,827,761 flows, 14.1 percent
of a random test split has an identical twin in the train half, and 27.8
percent of the test attacks do.

The second issue is time. A random split lets a model see the first half of an
attack burst and be graded on the second half. A real sensor is trained on what
happened before it was deployed and judged on what comes after. Training on the
earlier part of every capture session and testing on the later part removes
that.

| Model | Recall random | Recall time ordered | False positives random | False positives time ordered |
| --- | --- | --- | --- | --- |
| Random Forest | 99.9% | 98.5% | 0.08% | 0.03% |
| Isolation Forest | 6.9% | 1.8% | 0.99% | 0.81% |
| Autoencoder | 43.2% | 22.8% | 1.03% | 0.94% |

The supervised model barely moves, and its false positive rate improves. So the
duplicates are real but they are not what is producing the headline number: the
random forest genuinely generalises across the families it was trained on.

The unsupervised models are the ones that lose half their recall or more, and
that is the honest finding. Their thresholds are fitted on the benign traffic of
the training window, and benign traffic drifts within a working day, so a
threshold calibrated on the morning is already slightly wrong by the afternoon.
Anything deployed this way needs its threshold recalibrated on a rolling window
rather than fixed once at training time.

Reproduce with:

```bash
.venv/Scripts/python.exe -m ids.validate
```

The random split numbers there differ a little from the benchmark table above
because the script re-splits the whole dataset from scratch, replay rows
included, and refits everything. The gap between the two is a fair picture of
how much these figures move with the split alone.

What neither split measures is a genuinely new attack. The random forest works
under a closed world assumption: it can only recognise the fourteen families it
was shown. That limitation is the reason the two unsupervised models are in the
project at all.

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
9. [src/ids/sweep.py](src/ids/sweep.py) where the chosen hyperparameters come from
10. [src/ids/curves.py](src/ids/curves.py) ROC, thresholds, feature distributions
11. [src/ids/validate.py](src/ids/validate.py) how much the split flatters everything
12. [src/ids/novelty.py](src/ids/novelty.py) what happens on an unseen attack family

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

## The written report

A five page comparison in [report/main.tex](report/main.tex), covering the
dataset and the preprocessing decisions, the three models, the hyperparameter
study, the results and the two validation experiments. Every figure is drawn by
a command from the same JSON the dashboard reads, so the paper and the browser
cannot tell different stories.

```bash
.venv/Scripts/python.exe -m ids.report.figures
cd report && pdflatex -output-directory=build main.tex
```

Run pdflatex twice so the figure references resolve. Needs a LaTeX distribution
and `matplotlib`, which is in `requirements-dev.txt`.

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
