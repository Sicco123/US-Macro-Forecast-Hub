"""Run with: PYTHONPATH=. python tests/foundation.py (no weights/downloads)."""
import json
import os
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

from src.models.foundation import CHECKPOINTS, TARGETS, load_fred_panel, prepare_history, hub_rows
from src.validation.validate_forecast import validate_forecast_file
from src.validation.validate_metadata import validate_metadata_file

months = pd.date_range('2018-01-31', periods=49, freq='ME')
truth = pd.concat([pd.DataFrame({'target': t, 'truth_date': months,
                               'value': np.arange(100., 149.)}) for t in TARGETS])
origin = '2022-01-17'
history = prepare_history(truth, origin)
assert history.groupby('unique_id').size().eq(47).all()
assert history.ds.max() == pd.Timestamp('2021-12-31')
np.testing.assert_allclose(history.loc[history.unique_id == 'UNRATE', 'y'], 1)
np.testing.assert_allclose(history.loc[history.unique_id == 'INDPRO', 'y'].iloc[-1], np.log(147/146))
# Future truth has no influence on the input window.
future_changed = truth.copy()
future_changed.loc[future_changed.truth_date >= origin, 'value'] = -1
pd.testing.assert_frame_equal(prepare_history(future_changed, origin), history)
# A missing final month must not shift horizon zero into the previous month.
tail_gap = prepare_history(truth.loc[truth.truth_date != '2021-12-31'], origin)
assert tail_gap.groupby('unique_id').ds.max().eq(pd.Timestamp('2021-12-31')).all()
assert tail_gap.loc[tail_gap.ds == '2021-12-31', 'y'].eq(0).all()

# A non-target variable must reach the model and be validated before extraction.
panel_truth = pd.concat([truth, truth.loc[truth.target == 'UNRATE'].assign(target='AUX')])
panel_history = prepare_history(panel_truth, origin, {'AUX': 1})
assert set(panel_history.unique_id) == {*TARGETS, 'AUX'}
assert panel_history.loc[panel_history.unique_id == 'AUX', 'y'].iloc[-1] == 147
future_changed = panel_truth.copy()
future_changed.loc[future_changed.truth_date >= origin, 'value'] = -1
pd.testing.assert_frame_equal(prepare_history(future_changed, origin, {'AUX': 1}), panel_history)
second_diff = prepare_history(panel_truth, origin, {'AUX': 6})
np.testing.assert_allclose(second_diff.loc[second_diff.unique_id == 'AUX', 'y'].iloc[-1],
                           np.log(147) - 2*np.log(146) + np.log(145))
missing_aux = panel_truth.copy()
missing_aux.loc[(missing_aux.target == 'AUX') & missing_aux.truth_date.isin(
    pd.to_datetime(['2021-08-31', '2021-09-30'])), 'value'] = np.nan
masked = prepare_history(missing_aux, origin, {'AUX': 1})
assert masked.loc[(masked.unique_id == 'AUX') & (masked.ds == '2021-09-30'), 'y'].isna().all()

with tempfile.TemporaryDirectory() as tmp:
    os.environ['HUB_SKIP_WINDOW_CHECK'] = '1'
    schema = json.loads(Path('hub-config/model-metadata-schema.json').read_text())
    for model in CHECKPOINTS:
        output = pd.concat([pd.DataFrame({'unique_id': t,
            'ds': pd.date_range('2022-01-31', periods=24, freq='ME'), model: 99,
            **{f'{model}-q-{q}': value for q, value in zip([5,10,50,90,95], [-2,-1,0,1,2])}
        }) for t in TARGETS])
        records = hub_rows(output, history, origin, model)
        assert len(records) == 4*24*(6 if model == 'TimesFM' else 5)
        assert records.horizon.min() == 0 and records.horizon.max() == 23
        if model != 'TimesFM':
            assert not (records.output_type == 'mean').any()
        path = Path(tmp) / f'{origin}-BASELINE-{model}.csv'
        records.to_csv(path, index=False)
        assert not validate_forecast_file(str(path))
        assert not validate_metadata_file(f'model-metadata/BASELINE-{model}.yml', schema)
        panel_output = pd.concat([output, output.loc[output.unique_id == 'UNRATE'].assign(unique_id='AUX')])
        pd.testing.assert_frame_equal(hub_rows(panel_output, panel_history, origin, model), records)
        for broken in [output.iloc[1:], output.assign(**{f'{model}-q-5': 3}),
                       output.assign(**{f'{model}-q-50': np.nan}),
                       output.drop(columns=[f'{model}-q-95'])]:
            try:
                hub_rows(broken, history, origin, model)
            except ValueError:
                pass
            else:
                raise AssertionError('Invalid forecasts accepted')
        try:
            hub_rows(output, panel_history, origin, model)
        except ValueError:
            pass
        else:
            raise AssertionError('Target-only output accepted for a full-panel input')
        invalid_aux = panel_output.copy()
        invalid_aux.loc[invalid_aux.unique_id == 'AUX', f'{model}-q-5'] = 3
        try:
            hub_rows(invalid_aux, panel_history, origin, model)
        except ValueError:
            pass
        else:
            raise AssertionError('Invalid auxiliary forecasts accepted before extraction')
    gap = prepare_history(truth.drop(index=truth.index[2]), origin)
    assert gap.loc[(gap.unique_id == 'UNRATE') & (gap.ds == '2018-03-31'), 'y'].iloc[0] == 0
    assert gap.loc[(gap.unique_id == 'UNRATE') & (gap.ds == '2018-04-30'), 'y'].iloc[0] == 2
    for broken in [truth.drop(index=[2,3]), truth.assign(value=np.inf)]:
        try:
            prepare_history(broken, origin)
        except ValueError:
            pass
        else:
            raise AssertionError('Invalid history accepted')
    fred_csv = Path(tmp) / 'fred-md.csv'
    pd.DataFrame({'sasdate': ['Transform:', '1/1/2020'], 'INDPRO': [5, 100]}).to_csv(fred_csv, index=False)
    loaded, codes = load_fred_panel(fred_csv)
    assert codes == {'INDPRO': 5}
    assert loaded.truth_date.iloc[0] == pd.Timestamp('2020-01-31')
print('Foundation checks passed: transformations, cutoff, quantile columns, dates, means, metadata, and forecast validation.')
