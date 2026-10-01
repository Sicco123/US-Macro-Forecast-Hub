"""Run with: PYTHONPATH=. python tests/scoring.py."""
import numpy as np
import pandas as pd
from unittest.mock import patch
from src.scoring.score_forecasts import quantile_loss, score_all, Q_LEVELS

# Five asymmetric pinball losses: .1, .1, 0, .1, .1.
np.testing.assert_allclose(quantile_loss([2], [[0, 1, 2, 3, 4]]), [.08])
np.testing.assert_allclose(quantile_loss([2], [[2, 2, 2, 2, 2]]), [0])
assert np.isnan(quantile_loss([2], [[0, 1, np.nan, 3, 4]])[0])
# A missing February level makes March's monthly change unobservable.
truth = pd.concat([pd.DataFrame({'target': target,
    'truth_date': ['2020-01-31', '2020-03-31', '2020-04-30'], 'value': [100, 110, 120]})
    for target in ['INDPRO', 'CPIAUCSL', 'PCEPI', 'UNRATE']], ignore_index=True)
rows = []
for target in truth.target.unique():
    for month in ['2020-03-31', '2020-04-30']:
        for q in Q_LEVELS:
            rows.append(dict(origin_date='2020-02-17', target=target, target_end_date=month,
                horizon=1 if month=='2020-03-31' else 2, location='US', team_id='MacroHub',
                model_id='RandomWalk', output_type='quantile', output_type_id=q, value=.01))
rows.append(dict(origin_date='2020-02-17', target='INDPRO', target_end_date='2020-04-30',
    horizon=2, location='US', team_id='MacroHub', model_id='RandomWalk',
    output_type='mean', output_type_id='', value=.02))
with patch('src.scoring.score_forecasts.pd.read_csv', return_value=truth), \
     patch('src.scoring.score_forecasts.load_all_forecasts', return_value=pd.DataFrame(rows)):
    scores = score_all()
assert not scores.empty
assert set(scores.target_end_date) == {'2020-04-30'}
assert set(scores.metric) == {'MAE', 'SqErr', 'QuantileLoss'}
unrate = scores[(scores.target == 'UNRATE') & (scores.metric == 'SqErr')]
np.testing.assert_allclose(unrate.value_absolute, [(10 - .01) ** 2])
indpro = scores[(scores.target == 'INDPRO') & (scores.metric == 'SqErr')]
np.testing.assert_allclose(indpro.value_absolute, [(np.log(120/110) - .02) ** 2])
print('Scoring checks passed: pinball loss, median RMSE fallback, and missing-month truth exclusion.')
