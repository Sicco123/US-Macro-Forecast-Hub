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

for name, native in [('Chronos', SimpleNamespace(predict_quantiles=chronos)),
                     ('Toto', SimpleNamespace(forecast=toto))]:
    model = SimpleNamespace(_get_model=lambda: nullcontext(native), device='cpu',
                            num_samples=128, samples_per_batch=8)
    output = forecast_panel(model, history, name)
    assert set(output.unique_id) == {'AUX', 'INDPRO'}
    assert len(output) == 2 * HORIZONS
    assert output.ds.min() == pd.Timestamp('2002-09-30')

def timesfm(frame, **kwargs):
    pd.testing.assert_frame_equal(frame, history)
    return frame

forecast_panel(SimpleNamespace(forecast=timesfm), history, 'TimesFM')
print('Panel inference checks passed: all variables, joint grouping, masks, and dates.')
