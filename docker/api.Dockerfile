# Image for the detection API.
#
# PyTorch is pulled from the CPU wheel index. The default Linux wheel on PyPI
# bundles CUDA and weighs several gigabytes, which this project has no use for:
# the autoencoder is a small dense network over 69 tabular features and scores a
# flow in well under a millisecond on a CPU.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt ./
RUN grep -v '^torch' requirements.txt > /tmp/requirements-core.txt \
    && pip install --no-cache-dir -r /tmp/requirements-core.txt \
    && pip install --no-cache-dir torch==2.5.1 \
       --index-url https://download.pytorch.org/whl/cpu

COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir --no-deps -e .

# The trained models and the replay split are mounted at run time rather than
# baked in. They are build output, not source, and together they are far larger
# than the rest of the image.
ENV IDS_MODELS_DIR=/app/models \
    IDS_DATA_DIR=/app/data \
    IDS_REPORTS_DIR=/app/reports

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"

CMD ["uvicorn", "ids.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
