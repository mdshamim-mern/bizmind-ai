# DemandIQ Forecast Backtest Methodology & Assumptions

> **Transparency Notice**: All benchmark numbers reported in BizMind AI come from a reproducible, **strict chronological 90-day holdout split** run on a synthetic dataset following the **Kaggle Store Item Demand** schema (`scripts/kaggle_demandiq_benchmark.py`). We explicitly label these as backtest simulation metrics — not live multi-store production telemetry.

---

## 1. Validation Protocol (Zero Future Leakage)

To prevent data leakage common in random train/test splits:
- **Dataset Schema**: 10 stores × 50 SKUs × 5 years of daily demand (Kaggle Store Item Demand format).
- **Split Method**: Strict chronological split — the **final 90 days** are held out exclusively for evaluation; all feature engineering, lag statistics, and seasonal averages are computed strictly from historical data preceding each forecast origin.
- **Reproducibility**: Run `python3 scripts/kaggle_demandiq_benchmark.py` locally to reproduce every metric.

---

## 2. Models Compared

| Model | Features Used | 90-Day Holdout WAPE | Forecast Bias | Simulated Service Level |
|---|---|---:|---:|---:|
| **Naive Weekly Baseline** | Same day last week (`y[t-7]`) | `18.6%` | `+3.4%` | `78.9%` |
| **BizMind Seasonal + Lag** | 7d/28d rolling lags + day-of-week + payday cycle | `12.8%` | `+1.1%` | `88.4%` |
| **BizMind + Weather & Festival** | Above + Open-Meteo Dhaka rainfall/heat + Eid/Ramadan flag | **`10.4%`** (`-44.1%` vs baseline) | **`+0.4%`** | **`92.2%`** |

### Metric Definitions
- **WAPE (Weighted Absolute Percentage Error)**:  
  $$\text{WAPE} = \frac{\sum |y_t - \hat{y}_t|}{\sum y_t}$$  
  Chosen over MAPE because WAPE remains stable when low-volume SKUs hit zero sales on quiet days.
- **Forecast Bias**:  
  $$\text{Bias} = \frac{\sum (\hat{y}_t - y_t)}{\sum y_t}$$  
  Positive bias indicates slight over-forecasting (safer against stockouts); negative bias indicates under-forecasting.

---

## 3. Privacy-Preserving 10-Store Federated Averaging (FedAvg)

To help newly onboarded shops with sparse history without exposing any competitor's sales:
- Each of the 10 participating stores trains local seasonal weights on-device/in-tenant.
- Only anonymized gradient updates are averaged via **FedAvg** (`0 bytes` of raw sales, customer names, or prices leave any shop).
- On cold-start stores (<30 days of history), FedAvg reduces WAPE by **15.1%** compared to isolated local models.

---

## 4. Explicit Financial & Inventory Policy Assumptions

All simulated cash-saved and stockout-reduction cards in the UI disclose the exact assumptions below:
1. **Average Unit Retail Price**: `৳180` across staple grocery SKUs.
2. **Supplier Lead Time**: `3 days` (with `2 days` for Meghna Traders verified via contract RAG).
3. **Monthly Holding Cost**: `2%` of average inventory value.
4. **Perishable Spoilage Window**: `4 days` for farm eggs; phased markdown (`15%`) elasticity `E = -2.4`.
5. **Weather Shock Elasticity (Digital Twin)**: Heavy rain reduces general walk-in traffic by `-5%/day` while lifting umbrella, tea, and instant-noodle demand by `+40%`.
6. **External News Signal (GDELT)**: Commodity supply disruptions trigger a `+15%` safety-stock buffer recommendation on sugar and soybean oil, always gated by Owner HITL approval.

---

## 5. Uploading Real Shopkeeper Data (CSV Forecast)

Shopkeepers and judges do not have to rely on synthetic data alone:
- Upload any `date,sku,qty,price` CSV file via the **Overview & Backtest → CSV Forecast Upload** panel or call `POST /api/v1/forecast/csv` (and external `POST /api/v1/forecast` with an API key) to compute live 7-day forecasts and WAPE directly on your own store history.
