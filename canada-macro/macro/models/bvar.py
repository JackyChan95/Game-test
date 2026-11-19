"""Bayesian VAR with a Minnesota prior, implemented with dummy observations.

Following Banbura, Giannone & Reichlin (2010), the Minnesota prior is imposed
by appending artificial observations to the data. With a Normal-inverse-Wishart
posterior this gives closed-form posterior moments and exact draws:

    Sigma | Y  ~ IW(S, T* - k)
    B | Sigma  ~ N(B_hat, Sigma (x) (X*'X*)^-1)

Prior: own first lag mean = delta_i (0 for differenced/stationary data), lag l
coefficients shrink as lambda / l, a loose prior on the intercept.
Lag order is chosen by BIC on the OLS VAR (statsmodels), as requested.

COVID treatment: observations dated in ``EXCLUDE`` (Mar-Aug 2020) are dropped
as *dependent* rows (they still serve as lagged regressors), following
Schorfheide & Song (2021). Without this, the 2020 collapse dominates the
estimated dynamics; e.g. from an April 2020 origin the VAR projected a further
~60% fall in BC employment.
"""
import numpy as np
import pandas as pd
from scipy.stats import invwishart
from statsmodels.tsa.api import VAR

EXCLUDE = ("2020-03-01", "2020-08-01")


def covid_mask(index) -> np.ndarray:
    """True for dates inside the excluded COVID window."""
    idx = pd.DatetimeIndex(index)
    return np.asarray((idx >= EXCLUDE[0]) & (idx <= EXCLUDE[1]))


def select_lags_bic(Y: pd.DataFrame, maxlags: int = 12) -> int:
    """BIC lag choice (statsmodels). COVID months are excluded here too."""
    # Excluded months are linearly interpolated, for lag selection only.
    keep = pd.Series(~covid_mask(Y.index), index=Y.index)
    Yv = Y.where(keep, axis=0).interpolate().values
    sel = VAR(Yv).select_order(maxlags=maxlags, trend="c")
    return max(1, int(sel.bic))


def _lagmat(Y: np.ndarray, p: int):
    """X_t = [y_{t-1}, ..., y_{t-p}, 1]; returns (Y_dep, X)."""
    T, n = Y.shape
    X = np.hstack([Y[p - l:T - l] for l in range(1, p + 1)] + [np.ones((T - p, 1))])
    return Y[p:], X


def _ar1_sigma(Y: np.ndarray) -> np.ndarray:
    """Residual std of a univariate AR(1) per series: the prior's scale."""
    s = []
    for i in range(Y.shape[1]):
        y = Y[1:, i]
        X = np.column_stack([np.ones(len(y)), Y[:-1, i]])
        e = y - X @ np.linalg.lstsq(X, y, rcond=None)[0]
        s.append(e.std(ddof=2))
    return np.array(s)


class MinnesotaBVAR:
    def __init__(self, p: int, lam: float = 0.2, delta=None, eps: float = 1e-3):
        self.p, self.lam, self.delta, self.eps = p, lam, delta, eps

    def fit(self, Y, exclude_covid: bool = True):
        self.names = list(Y.columns) if isinstance(Y, pd.DataFrame) else None
        mask = covid_mask(Y.index) if (exclude_covid and isinstance(Y, pd.DataFrame)) \
            else np.zeros(len(Y), bool)
        Y = np.asarray(Y, dtype=float)
        n, p, lam = Y.shape[1], self.p, self.lam
        delta = np.zeros(n) if self.delta is None else np.asarray(self.delta, float)
        sig = _ar1_sigma(Y)
        # Dummy observations: (1) lag coefficients, (2) residual covariance, (3) intercept.
        Yd1 = np.vstack([np.diag(delta * sig) / lam, np.zeros(((p - 1) * n, n))])
        Xd1 = np.hstack([np.kron(np.diag(np.arange(1, p + 1)), np.diag(sig)) / lam,
                         np.zeros((n * p, 1))])
        Yd2, Xd2 = np.diag(sig), np.zeros((n, n * p + 1))
        Yd3, Xd3 = np.zeros((1, n)), np.hstack([np.zeros((1, n * p)), [[self.eps]]])
        Yt, Xt = _lagmat(Y, p)
        keep = ~mask[p:]
        Yt, Xt = Yt[keep], Xt[keep]
        Ys = np.vstack([Yt, Yd1, Yd2, Yd3])
        Xs = np.vstack([Xt, Xd1, Xd2, Xd3])
        self.XtXi = np.linalg.inv(Xs.T @ Xs)
        self.B = self.XtXi @ Xs.T @ Ys                    # posterior mean, (np+1) x n
        E = Ys - Xs @ self.B
        self.S = E.T @ E
        self.df = Xs.shape[0] - Xs.shape[1]
        self.Sigma = self.S / (self.df - n - 1)           # posterior mean of Sigma
        self.Y = Y
        self.n = n
        return self

    # ------------------------------------------------------------------ draws
    def draw(self, rng):
        Sigma = invwishart.rvs(df=self.df, scale=self.S, random_state=rng)
        Z = rng.standard_normal(self.B.shape)
        B = self.B + np.linalg.cholesky(self.XtXi) @ Z @ np.linalg.cholesky(Sigma).T
        return B, Sigma

    def companion_stable(self, B) -> bool:
        n, p = self.n, self.p
        A = np.zeros((n * p, n * p))
        A[:n] = B[:n * p].T
        if p > 1:
            A[n:, :-n] = np.eye(n * (p - 1))
        return np.max(np.abs(np.linalg.eigvals(A))) < 1.0

    # ------------------------------------------------------------- forecasts
    def _iterate(self, B, h, shocks=None, history=None):
        hist = list((self.Y if history is None else history)[-self.p:])
        out = []
        for t in range(h):
            x = np.concatenate([hist[-l] for l in range(1, self.p + 1)] + [[1.0]])
            y = x @ B + (0 if shocks is None else shocks[t])
            out.append(y)
            hist.append(y)
        return np.array(out)

    def forecast_mean(self, h: int, history=None):
        return self._iterate(self.B, h, history=history)

    def simulate(self, h: int, ndraws: int = 2000, seed: int = 0):
        """Posterior predictive paths, shape (ndraws, h, n)."""
        rng = np.random.default_rng(seed)
        paths = np.empty((ndraws, h, self.n))
        for d in range(ndraws):
            B, Sigma = self.draw(rng)
            shocks = rng.multivariate_normal(np.zeros(self.n), Sigma, size=h)
            paths[d] = self._iterate(B, h, shocks)
        return paths

    # ------------------------------------------------------------------ IRFs
    def _ma(self, B, h):
        n, p = self.n, self.p
        A = [B[l * n:(l + 1) * n].T for l in range(p)]
        Psi = [np.eye(n)]
        for s in range(1, h + 1):
            Psi.append(sum(A[l] @ Psi[s - l - 1] for l in range(min(p, s))))
        return np.array(Psi)                                 # (h+1, n, n)

    def irf(self, shock: int, h: int = 24, ndraws: int = 1000, scale: float = 1.0, seed: int = 1):
        """Cholesky IRFs to variable ``shock``, normalised so its impact response = scale.

        Returns (irfs array (kept draws, h+1, n), share of explosive draws discarded).
        """
        rng = np.random.default_rng(seed)
        out, dropped = [], 0
        for _ in range(ndraws):
            B, Sigma = self.draw(rng)
            if not self.companion_stable(B):
                dropped += 1
                continue
            P = np.linalg.cholesky(Sigma)
            impulse = P[:, shock] / P[shock, shock] * scale
            out.append(self._ma(B, h) @ impulse)
        return np.array(out), dropped / ndraws
