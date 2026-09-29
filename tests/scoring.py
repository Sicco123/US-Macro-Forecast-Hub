"""Run with: PYTHONPATH=. python tests/scoring.py."""
import numpy as np
from src.scoring.score_forecasts import quantile_loss

# Five asymmetric pinball losses: .1, .1, 0, .1, .1.
np.testing.assert_allclose(quantile_loss([2], [[0, 1, 2, 3, 4]]), [.08])
np.testing.assert_allclose(quantile_loss([2], [[2, 2, 2, 2, 2]]), [0])
assert np.isnan(quantile_loss([2], [[0, 1, np.nan, 3, 4]])[0])
print('Quantile-loss checks passed.')
