"""Run with .venv-foundation/bin/python tests/panel_inference.py; no weights needed."""
from contextlib import nullcontext
from types import SimpleNamespace

import numpy as np
import pandas as pd
import torch

from src.models.foundation import HORIZONS, REQUIRED_QUANTILES, forecast_panel

history = pd.DataFrame({
    'unique_id': np.repeat(['AUX', 'INDPRO'], 32),
    'ds': np.tile(pd.date_range('2000-01-31', periods=32, freq='ME'), 2),
    'y': np.r_[np.nan, np.arange(1., 32.), np.arange(32.)],
})

def chronos(inputs, **kwargs):
    assert len(inputs) == 1 and inputs[0].shape == (2, 32)
    assert torch.isnan(inputs[0][0, 0])
    assert kwargs['batch_size'] == 2  # The group cannot be split into batches.
    return [torch.zeros(2, HORIZONS, len(REQUIRED_QUANTILES))], [torch.zeros(2, HORIZONS)]

def toto(inputs, **kwargs):
    assert inputs.series.shape == (2, 32)
    assert inputs.id_mask.eq(0).all()  # Every variable can attend to every other.
    assert not inputs.padding_mask[0, 0] and inputs.padding_mask[1].all()
    assert torch.isfinite(inputs.series).all()
    return SimpleNamespace(quantile=lambda qs: torch.zeros(len(qs), 1, 2, HORIZONS))

def backbone(series, mask, ids, **kwargs):
    assert series.shape == (1, 2, 64)
    assert ids.eq(0).all() and torch.isfinite(series).all()
    assert not mask[0, 0, :33].any() and mask[0, 1, -32:].all()
    embeddings = torch.arange(64.).view(1, 1, 64, 1).expand(1, 2, 64, 1)
    return embeddings, torch.zeros_like(series), torch.ones_like(series)

def output_distribution(embeddings):
    # Forecast the first 24 positions of the LAST output patch.
    torch.testing.assert_close(embeddings[0, 0, :, 0], torch.arange(24.))
    return torch.distributions.Normal(embeddings[..., 0], torch.ones_like(embeddings[..., 0]))

toto_native = SimpleNamespace(forecast=toto,
    model=SimpleNamespace(patch_embed=SimpleNamespace(stride=64), backbone=backbone,
                          output_distribution=output_distribution),
    create_affine_transformed=lambda base, loc, scale: base)

for name, native in [('Chronos', SimpleNamespace(predict_quantiles=chronos)),
                     ('Toto', toto_native)]:
    model = SimpleNamespace(_get_model=lambda: nullcontext(native), device='cpu',
                            num_samples=128, samples_per_batch=8)
    output = forecast_panel(model, history, name)
    assert set(output.unique_id) == {'AUX', 'INDPRO'}
    assert len(output) == 2 * HORIZONS
    assert output.ds.min() == pd.Timestamp('2002-09-30')
    assert np.isfinite(output.filter(like='-q-')).all().all()

def timesfm(frame, **kwargs):
    pd.testing.assert_frame_equal(frame, history)
    return frame

forecast_panel(SimpleNamespace(forecast=timesfm), history, 'TimesFM')
# A longer horizon still uses native autoregressive sampling.
toto_native.model.patch_embed.stride = 16
forecast_panel(SimpleNamespace(_get_model=lambda: nullcontext(toto_native), device='cpu',
                               num_samples=128, samples_per_batch=8), history, 'Toto')

# Compare the optimized distribution with a tiny real Toto model, without weights.
from toto.data.util.dataset import MaskedTimeseries
from toto.inference.forecaster import TotoForecaster
from toto.model.backbone import TotoBackbone

torch.manual_seed(0)
tiny = TotoBackbone(patch_size=64, stride=64, embed_dim=12, num_layers=1,
    num_heads=3, mlp_hidden_dim=24, dropout=0, spacewise_every_n_layers=1,
    scaler_cls="<class 'model.scaler.CausalPatchStdMeanScaler'>",
    output_distribution_classes=["<class 'model.distribution.MixtureOfStudentTsOutput'>"],
    output_distribution_kwargs={'k_components': 2}, use_memory_efficient_attention=False)
native = TotoForecaster(tiny)
distributions = []

def capture(base, loc, scale):
    distribution = native.create_affine_transformed(base, loc, scale)
    distributions.append(distribution)
    return distribution

spy = SimpleNamespace(model=tiny, create_affine_transformed=capture)
forecast_panel(SimpleNamespace(_get_model=lambda: nullcontext(spy), device='cpu',
                               num_samples=128, samples_per_batch=8), history, 'Toto')
values = torch.tensor(history.pivot(index='ds', columns='unique_id', values='y').to_numpy().T,
                      dtype=torch.float32)
inputs = MaskedTimeseries(series=values.nan_to_num(), padding_mask=torch.isfinite(values),
    id_mask=torch.zeros_like(values, dtype=torch.long), timestamp_seconds=torch.zeros_like(values),
    time_interval_seconds=torch.ones(len(values)))
reference = native.forecast(inputs, prediction_length=HORIZONS, num_samples=None, use_kv_cache=False)
torch.testing.assert_close(distributions[0].mean, reference.mean, rtol=1e-5, atol=1e-6)
print('Panel inference checks passed: all variables, joint grouping, masks, and dates.')
