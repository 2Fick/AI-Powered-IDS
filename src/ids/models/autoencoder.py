"""A small dense autoencoder used as an unsupervised detector.

The network is trained on benign flows only. At inference time the
reconstruction error stands in for an anomaly score: benign traffic looks like
what the network has seen, attacks do not, so their error is higher. The
decision threshold is picked from the error distribution of benign traffic,
which lets us set a target false positive rate directly.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset


@dataclass
class TrainingConfig:
    epochs: int = 20
    batch_size: int = 4096
    learning_rate: float = 1e-3
    latent_dim: int = 8
    hidden_dims: tuple[int, ...] = (48, 24)
    seed: int = 42


class Autoencoder(nn.Module):
    def __init__(
        self,
        input_dim: int,
        hidden_dims: tuple[int, ...] = (48, 24),
        latent_dim: int = 8,
    ) -> None:
        super().__init__()
        self.input_dim = input_dim
        self.hidden_dims = tuple(hidden_dims)
        self.latent_dim = latent_dim

        encoder_layers: list[nn.Module] = []
        previous = input_dim
        for size in hidden_dims:
            encoder_layers += [nn.Linear(previous, size), nn.BatchNorm1d(size), nn.ReLU()]
            previous = size
        encoder_layers.append(nn.Linear(previous, latent_dim))
        self.encoder = nn.Sequential(*encoder_layers)

        decoder_layers: list[nn.Module] = []
        previous = latent_dim
        for size in reversed(hidden_dims):
            decoder_layers += [nn.Linear(previous, size), nn.BatchNorm1d(size), nn.ReLU()]
            previous = size
        decoder_layers.append(nn.Linear(previous, input_dim))
        self.decoder = nn.Sequential(*decoder_layers)

    def forward(self, batch: torch.Tensor) -> torch.Tensor:
        return self.decoder(self.encoder(batch))


def train_autoencoder(
    benign: np.ndarray,
    config: TrainingConfig | None = None,
    device: str = "cpu",
    verbose: bool = True,
) -> Autoencoder:
    config = config or TrainingConfig()
    torch.manual_seed(config.seed)

    tensor = torch.from_numpy(np.asarray(benign, dtype=np.float32))
    loader = DataLoader(
        TensorDataset(tensor),
        batch_size=config.batch_size,
        shuffle=True,
        drop_last=True,
    )

    model = Autoencoder(
        input_dim=tensor.shape[1],
        hidden_dims=config.hidden_dims,
        latent_dim=config.latent_dim,
    ).to(device)
    optimiser = torch.optim.Adam(model.parameters(), lr=config.learning_rate)
    schedule = torch.optim.lr_scheduler.CosineAnnealingLR(optimiser, T_max=config.epochs)
    criterion = nn.MSELoss()

    model.train()
    for epoch in range(1, config.epochs + 1):
        running = 0.0
        seen = 0
        for (batch,) in loader:
            batch = batch.to(device)
            optimiser.zero_grad()
            loss = criterion(model(batch), batch)
            loss.backward()
            optimiser.step()
            running += loss.item() * len(batch)
            seen += len(batch)
        schedule.step()
        if verbose:
            print(f"    epoch {epoch:>2}/{config.epochs}  loss {running / seen:.6f}")

    model.eval()
    return model


@torch.no_grad()
def reconstruction_error(
    model: Autoencoder,
    features: np.ndarray,
    device: str = "cpu",
    batch_size: int = 8192,
) -> np.ndarray:
    """Mean squared error per row, which is the anomaly score."""
    model.eval()
    tensor = torch.from_numpy(np.asarray(features, dtype=np.float32))
    scores = []
    for start in range(0, len(tensor), batch_size):
        batch = tensor[start : start + batch_size].to(device)
        rebuilt = model(batch)
        scores.append(((rebuilt - batch) ** 2).mean(dim=1).cpu().numpy())
    return np.concatenate(scores) if scores else np.empty(0, dtype=np.float32)
