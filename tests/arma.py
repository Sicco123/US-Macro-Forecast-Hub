"""Run: PYTHONPATH=. python tests/arma.py"""
from unittest.mock import patch
from types import SimpleNamespace

import numpy as np
from src.models.arma_bic import fit_arma, forecast_arma, select_arma_order
from src.generate_dashboard_data import _json_values

rng = np.random.default_rng(7)
window = rng.normal(size=120)
p, q = select_arma_order(window, max_p=1, max_q=1)
point, std = forecast_arma(window, p, q, 24)
# Estimation must not collapse small log changes to zero or depend on their units.
small_point, small_std = forecast_arma(window * .00001 + .002, p, q, 24)
np.testing.assert_allclose(small_point, point * .00001 + .002, rtol=1e-5)
np.testing.assert_allclose(small_std, std * .00001, rtol=1e-5)
assert np.isfinite(point).all() and (std >= 0).all()
assert _json_values([1e-12, None, np.nan]) == [1e-12, None, None]
failed = SimpleNamespace(mle_retvals={'converged': False})
with patch('src.models.arma_bic.ARIMA') as model:
    model.return_value.fit.return_value = failed
    try:
        fit_arma(window, 1, 0)
    except ValueError:
        pass
    else:
        raise AssertionError('Unconverged fit accepted')
    try:
        select_arma_order(window, max_p=0, max_q=0)
    except ValueError:
        pass
    else:
        raise AssertionError('Failed grid silently substituted a model')
print('ARMA checks passed: valid BIC fits, scale invariance, non-convergence rejection, and export precision.')
