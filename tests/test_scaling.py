import numpy as np

from ids.models.scaling import LogStandardScaler


def test_compresses_heavy_tails():
    features = np.array([[1.0], [2.0], [3.0], [1_000_000.0]])
    scaled = LogStandardScaler().fit_transform(features)[:, 0]

    plain = features[:, 0]
    plain = (plain - plain.mean()) / plain.std()

    # Plain standardisation squeezes the three small values into almost the
    # same number, because the outlier sets the scale on its own. Compressing
    # first keeps them apart, which is the whole point.
    assert abs(plain[2] - plain[0]) < 1e-5
    assert abs(scaled[2] - scaled[0]) > 0.1
    assert scaled[3] == scaled.max()


def test_handles_negative_values():
    features = np.array([[-500.0], [-1.0], [0.0], [1.0], [500.0]])
    scaled = LogStandardScaler().fit_transform(features)
    assert np.all(np.diff(scaled[:, 0]) > 0)


def test_constant_feature_does_not_divide_by_zero():
    features = np.array([[5.0, 1.0], [5.0, 2.0], [5.0, 3.0]])
    scaled = LogStandardScaler().fit_transform(features)
    assert np.all(np.isfinite(scaled))
    assert np.allclose(scaled[:, 0], 0.0)


def test_transform_matches_fit_transform():
    rng = np.random.default_rng(0)
    features = rng.exponential(scale=1000.0, size=(200, 4))
    scaler = LogStandardScaler().fit(features)
    assert np.allclose(scaler.transform(features), scaler.fit_transform(features))
