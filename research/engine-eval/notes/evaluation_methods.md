# Evaluating weak-signal win-probability models and observational recommenders: an evaluation playbook for LoL Draft Coach

Research date: 2026-10-17. Scope: metrics, power, validation under drift, off-policy evaluation, ranking and confidence labels, item and build suggestions, descriptive analytics, and regression gates. Each source tag says how much was read:
- **[full text]**: the page or paper text was fetched and read (sometimes only the first ~100k characters).
- **[abstract]**: only the abstract or listing page was read.
- **[snippet]**: only a search-engine summary or snippet was seen.
- **[standard ref]**: a well-known reference cited from prior knowledge with its DOI or arXiv link, not opened in this session.

Derived numbers (marked **Derived**) come from algebra checked with a pure-Python Monte Carlo run in this session (200k-game runs for the formulas, 300 replicates for the power check, 200 replicates for the ECE floor, 60 logistic fits for the calibration slope). They depend on the assumptions stated with them.

Facts about the product (the current backtest's design, 13,414 test games, log loss 0.6928 vs 0.6932) come from the research brief, not from the sources.

---

## 1. Metrics for weak-signal probabilistic predictions (log loss, Brier and its decomposition, AUC, calibration measures), and which is primary at 45–58 %

### Takeaway
Make the **paired log-loss difference against the incumbent and against side-only/meta-only baselines** the primary metric. Between 45 % and 58 %, log loss and the Brier score are almost exact affine transforms of each other (LL − ln 2 ≈ 2·(BS − 0.25)), so which one you pick hardly matters for ranking models. Log loss is local and is read in bits, which helps. Calibration should come from **logistic recalibration (intercept and slope, with CIs)** plus a **CORP (isotonic) or smooth-ECE reliability diagram**. Report binned ECE only next to its noise floor: a perfectly calibrated model scores about 0.011 on 13,414 games with 10 equal-mass bins. AUC and accuracy are diagnostics only.

### Cited Findings
- Strictly proper scoring rules (log score, Brier score) reward honest probabilities. They are the theoretical basis for using log loss or Brier as the main score of probabilistic forecasts. — [Gneiting & Raftery 2007, JASA](https://doi.org/10.1198/016214506000001437) [standard ref]
- In sports forecasting, Wheatcroft ran simulations that compared the Ranked Probability Score, the Brier score and the ignorance (log) score on how reliably each picks the better forecaster as the sample grows. The **ignorance score outperformed both**. The paper stresses that the ignorance score is *local*: it uses only the probability given to the outcome that happened. — [Wheatcroft 2021, JQAS / arXiv 1908.08980](https://arxiv.org/pdf/1908.08980) [snippet]
- Murphy (1973) decomposed the mean Brier score into reliability (miscalibration), resolution (discrimination) and uncertainty: BS = REL − RES + UNC, with UNC = ō(1 − ō), RES = Σ_k (n_k/N)(ō_k − ō)² and REL = Σ_k (n_k/N)(f_k − ō_k)², over the distinct forecast values k. — [arXiv 2311.14122 (describes Murphy 1973)](https://arxiv.org/pdf/2311.14122) [snippet]; original: [Murphy 1973, J. Appl. Meteor., doi 10.1175/1520-0450(1973)012<0595:ANVPOT>2.0.CO;2](https://doi.org/10.1175/1520-0450(1973)012%3C0595:ANVPOT%3E2.0.CO;2) [not opened]
- The plug-in Murphy decomposition is **biased**: it overestimates reliability, underestimates uncertainty, and can miss resolution in either direction. A fully unbiased decomposition is unattainable. Ferro & Fricker propose one with smaller bias. — [Ferro & Fricker 2012, QJRMS (Exeter repository)](https://ore.exeter.ac.uk/repository/handle/10871/8503) [abstract]. Siegert derives the sampling variances and notes that the correction reduces the bias but never removes it. — [Siegert, arXiv 1303.6182](https://pdf.arxiv.org/pdf/1303.6182) [snippet]
- **CORP reliability diagrams** (Dimitriadis, Gneiting & Jordan) replace ad hoc bins with isotonic regression (pool-adjacent-violators). The result is consistent, optimally binned and reproducible, and comes with a decomposition into miscalibration (MCB), discrimination (DSC) and uncertainty (UNC) that is more stable than the classical Brier decomposition. Uncertainty comes from resampling or asymptotic theory. The R package is `reliabilitydiag`. — [Dimitriadis, Gneiting & Jordan 2021, PNAS](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7923594/) [abstract]
- New (2026): tests for equal calibration or discrimination between two forecasters, built on score decompositions computed by linear recalibration. The terms stay non-negative in finite samples, inference is asymptotic, and the method links to Mincer–Zarnowitz regression. — [Dimitriadis & Puke, arXiv 2603.04275 (v2 Sep 2026)](https://arxiv.org/abs/2603.04275) [abstract]
- Score decompositions and reliability or discrimination checks (fixed-threshold, quantile, logistic and isotonic binning) have been applied to football forecasts. Poisson-model forecasts had reliability "reasonably good … as compared to those obtained from bookmaker odds". — [Foulley, arXiv 2106.14345](https://arxiv.org/abs/2106.14345) [abstract]
- ECE as popularised for neural networks uses equal-width confidence bins (15 in the paper). — [Guo et al. 2017, arXiv 1706.04599](https://arxiv.org/abs/1706.04599) [standard ref]. **Adaptive (equal-mass) binning** ranks models much more stably across bin counts than equal-width binning. — [Nixon et al. 2019, arXiv 1904.01685](https://arxiv.org/pdf/1904.01685) [snippet]
- Kumar, Liang & Ma: the plug-in binned estimator Ê²_pl = Σ_s p̂_s (s − ŷ_s)² has bias that "accumulate[s], giving total bias B/n" (B bins, n samples). Their debiased estimator subtracts a per-bin variance term: Ê²_db = Σ_s p̂_s[(s − ŷ_s)² − ŷ_s(1 − ŷ_s)/(p̂_s n − 1)]. It needs n ∝ √B/ε² samples instead of B/ε². Equal-mass binning is "essential for being able to estimate the calibration error". Binning can only *lower* measured calibration error (CE(f_B) ≤ CE(f)): for a recalibrated VGG16 the 15-bin estimate was about 0.02, while the true error was "at least twice as high". Library: `uncertainty-calibration` (with bootstrap CIs). — [Kumar, Liang & Ma 2019, NeurIPS (ar5iv)](https://ar5iv.labs.arxiv.org/html/1909.10155) [full text, first 100k chars]; [code](https://github.com/p-lambda/verified_calibration)
- **Smooth ECE** smooths outcomes with an RBF kernel (Nadaraya–Watson), picks the bandwidth by a principled algorithm, and is a *consistent* calibration measure with a matching reliability diagram. Package: `relplot` (`pip install relplot`). — [Błasiok & Nakkiran, ICLR 2024 / arXiv 2309.12236](https://proceedings.iclr.cc/paper_files/paper/2024/hash/06cf4bae7ccb6ea37b968a394edc2e33-Abstract-Conference.html) [abstract]
- Spiegelhalter's Z: Z = Σ(y − p)(1 − 2p) / √Σ(1 − 2p)² p(1 − p), approximately N(0, 1) under perfect calibration. The (1 − 2p) weights mean confident predictions count the most. Some tools implement an unweighted variant. — [MAPIE docs](https://mapie.readthedocs.io/en/latest/generated/mapie.metrics.calibration.spiegelhalter_statistic.html); [MetricGate](https://metricgate.com/calculator/spiegelhalter-z-calibration-test) [snippet]; original [Spiegelhalter 1986, Stat Med](https://doi.org/10.1002/sim.4780050506) [standard ref]
- The calibration hierarchy (Van Calster et al.) has four levels: mean, weak, moderate and strong calibration. Weak calibration is the logistic recalibration intercept and slope. A slope below 1 means the predictions are too extreme, usually from overfitting. — [SMDM 2015 abstract](https://smdm.confex.com/smdm/2015mo/webprogram/Paper9076.html); [CASRAI guide](https://casrai.org/guides/calibration-plots-for-prediction-models) [snippet]; paper: [Van Calster et al. 2019, BMC Medicine](https://pmc.ncbi.nlm.nih.gov/articles/PMC6912996) [abstract]
- When validating a binary-outcome model, the **calibration slope** is often the criterion that sets the minimum sample size. In Riley et al.'s worked example, 9,835 participants were needed, driven by the slope. They call the blanket "100 events and 100 non-events" rule too crude. R package: `pmvalsampsize`. — [Riley et al. 2021, Stat Med (Utrecht repository)](https://dspace.library.uu.nl/handle/1874/455777) [snippet]
- **Calibration and boldness pull against each other.** Forecasts can be well calibrated yet too timid to be useful. Relaxing the posterior probability of calibration slightly (0.99 → 0.95) widened hockey home-win predictions from .26–.78 to .10–.91. — [Guthrie & Franck, arXiv 2305.03780](https://arxiv.org/abs/2305.03780) [abstract]
- FiveThirtyEight judged its forecasts on **calibration plots** and **skill scores** against an unskilled baseline (for sports, the historical home-team win rate). Forecasts updated over time were weighted by the inverse of the number of updates, so each event counted once. Example: of 5,589 events forecast at about 70 %, 71 % happened. — [FiveThirtyEight, "Checking our work"](https://projects.fivethirtyeight.com/checking-our-work) [snippet]

### Inferences
- **Derived: log loss ≈ 2 × Brier near 0.5.** Write p = 0.5 + δ and s = 2y − 1 ∈ {−1, +1}. Then BS = 0.25 − δs + δ² exactly, and LL = ln 2 − 2δs + 2δ² − (8/3)δ³s + O(δ⁴), so LL − ln 2 ≈ 2(BS − 0.25). For |δ| ≤ 0.08 (45–58 %) the cubic term is at most about 11 % of the quadratic term. Per-game loss differences between two models therefore give practically the same z-statistic under either score. Keep log loss as primary: the backtest already uses it, it is local (Wheatcroft) and reads as information. Present it as a **skill** per game in millinats or bits (nats / ln 2) against side-only, meta-only and the incumbent, because raw values such as 0.6928 hide the scale.
- **Derived: the ceiling.** If the true win chance is q = 0.5 + ε, a perfect model gains about 2·E[ε²] nats per game over a coin. With normally distributed edges (accuracy = 0.5 + 0.798σ), draft-only accuracy of 53 %, 55 % and 57 % implies a perfect-model gain of only about 0.0028, 0.0079 and 0.0154 nats/game. The engine's 0.6932 → 0.6928 (about 0.0004 nats) matches an RMS captured edge of √(0.0004/2) ≈ 1.4 pp, roughly 51 % accuracy-equivalent. That is a small share of what the literature range suggests is possible, or the literature figures don't transfer to solo queue.
- **Derived: noise erases the gain, and shrinkage is the cure.** If predictions are p = 0.5 + λ(ε + η), with true edge ε (variance σ²) and estimation noise η (variance τ²), the log-loss gain over a coin is ≈ 4λσ² − 2λ²(σ² + τ²). With λ = 1 and τ = σ the gain is **zero**: the simulation gave 0.00034 ± 0.00019 against a formula value of 0. The optimal shrink is λ* = σ²/(σ² + τ²), the reliability ratio; at τ = σ, λ = 0.5 recovers half the perfect-model gain (simulated 0.00076 vs 0.0009). The calibration slope estimates exactly this λ. A slope well below 1 is the main sign that a weak-signal engine is passing noise through, so the slope should be the main secondary metric.
- **Derived: the ECE noise floor.** With N games and K equal-mass bins, a *perfectly calibrated* model has E[ECE] ≈ √(2/π)·√(0.25·K/N):

  | N, bins | mean ECE | 95th percentile |
  | --- | --- | --- |
  | 13,414, K = 10 | 0.0110 | 0.0164 |
  | 13,414, K = 5 | 0.0079 | |
  | 13,414, K = 20 | 0.0155 | |
  | 50,000, K = 10 | 0.0057 | |

  So an ECE of "1.1 %" on the current backtest says nothing. Report the debiased ECE (Kumar) or smECE with bootstrap CIs, or ECE next to its null expectation. Equal-width 0.1 bins are useless here: every prediction lands in one or two bins.
- **Derived: the binned Murphy decomposition is noise at this size.** When predictions carry no signal at all, binned RES averages (K − 1)·0.25/N = 0.000168 (N = 13,414, K = 10; simulated 0.000168). That is about the engine's whole Brier gain (≈ 0.0002, half the 0.0004 log-loss gain). Use CORP MCB/DSC with bootstrap CIs, or the Ferro–Fricker correction, before reading REL or RES.
- **Derived: calibration-slope precision.** SE(b) ≈ 1/√(N·Var(logit p)·p(1 − p)) ≈ 1/√(N·(4·SD_p)²/4):

  | N | SD of predictions | SE of slope | 95 % CI |
  | --- | --- | --- | --- |
  | 13,414 | 2 pp | 0.216 | ±0.42 |
  | 13,414 | 3 pp | 0.144 | |
  | 50,000 | 2 pp | 0.112 | |

  The simulation matched: 0.245, 0.135 and 0.111. The slope therefore needs about 50k+ games to be pinned within ±0.2, which argues for pooling bands for the slope and gating per band only on calibration-in-the-large.
- **Spiegelhalter's Z is weak in this range.** For p ∈ [0.45, 0.58] the weights (1 − 2p) run from about −0.16 to +0.10, so most games barely count. Prefer the intercept/slope tests.
- **AUC** ignores calibration and will sit near 0.5–0.6. Track it as a check that ranking information exists, never as a gate. **Accuracy** at N = 13,414 has SE 0.43 pp (95 % CI ±0.85 pp), throws away the probability's size, and makes a poor primary metric.
- **Slice calibration.** The "≈ 54 %" the user sees should be checked on the slices where it is shown: each label ("Clear pick", "Close call", "Not enough data"), each band, each role, blind vs counter pick, and the first days of a patch. Check calibration-in-the-large too (mean predicted vs observed).

### Gaps
- I found no published source that states the Brier ≈ log-loss equivalence near 0.5; it is derived here.
- Spiegelhalter (1986), Guo (2017) and Gneiting & Raftery (2007) were not opened in this session; their formulas and claims are standard.
- smECE's bandwidth rule and the size of its bias at N ≈ 10⁴ were not checked; read the `relplot` docs before relying on it.

---

## 2. Statistical power and comparing two model versions with confidence

### Takeaway
Score both versions on **the same games** and analyse the per-game loss differences dᵢ = LL_A,i − LL_B,i. The Diebold–Mariano test reduces to a paired z/t-test when games are independent; use a day-level (cluster or block) bootstrap if errors correlate within days. The key fact for power: **SD(dᵢ) ≈ 2 × RMS(p_A − p_B)**, which you can compute *before looking at outcomes*. So the minimum detectable improvement is MDE ≈ 2.49 × 2·RMS/√N (one-sided α = 5 %, 80 % power). On 13,414 games, two versions whose predictions differ by 1 pp RMS can only be told apart if the gain is ≥ 0.00043 nats/game. A genuinely correct extra term that moves predictions by 1 pp RMS needs about 62,000 games to prove.

### Cited Findings
- **Diebold–Mariano**: tests equal predictive accuracy on the loss differential d_t, with a HAC (long-run) variance for serially correlated errors. — [Diebold & Mariano 1995, JBES](https://doi.org/10.1080/07350015.1995.10524599) [standard ref]. Small-sample modification: [Harvey, Leybourne & Newbold 1997, IJF](https://doi.org/10.1016/S0169-2070(96)00719-4) [standard ref]
- Diebold's own retrospective: the DM test is for comparing **forecasts**, not models. Applying it to pseudo-out-of-sample model comparisons is often misused, and the idea that pseudo-out-of-sample analysis is the best protection against in-sample overfitting "mostly fails". — [Diebold 2015, JBES / NBER w18391](https://nber.org/papers/w18391) [abstract]
- **Nested models** (e.g., the full model vs the model without one term): under the null that the small model is true, the large model is *expected* to lose, because it estimates parameters whose true value is zero. Clark & West adjust the loss difference (adding the squared gap between the two forecasts) and test one-sided; the statistic is about N(0, 1). — [Clark & West 2007, J. Econometrics (NBER t0326)](https://www.nber.org/papers/t0326) [snippet]
- When the comparison is of *forecasting methods*, including their estimation windows (rolling re-estimation under non-stationarity), the conditional predictive ability framework applies. — [Giacomini & White 2006, Econometrica](https://doi.org/10.1111/j.1468-0262.2006.00718.x) [standard ref]
- Paired bootstrap resampling of test items for system comparison: [Koehn 2004, EMNLP](https://aclanthology.org/W04-3250/) [standard ref]. Block bootstrap for dependent data: [Künsch 1989](https://doi.org/10.1214/aos/1176347265), stationary bootstrap: [Politis & Romano 1994](https://doi.org/10.1080/01621459.1994.10476870) [standard refs]
- **Underpowered comparisons are common.** In NLP, most comparisons to the state of the art on several GLUE tasks are underpowered, and a 2,000-sentence MT test set has about 75 % power to detect 1 BLEU. The authors publish power-analysis notebooks. — [Card et al. 2020, EMNLP / arXiv 2010.06595](https://arxiv.org/pdf/2010.06595) [snippet]
- Variance from data sampling, initialisation and hyperparameter choice changes benchmark conclusions markedly. Bouthillier et al. recommend deciding on the **probability of improvement** P(A > B) against a threshold γ instead of a fixed δ on average scores, and prefer out-of-bootstrap resampling over a single fixed held-out set for detecting small improvements. — [Bouthillier et al. 2021, MLSys / arXiv 2103.03098](https://arxiv.org/pdf/2103.03098) [snippet]
- **Dependence shrinks the effective sample.** In NFL win-probability modelling, plays within a game share one outcome, so the effective N lies between the 229,635 plays and the 4,101 games ("we effectively have half as much data as we think"). Brill et al. use a cluster bootstrap that resamples games, then drives within games. — [Brill, Yurko & Wyner, Am. Stat. 2025 / arXiv 2311.03490](https://arxiv.org/html/2311.03490v6) [full text]
- **Cluster-robust inference with few clusters over-rejects** (about 5–30 clusters). The wild cluster bootstrap helps, though later work finds it unreliable below about 11 clusters. — [Cameron, Gelbach & Miller 2008 (NBER t0344)](https://www.nber.org/papers/t0344); [Webb (QED WP 1315)](https://ageconsearch.umn.edu/record/274640/files/qed_wp_1315.pdf) [abstract]
- **Type S and Type M errors.** In low-power settings, "significant" estimates often have the wrong sign and an exaggerated size; Gelman & Carlin recommend design calculations before and after the analysis. — [Gelman & Carlin 2014, Perspect. Psychol. Sci.](https://sites.stat.columbia.edu/gelman/research/published/PPS551642_REV2.pdf) [abstract]
- **Focusing on where the models disagree** sharpens comparisons. ease.ml/ci uses the share of differing predictions (d) and Bennett's inequality when new and old models are close; active labelling of only the disagreeing examples cuts the label need about 10×. — [Colyer on ease.ml/ci](https://blog.acolyer.org/2019/06/03/ease-ml-ci) [full text, secondary]. Booking.com's model-comparison experiments likewise "focus on cases where the candidate and current models disagree". — [Colyer on Bernardi et al. 2019](https://blog.acolyer.org/2019/10/07/150-successful-machine-learning-models/) [full text, secondary]

### Inferences
- **Derived power formula (simulation-checked).** For one-sided α and power 1 − β: N = ((z_α + z_β)·SD(d)/Δ)², with SD(d) ≈ 2·RMS(p_A − p_B). This follows from d ≈ −2(δ_A − δ_B)s + 2(δ_A² − δ_B²). Check: coin vs a perfect model with σ = 2 pp gives N = 15,457, and the simulated power was 0.813 against a target of 0.80.
- **Minimum detectable effect (one-sided 5 %, 80 % power), nats per game:**

  | RMS disagreement | N = 13,414 | N = 50,000 |
  | --- | --- | --- |
  | 0.5 pp | 0.00021 | 0.00011 |
  | 1 pp | 0.00043 | 0.00022 |
  | 2 pp | 0.00086 | 0.00044 |
  | 3 pp | 0.00129 | 0.00067 |

  For two-sided 5 % / 80 %, multiply N by (2.80/2.49)² ≈ 1.27.
- **Derived: a correct but small term is expensive to prove.** If version B adds a *correct* term whose RMS effect on predictions is r, then Δ ≈ 2r² and N ≈ (2.49/r)²: r = 1 pp → about 62,000 games, 1.4 pp → about 31,000, 2 pp → about 15,500, 3 pp → about 6,900. **Per-term ablations of small terms are underpowered by design** at 13k games. Run them on pooled multi-week data, or accept "not shown to hurt" (non-inferiority) instead of "shown to help".
- **Cross-check of the current result.** The engine gains about 0.0004 over side-only on 13,414 games. If the draft model's predictions differ from side-only by RMS r, then z ≈ 0.0004·√13414/(2r): r = 1 pp → z = 2.32, 1.4 pp → 1.65, 2 pp → 1.16, 3 pp → 0.77. If the true gain is 0.0004, power to confirm it at 13,414 games is only about 50 %. The backtest's own paired-bootstrap CI is the authoritative answer, and the reported values are rounded to 4 decimals (Δ could be 0.0003–0.0005).
- **Report every comparison as:**
  - Δ in nats/game (or millinats), with a 95 % CI from a **day-clustered paired bootstrap**, plus the plain game-level bootstrap. If the cluster SE is more than about 1.1× the iid SE, use the cluster one.
  - P(Δ > 0) from the bootstrap (Bouthillier's "probability of improvement").
  - The MDE for that N and RMS disagreement, so that "no significant difference" can be read ("we could only have detected ≥ X").
  - The number of games where |p_A − p_B| > 1 pp.
- **Clusters.** Day-level clusters work: a 25 % holdout of 3–4 weeks gives about 20–30 clusters. **Patch-level clusters do not**: 2–3 patches is far below about 11 clusters. Use the patch as a reporting slice and as a rolling-origin unit (Section 3), not as a bootstrap cluster. The anonymous data has no player IDs, so player-level clustering is impossible; day clusters capture some within-player streak correlation.
- **Ablations are nested comparisons.** Under Clark–West logic, a term that seems to "slightly hurt" may just be estimated noisily. The fix is to shrink it (Section 1), not necessarily to remove it.
- **Personal engine (each friend's 1,000 games).** Evaluate prequentially: predict game t from games before t only. Pool the paired differences across friends, but with 10 friends do player-level inference by a sign test or permutation test over friends, not a cluster bootstrap (fewer than 11 clusters). Prequential forecasting, i.e., scoring each forecast made only from data before the event, is due to Dawid; see [Dawid 1984, JRSS A](https://doi.org/10.2307/2981683) [standard ref].
- **Accuracy comparisons** between two versions reduce to McNemar's test on discordant games. They waste information, so use them as a reported number only.

### Gaps
- I found no measurement of within-day correlation of loss differences for LoL games. Compute it: the ratio of day-cluster to iid bootstrap SE on the existing backtest.
- I found no LoL- or MOBA-specific power analysis in the literature. The worked numbers above are derived, not cited.
- Not verified: the exact HLN small-sample factor; Clark & West's adjusted statistic was seen only in snippet form.

---

## 3. Validation under drift (a new patch every two weeks): rolling origin, purging and embargo, tuning without touching the test set, recency weights

### Takeaway
Use **rolling-origin (forward-chaining) evaluation with several origins**, such as each patch start + 7 days and then weekly. Rebuild every snapshot and prior *as of* each origin (the backtest already does this for one cut). Tune priors, half-lives and weights only on inner forward-chained folds inside the training period, and keep the newest window as an untouched final test. For non-stationary series, repeated out-of-sample holdouts estimate performance best. Choose recency weighting (an exponential half-life) by forward-chained predictive log-likelihood, Dixon–Coles style.

### Cited Findings
- On 174 real series, **out-of-sample methods**, especially a holdout repeated over several testing periods, gave the most accurate performance estimates for **non-stationary** series. Blocked cross-validation works for stationary ones. — [Cerqueira, Torgo & Mozetič 2020, Machine Learning / arXiv 1905.11744](https://arxiv.org/pdf/1905.11744) [abstract]
- For stationary series, blocked cross-validation selected models more robustly than a final-segment holdout, with no practical downside. — [Bergmeir & Benítez 2012, Information Sciences (Monash record)](https://research.monash.edu/en/publications/on-the-use-of-cross-validation-for-time-series-predictor-evaluati/) [abstract]; follow-up for autoregressive models: [Bergmeir, Hyndman & Koo 2018, CSDA](https://doi.org/10.1016/j.csda.2017.11.003) [standard ref]
- Rolling-origin evaluation (re-fitting at successive forecast origins) is the standard out-of-sample protocol in forecasting. — [Tashman 2000, IJF](https://doi.org/10.1016/S0169-2070(00)00065-0) [standard ref]; [Hyndman & Athanasopoulos, FPP3 "Time series cross-validation"](https://otexts.com/fpp3/tscv.html) [standard ref]
- **Purging and embargo** (López de Prado): drop training rows whose label windows overlap the test period, and drop a buffer of rows right after each test block because nearby features stay correlated. One cited rule of thumb is an embargo of about 1 % of bars. — [Wikipedia: Purged cross-validation](https://en.wikipedia.org/wiki/Purged_cross-validation); [LuxAlgo](https://www.luxalgo.com/library/concept/purged-cross-validation/); [eslazarev/purged-cross-validation](https://github.com/eslazarev/purged-cross-validation) [snippet, secondary]
- **Overfitting during model selection** can be "of comparable magnitude to differences in performance between learning algorithms". A low variance of the selection criterion matters as much as unbiasedness, and common evaluation practices inherit a selection bias, which is why the selection loop must be nested. — [Cawley & Talbot 2010, JMLR](https://www.jmlr.org/papers/v11/cawley10a.html) [abstract]
- **Recency weighting in sports models.** Dixon & Coles weight past matches by exp(−ξt) and choose ξ by maximising predictive log-likelihood. A 2026 preprint quotes ξ = 0.0065 per half-week (half-life about 1 year) for football. The penaltyblog library suggests about 0.001 for gentle decay and about 0.03 for a heavy focus on recent results. — [arXiv 2605.16066](https://arxiv.org/pdf/2605.16066); [penaltyblog docs](https://penaltyblog.readthedocs.io/en/latest/models/overview.html) [snippet]. The original 1997 paper was not retrieved.
- Distribution shift, rather than adaptive overfitting, was identified as the bigger practical threat to holdout validity. — [Roelofs et al. 2019, NeurIPS](https://papers.nips.cc/paper/9117-a-meta-analysis-of-overfitting-in-machine-learning) [abstract]

### Inferences
- **Protocol for this product:**
  - **Origins.** One origin per patch at patch start + 7 days (the snapshot then contains a week of the new patch), plus one at the start of each later week.
  - **Test window.** The next 7 days after each origin.
  - **Scores.** Per origin and per band: Δ log loss vs side-only, meta-only and the incumbent; calibration-in-the-large; slope (pooled).
  - **Summary.** The mean Δ across origins with a CI that treats each origin as one unit, and the **spread across origins** as a "patch stability" metric.
  - **Early-patch slice.** Days 0–3 of a patch, separately, because drift hurts most then and those are the drafts users see first.
- **Leakage checklist.** Our labels are single-game outcomes with no overlapping windows, so classic purging matters less. These still matter:
  1. Every aggregate (snapshot, priors, pick-rate propensities, the expected-win table) is built only from games that ended before the origin, mirroring the production delay (hourly runs).
  2. Dedupe by match ID across collector runs.
  3. An optional embargo of about 1 day between train end and test start weakens same-player, same-session correlation, which can't be removed without player IDs. It costs about one day of training data.
  4. Priors and validation folds never touch the test window. The brief says this is already done for priors.
- **Nested tuning.** Choose hyperparameters (prior strength, half-life, per-band weights) on inner rolling origins inside the training period, and evaluate on the outer origins. Keep the grid coarse and the knob count small (Cawley & Talbot). Log how many configurations were tried, because that count sets how optimistic the best one is (Section 8).
- **Recency weighting candidates**, all scored by forward-chained log-likelihood with ξ tuned in inner folds:
  - (a) current patch only, with a prior from the previous patch;
  - (b) exponential decay with half-lives of 3, 7, 14 and 28 days;
  - (c) a reset at each patch that shrinks toward the previous patch's estimates, with the strength learned from how well patch-to-patch champion win rates correlate.

### Gaps
- I found no published LoL measurement of how much champion or matchup win rates drift between patches. Measure it from your own data: the correlation of shrunk champion win rates between consecutive patches, by band.
- The Dixon & Coles (1997) paper itself was not retrieved; the ξ value comes from a later citing paper's snippet.

---

## 4. Recommender evaluation with bandit feedback: IPS, SNIPS, DR, DM; why "win rate when they picked our #1" is confounded; causal value from observational drafts; what is realistic

### Takeaway
Off-policy evaluation needs three things: **known (or well-estimated) logging propensities, overlap, and no unobserved confounding**. In anonymous solo-queue drafts the "logging policy" is the players' own choices. Those are driven by comfort, mastery and skill the data can't see, and player-champion experience alone predicts outcomes far better than champion identities (75 % vs 53–57 %). So IPS/SNIPS/DR estimates of "value of recommending X" and the naive "win rate when the pick matched our #1" are both confounded. What is realistic:
1. Validate the win model itself (calibration out of sample), so that model-based expected-win comparisons are at least internally honest.
2. Run descriptive within-player checks on friends' histories.
3. If causal claims are wanted later, log randomized exploration with propensities.

Outcome-level A/B tests are out of reach for 10 friends: about 9,800 games per arm to detect 2 pp.

### Cited Findings
- **Estimators** (Open Bandit Pipeline notation):
  - DM: V̂ = E_n[q̂(x, π_e)].
  - IPW: V̂ = E_n[w·r], with w = π_e(a|x)/π_b(a|x).
  - SNIPW: E_n[w·r]/E_n[w].
  - DR: V̂ = E_n[q̂(x, π_e) + w(r − q̂(x, a))].

  With a known behaviour policy, IPW is unbiased and consistent, and DR stays consistent if either the weights or the reward model is. On real logs (about 26M ZOZOTOWN impressions, Bernoulli Thompson sampling vs uniform random), each estimator was compared with on-policy ground truth by RMSE over 200 bootstrap resamples. **DM did best in the small-sample setting (n = 10,000)**, "the most accurate estimator changes with the sample size", and DRos was best at n = 300,000. — [Saito et al., Open Bandit Dataset & Pipeline (NeurIPS 2021 D&B)](https://ar5iv.labs.arxiv.org/html/2008.07146) [full text, first 100k chars]
- Reward-model (direct) approaches "are plagued by a large bias", and past-policy (propensity) approaches "have a large variance". Doubly robust estimation is accurate when either model is good. — [Dudík, Langford & Li 2011, ICML / arXiv 1103.4601](https://arxiv.org/abs/1103.4601) [abstract]
- The standard counterfactual risk estimator suffers from **propensity overfitting**. The **self-normalized** estimator (a multiplicative control variate) avoids it. — [Swaminathan & Joachims 2015, NeurIPS](https://papers.nips.cc/paper/2015/hash/39027dfad5138c9ca0c474d71db915c3-Abstract.html) [abstract]
- The **replay method** gives provably unbiased offline evaluation of a bandit policy when the logged actions were chosen at random. It was validated against online bucket tests on Yahoo! Front Page. — [Li, Chu, Langford & Wang 2011, WSDM / arXiv 1003.5956](https://arxiv.org/pdf/1003.5956) [abstract]
- Capped and normalised importance sampling gave unsatisfying bias–variance trade-offs in product recommendation at Criteo. Their NCIS variants correlated better with online business metrics. — [Gilotte et al. 2018, WSDM / arXiv 1801.07030](https://arxiv.org/pdf/1801.07030) [snippet]
- New (KDD 2026): A/B testing can show a *higher* algorithm-selection error rate than offline evaluation, because shared offline data induces a helpful positive correlation between the estimates being compared. Their stepwise estimator matched existing selection error with half the A/B data. — [Konishi, Ushiku & Saito, arXiv 2607.01958](https://arxiv.org/abs/2607.01958) [abstract]
- **Offline gains often don't translate online.** Booking.com: improving a model's offline performance "does not necessarily translate into a gain in" business value, because of value saturation, segment saturation (old and new models mostly agree), proxy over-optimisation and an "uncanny valley" effect. — [Colyer on Bernardi, Mavridis & Estevez 2019 (KDD)](https://blog.acolyer.org/2019/10/07/150-successful-machine-learning-models/) [full text, secondary]. A review of recommender business value: "the most accurate offline models did neither lead to the best online success nor to a better accuracy perception" in most reported attempts. — [Jannach & Jugovac 2019, arXiv 1908.08328](https://arxiv.org/pdf/1908.08328) [snippet]. Netflix: offline measurements "need not translate directly onto the sought-after online results". — [Gomez-Uribe keynote abstract](https://ceur-ws.org/Vol-910/keynote.pdf) [snippet]
- **Evidence of confounding in LoL.** A model using each player's **experience with their chosen champion** reached **75.1 %** pre-game accuracy once champions were locked, far above the 53–57 % reported for draft-only models in the brief. Its authors conclude that individual champion skill matters regardless of team composition. — [Do et al. 2021, FDG / arXiv 2108.02799](https://arxiv.org/pdf/2108.02799) [snippet]
- Riot, via secondary coverage: win rate "tells us something about the power of the champion, but it also tells us something about the skill of the player". First-time Aurelion Sol players win far less, with the rate rising sharply with experience. Riot balances on separate skill-group win-rate bands and uses pick/ban rates for Elite play, where the samples are too small. — [SurrenderAt20 mirror of a 2015 Riot dev blog](https://www.surrenderat20.net/2015/10/red-post-collection-dev-blog-on-data.html); [Inven Global](https://www.invenglobal.com/articles/1236/riot-games-story-behind-balancing-champions-for-all-summoners-from-bronze-to-bengi) [snippet, secondary; the primary Riot page now redirects]
- **Sports precedent: a win-probability model recommending decisions** (NFL fourth downs). With bootstrap uncertainty, only **48 %** of 2018–2022 fourth-down decisions could be called confidently and 27 % were uncertain. 87 % of decisions had an estimated win-probability effect under 4 %. The authors note that their bootstrap understates uncertainty (it ignores model bias), that hidden confounders exist (play calls, for example), and that behaviour, and so win probabilities, shift once teams follow the recommendations. — [Brill, Yurko & Wyner, arXiv 2311.03490](https://arxiv.org/html/2311.03490v6) [full text]
- MOBA draft recommenders in the literature are evaluated by **imitation and prediction metrics**, not by causal value. DraftRec (LoL, about 280k matches) reports pick recommendation and match-outcome prediction performance plus a user survey. — [DraftRec, WWW 2022 / arXiv 2204.12750](https://arxiv.org/pdf/2204.12750v1.pdf) [snippet]. The MCTS drafter "The Art of Drafting" reports higher win rates for its drafts against baselines, judged by a learned win predictor or simulator. — [Chen et al. 2018, arXiv 1806.10130](https://arxiv.org/pdf/1806.10130) [abstract]
- Uplift and CATE: the S-, T- and X-learner meta-learners. — [Künzel et al. 2019, PNAS](https://doi.org/10.1073/pnas.1804597116) [standard ref]. Uplift is evaluated with Qini or uplift curves, which rank units by estimated CATE and need treatment assignment that is randomized or has known propensity. PEHE needs ground-truth effects, available only in simulations. — [Uplift and heterogeneity survey, arXiv 2007.12769](https://arxiv.org/pdf/2007.12769) [snippet]

### Inferences
- **Why "win rate when the actual pick = our #1" is confounded:**
  1. The engine's #1 often *is* the player's comfort or main pick, since it contains a comfort term. Agreement therefore marks mastery games, which win more for reasons unrelated to the advice (Do et al.).
  2. Players follow more often when the draft is going well.
  3. Players deviate when they hold private information, such as a pocket pick.

  The bias can go either way, so the statistic can't be signed or corrected without assumptions.
- **Derived: IPS effective sample size for a deterministic "play our #1" policy.** w = 1/π₀(#1|x) when the pick matched, else 0. If players pick our #1 with probability π, the ESS (Kish, (Σw)²/Σw²) ≈ N·π:

  | Data | P(player picked our #1) | ESS | SE of win rate |
  | --- | --- | --- | --- |
  | One friend, 1,000 games | 0.10 | ≈ 100 | ≈ 5 pp |
  | One friend, 1,000 games | 0.30 | ≈ 300 | 2.9 pp |
  | Pooled anonymous, 50,000 games | 0.10 | ≈ 5,000 | 0.7 pp |

  The pooled estimate is precise but still confounded, because population pick rates (the propensity model: role, band, patch, available champions, picks so far) don't capture *who* is picking.
- **Realistic evaluation ladder for this product:**
  1. **Model validity.** The win model's calibration and skill, measured out of sample (Sections 1–3), including on the slice of games where the player's pick equals the engine's #1 and the slice where it doesn't. If the model is calibrated on both, model-based "expected win of top-k" comparisons (DM-style) are at least internally consistent. They remain circular as evidence of causal value.
  2. **Confounding-aware descriptive checks on friends' histories.** Compare outcomes when the player followed vs didn't, *within* champion-experience strata (games on the champion in the last N games, for example) and within the player. Present the result as descriptive.
  3. **Capture the confounder in the anonymous collector.** Storing an *anonymised* per-participant experience bucket at collection time (e.g., games on this champion in their recent history: 0, 1–10, 11–50, 50+, with no IDs kept) would let the meta model condition on experience. This is a product idea, not a sourced practice; check it against the "no PUUIDs, no data brokering" rules.
  4. **Exploration logging** (enables replay or IPS later). For a small, flagged fraction of drafts, randomize the *order* of near-tied suggestions (e.g., when #1 and #2 are a "Close call") and log the propensities. This is ethically mild because both options are near-equivalent by the engine's own estimate. It gives Li-style unbiased replay data for "does showing X first change picks and outcomes?" Expect only pick-rate effects to be measurable with 10 friends.
  5. **Outcome A/B tests are infeasible.** Two-arm, two-sided 5 %, 80 % power needs n per arm = 7.85·0.25·2/Δ²: Δ = 5 pp → 1,570 per arm, 2 pp → 9,811, 1 pp → 39,245. That is years of play for 10 friends. Use acceptance and usage (did they pick a suggested champion, import the runes) as the online metric.
- **"Pick rate as logging policy"** is a valid *population* propensity for simulation and for estimating overlap. Under hidden confounding, though, the IPS/DR estimate targets "the win rate the average player who picks X would get", not "the win rate this player gets if told to pick X". Say so in any write-up.
- **Sensitivity analysis.** When an observational "value of X over Y" is reported, add an E-value-style statement: how strong an unmeasured confounder would have to be to erase it. See [VanderWeele & Ding 2017, Ann. Intern. Med.](https://doi.org/10.7326/M16-2607) [standard ref; not opened].

### Gaps
- I found no published off-policy evaluation of MOBA draft or champion recommendations, and no sports OPE example using IPS on real decisions. The closest sports work (NFL fourth downs) uses bootstrap win-probability models without propensity weighting.
- The Joachims and Swaminathan SIGIR 2016 tutorial slides on counterfactual evaluation could not be parsed (PDF rendering failed), so their diagnostics (e.g., checking that the mean importance weight is near 1) are not cited from them.
- The Riot mastery-effect figures (Katarina +0.4 % among high-mastery players, for example) come only from secondary coverage.

---

## 5. Ranking metrics and confidence labels: hit@k and NDCG vs outcome-aware metrics, rank stability, and checking that "Clear pick" means what it says

### Takeaway
Hit@k and NDCG against the champion actually picked measure **imitation**: whether we suggest what players already do. They are a plausibility check, not a value metric. Value metrics need a calibrated win model:
- expected win of the top-1 and top-3 under that model;
- regret against the best available option;
- above all, **label validity**: does "Clear pick" replicate on independent data at the rate it promises?

The sports precedent (Brill et al.) defines confidence as the share of bootstrap-refitted models that agree: confident at ≥ 83 %, lean at 67–83 %, uncertain below 67 %. Only about half of decisions came out confident even with large edges in play.

### Cited Findings
- NDCG (graded relevance with logarithmic position discount) is the standard ranking metric. — [Järvelin & Kekäläinen 2002, ACM TOIS](https://doi.org/10.1145/582415.582418) [standard ref]
- Brill et al.'s decision rule refits the whole win-probability model on B = 101 cluster-bootstrap resamples (games, then drives). It recommends a decision only when the share of resampled models preferring it is in 83–100 % (confident), labels 67–83 % "lean", and calls the rest uncertain. Confidence was about 20 % for decisions whose effect was under 1 % and about 50 % for effects of 1–2 %. Coaches should be judged only on confident decisions. — [Brill, Yurko & Wyner, arXiv 2311.03490](https://arxiv.org/html/2311.03490v6) [full text]
- Bootstrap statements about ranks are tricky: the standard n-out-of-n bootstrap **can be inconsistent** for the distribution of an empirical rank, especially with ties or near-ties. An **m-out-of-n bootstrap** restores consistency, with m chosen from the data. — [Hall & Miller 2009, Ann. Statist. / arXiv 0911.3749](https://arxiv.org/pdf/0911.3749) [abstract]
- League tables of institutions should be shown with rank uncertainty intervals. — [Goldstein & Spiegelhalter 1996, JRSS A](https://doi.org/10.2307/2983325) [standard ref]
- With low power, statistically "significant" differences have high Type S (wrong sign) and Type M (exaggeration) risk. — [Gelman & Carlin 2014](https://sites.stat.columbia.edu/gelman/research/published/PPS551642_REV2.pdf) [abstract]. Newly discovered effects tend to be inflated (the winner's curse). — [Ioannidis 2008, Epidemiology](https://doi.org/10.1097/EDE.0b013e31818131e7) [standard ref]
- Deciding by the probability that A beats B across resamples, against a threshold γ, is a principled alternative to fixed-margin rules. — [Bouthillier et al. 2021](https://arxiv.org/pdf/2103.03098) [snippet]
- Shrinking noisy per-unit rates toward a common mean (Stein / empirical Bayes) cut prediction error below half that of raw averages in Efron & Morris's examples, including 18 batters' first-45-at-bat averages. — [Efron & Morris 1975, JASA (PDF)](https://www.medicine.mcgill.ca/epidemiology/hanley/bios602/MultilevelData/EfronMorrisJASA1975.pdf) [snippet]

### Inferences
- **Derived worked example (Type S and M for champion edges).** True win rates 52 % vs 51 % on 500 and 400 games: the SE of the difference is 3.35 pp, and the observed order is right only **62 %** of the time. If you call it "clear" only when the difference is significant at 5 %, that happens 6 % of the time, and **about 20 % of those calls have the wrong sign**. The average "significant" estimate is about **7.9×** the true 1-pp edge (Gelman–Carlin formulas, simulation-confirmed). Raw-difference "beyond sampling noise" rules therefore over-claim in this regime. Labels should come from **shrunk** estimates: a hierarchical or empirical-Bayes posterior, or bootstrap refits of the shrunk engine.
- **Label definition.** "Clear pick" should mean P(#1 better than #2 | data) ≥ a stated level (e.g., 0.9). Compute that from (a) posterior draws of the hierarchical model, or (b) bootstrap refits of the whole snapshot. Resample games by day; use m-out-of-n (m ≈ n/2) near ties, per Hall & Miller. "Close call" covers the middle band and "Not enough data" covers effective sample sizes below a threshold. Brill's 83/67 % cut-offs are a ready-made precedent.
- **Three checks that the label means what it says:**
  1. **Simulation-based label calibration.** Take the fitted hierarchical model as truth, simulate datasets with the *real* sample sizes, run the labeller, and count how often a "Clear pick" #1 is truly better. That frequency should be at least the stated level. This is the label's own calibration curve.
  2. **Split-sample or prospective replication.** Assign labels from data up to week t, then estimate #1 − #2 on week t + 1 (or the other half). Compare the observed sign-agreement rate with the rate *expected* given week t + 1's noise, Σ Φ(D̂ᵢ/sᵢ). Even perfect labels can't replicate 100 % when the replication sample is noisy.
  3. **Calibration by label.** On held-out games, the win model's calibration should hold within each label class, and "Not enough data" predictions should sit near the prior.
- **Rank stability metrics for the scorecard:**
  - the median over drafts of P(#1 stays #1) and of P(#1 stays in the top 3) across bootstrap refits;
  - the share of drafts labelled Clear, Close and Not enough data. Watch for drift: a jump in Clear share after an engine change is a red flag unless the replication check improves too.
- **Outcome-aware ranking metrics, with assumptions stated:**
  - **expected win of top-1 under the model minus expected win of the player's actual pick** (model-estimated regret of actual picks; descriptive and model-dependent);
  - **expected win of top-3**, the mean of the three;
  - **regret vs the best available option** (zero by definition for a model scoring its own options, so only meaningful when computed under a *different*, independently fitted, validated model; e.g., score engine v3's ranking with a held-out v2 or a simpler logistic model).
- **Imitation metrics still have a use.** Hit@3 of the actual pick tells you whether suggestions are realistic for players. Track it as a guardrail: a big drop means the engine started recommending things nobody plays.

### Gaps
- I found no study validating confidence labels in game or draft recommenders. The replication and simulation checks above are adapted from general statistics.
- The DraftRec metrics (HR@k, NDCG@k and similar) were seen only via snippet; its full experimental tables were not read.

---

## 6. Evaluating build, item, rune and spell suggestions: purchase prediction vs win lift, confounding by game state, matching at purchase time, the most-bought baseline

### Takeaway
Published MOBA item recommenders are judged almost entirely by **purchase-prediction** metrics (precision@k, recall@k, MRR), i.e., imitation, or by a *model-predicted* win rate, which is circular. Measured win-rate lift from item suggestions is essentially absent from the literature. The product's "win added" (actual result minus an expected win from minute × team gold difference at purchase) is a sensible stratification at purchase time. It should be evaluated as:
1. the expected-win table's own calibration;
2. split-half reliability of each item × champion estimate, with shrinkage;
3. a paired, forward-chained comparison against the **most-bought baseline** on held-out games, clustering by game;
4. placebo items, to detect leftover confounding.

### Cited Findings
- Sequential item recommendation on Dota 2 (the Dota-350k dataset) is evaluated on predicting purchases. Order-aware models did best, and RNNs beat Transformers. Most earlier MOBA research predicts winners; item recommendation began with Looi et al. (association rules plus logistic regression on purchase history). — [arXiv 2201.08724](https://arxiv.org/pdf/2201.08724) [snippet]
- One item recommender (Apriori rules) was "evaluated" by an MLP's *predicted* win rate of its builds: 82.97 %, with the MLP itself 73.04 % accurate. That is a proxy, not measured outcomes. — [petra.ac.id thesis](https://publication.petra.ac.id/index.php/teknik-informatika/article/download/8074/7284) [snippet]
- Within-game time points share one outcome, so the effective sample size for any "state → outcome" table is near the number of **games**, not the number of time points. Resample whole games. — [Brill, Yurko & Wyner](https://arxiv.org/html/2311.03490v6) [full text]
- Offline metric gains, especially on proxy targets like clicks, often fail to move the outcome that matters ("proxy over-optimization"). — [Colyer on Bernardi et al. 2019](https://blog.acolyer.org/2019/10/07/150-successful-machine-learning-models/) [full text, secondary]
- Shrinkage of many small-sample rates: [Efron & Morris 1975](https://www.medicine.mcgill.ca/epidemiology/hanley/bios602/MultilevelData/EfronMorrisJASA1975.pdf) [snippet]. Multilevel partial pooling as the remedy for many comparisons: [Gelman, Hill & Yajima 2012](https://arxiv.org/abs/0907.2478) [abstract]

### Inferences
- **Confounders that remain after conditioning on minute × gold difference:**
  1. **Situational purchases.** Anti-heal or armour is bought *because* the enemy composition is threatening, and those games are harder, so situational items look worse. Stratify by enemy-composition features, or compare only within the same enemy archetype.
  2. **Player skill.** Better players build "correctly" and also win more.
  3. **Timing endogeneity.** Completing an item at minute 14 vs 20 reflects game state beyond gold difference (kills, objectives, lane state).
  4. **Survivorship.** Third and fourth items exist only in long games. Condition on the game reaching that minute, or compare items in the same build slot.
  5. **Runes and spells are chosen before the game**, so they are confounded by champion, matchup and player type. Always compare within champion × role and, where possible, within matchup.
- **Evaluation recipe (per item, rune or spell table):**
  - **Expected-win table.** Calibration by minute bucket and gold bucket on held-out games (CORP or reliability by bucket). Its errors pass straight into "win added".
  - **Reliability.** Split games into two random halves and correlate the item × champion win-added estimates. Apply Spearman–Brown (Section 7). Show an item's "win added" only if reliability ≥ about 0.5–0.7, the same gate already used for power spikes, and shrink toward the item-class or role mean.
  - **Against most-bought, on the same held-out games** (forward-chained), for each champion × slot where the two rules disagree: compare the average win added of games that bought "our pick" vs "most-bought pick", using a paired, game-clustered bootstrap. Report the MDE: disagreements are rare, so most comparisons will be underpowered (Section 2).
  - **Placebo or negative controls.** Items or choices that should have about zero effect after conditioning (e.g., trinket swaps or control wards bought at routine times). A large "win added" there signals leftover confounding in the method.
  - **Imitation guardrail.** Recall@k of what players actually build, so suggestions don't drift into unusual builds that nobody can follow.
- **Present "win added" as association, not effect**: "players who bought X at this point won N pp more than expected" rather than "X adds N pp".

### Gaps
- I found no published causal evaluation (matching, IPS or experiments) of MOBA item, rune or spell recommendations.
- I found no standard "most-bought baseline" comparison protocol in the literature. The recipe above is a proposal.
- I did not find a primary source on "win probability added" in sports analytics to cite for the method's name and history.

---

## 7. Evaluating descriptive analytics: reliability (split-half with Spearman–Brown, test–retest, ICC) of percentiles and trends, regression to the mean in goals, false discovery control

### Takeaway
Every number the coach shows — playstyle percentiles, pool tiers, monthly trends, growth goals, "new champion" and "best item" lists — needs a **reliability gate** like the existing spike gate:
- **Measure:** split-half r stepped up with Spearman–Brown, or the ICC across non-overlapping time windows.
- **Gate:** show a number only above a threshold of about 0.5–0.7, or show it with an interval.
- **Correct for regression to the mean (RTM):** shrink toward the role or rank mean, and use that expected drift as the null when crediting goals.
- **Surface "notable" items or champions from many candidates** with hierarchical shrinkage, preferred, or Benjamini–Hochberg FDR control.

The current spike reliability (split-half r = 0.02–0.10) means the spike estimates need roughly **10–57× more data** to reach 0.7.

### Cited Findings
- **Spearman–Brown**: the reliability of a measure k times longer is ρ_k = kρ/(1 + (k − 1)ρ). Split-half to full length: 2r/(1 + r). — [Spearman 1910](https://doi.org/10.1111/j.2044-8295.1910.tb00206.x); [Brown 1910](https://doi.org/10.1111/j.2044-8295.1910.tb00207.x) [standard refs]
- **ICC bands** (Koo & Li 2016): below 0.50 poor, 0.50–0.75 moderate, 0.75–0.90 good, above 0.90 excellent. The size of an ICC depends on subject variance, ANOVA model and sample size, so the bands shouldn't be applied mechanically. — [AgreeStat ch. 9 reproducing Koo & Li](https://agreestat.com/books/icc5/chapter9/chap9.pdf) [snippet]; paper: [Koo & Li 2016, PMC4913118](https://pmc.ncbi.nlm.nih.gov/articles/4913118) [not opened]; ICC forms: [Shrout & Fleiss 1979](https://doi.org/10.1037/0033-2909.86.2.420) [standard ref]
- **Sports practice ("stabilization").** Baseball analysts split each player's events into halves and correlate them; r ≈ 0.7 is the usual "useful" convention. Baseball Prospectus used randomized splits and R = 0.5 ("we can predict 50 percent of the future variation"). Later work argues there is **no single stabilization point**: reliability is a curve. — [FanGraphs, "A New Way to Look at Sample Size"](https://blogs.fangraphs.com/a-new-way-to-look-at-sample-size); [FanGraphs, "Randomness, Stabilization, & Regression"](https://blogs.fangraphs.com/randomness-stabilization-regression); [Baseball Prospectus](https://legacy.baseballprospectus.com/a/14293) [snippet]
- **Regression to the mean** "is widespread in repeated measurements". It is stronger when measurement error is larger and when follow-up is limited to a subgroup chosen for its baseline value. The remedies are design (a control group selected the same way) and analysis. — [Barnett, van der Pols & Dobson 2005, IJE (PubMed)](https://pubmed.ncbi.nlm.nih.gov/15333621/) [abstract]
- **Multiple comparisons.** Benjamini–Hochberg controls the false discovery rate. — [Benjamini & Hochberg 1995, JRSS B](https://doi.org/10.1111/j.2517-6161.1995.tb02031.x) [standard ref]. Multilevel models with partial pooling can make classical corrections unnecessary and give more efficient estimates, especially when group-level variation is low. — [Gelman, Hill & Yajima 2012 / arXiv 0907.2478](https://arxiv.org/abs/0907.2478) [abstract]
- Shrinkage (Stein / empirical Bayes) beats raw per-player rates for prediction. — [Efron & Morris 1975](https://www.medicine.mcgill.ca/epidemiology/hanley/bios602/MultilevelData/EfronMorrisJASA1975.pdf) [snippet]
- Small, noisy studies exaggerate effects (Type M). — [Gelman & Carlin 2014](https://sites.stat.columbia.edu/gelman/research/published/PPS551642_REV2.pdf) [abstract]

### Inferences
- **Derived: what the spike numbers mean.** Spearman–Brown, assuming each cell's sample grows in proportion to the data:

  | split-half r | full-sample reliability | data needed for 0.5 | data needed for 0.7 |
  | --- | --- | --- | --- |
  | 0.02 | 0.039 | 24.5× | 57× |
  | 0.05 | 0.095 | 9.5× | 22× |
  | 0.10 | 0.182 | 4.5× | 10.5× |

  At 62k games that means roughly **650k–3.5M games** for 0.7. With about 7k games a day, that is months to more than a year, before patch drift resets the data. **Pooling the estimand** (per item class or per role instead of per champion × item) is the realistic route.
- **Reliability of a player percentile ("top X %").** Reliability = σ²_between/(σ²_between + σ²_within/n), estimated per axis from friends' histories (odd vs even games, or month vs month as test–retest) and from the anonymous pool for the reference distribution.
  - Show the percentile with an interval: bootstrap the player's games and re-rank against the reference.
  - Hide it when reliability for that axis at the player's n is below about 0.7.
  - Expect high reliability for rate stats such as CS/min, deaths or vision, and low for win rate. *Illustrative assumption, not sourced:* if true player win rates have a between-player SD of 4 pp, win-rate reliability is 0.5 at about 156 games and 0.7 at about 365.
- **Trends ("this month vs last").** Show a change only when it exceeds about 2 SE of the month-to-month difference, and display the shrunk value. A monthly slope with fewer than about 30 games per month is mostly noise.
- **Goals and RTM.** If a goal ("CS at 10") is set because recent games were unusually poor, the expected improvement *with no coaching* is (1 − reliability) × (player's long-run mean − recent mean). Credit the coach only for improvement beyond that. Better still, set goal baselines from long-run, shrunk averages, not the last few games.
  - A practical control: in the anonymous pool, find players-games with similar dips (no coaching) and measure their natural rebound. This needs per-player sequences, which the anonymous pool lacks; friends' own earlier dips can serve as a within-player control.
- **Break suggestion after losses.** Validate it as a descriptive claim within each player: is P(win | after k losses) below that player's baseline beyond noise? Use a permutation test on game order. Beware RTM and selection: sessions end *because* of losses.
- **Many candidates.**
  - "New champion" suggestions, "items by win added" and "best matchups" each scan hundreds of options; prefer hierarchical shrinkage, then rank.
  - If anything is labelled "significant" or "proven", control FDR at about q = 0.1 with Benjamini–Hochberg and report the expected number of false entries in the list (q × list length).
- **Test–retest across patches.** For stable traits (playstyle axes), compute the ICC between consecutive months or patches. An axis that doesn't replicate across months shouldn't be called a "style".

### Gaps
- I found no LoL-specific reliability numbers for playstyle axes, CS@10 or player win rates; they need computing from friends' histories and the anonymous pool.
- I found no peer-reviewed research on "tilt" or loss streaks in LoL to cite for the break suggestion.
- Koo & Li's own table, Spearman (1910) and Brown (1910) were not opened in this session.

---

## 8. Making it a regression gate: versioned scorecards, tolerances, and avoiding test-set overfitting

### Takeaway
Treat each engine change like a product A/B decision (Spotify's rule): **ship only if it is significantly superior on at least one success metric and significantly non-inferior on every guardrail**, with margins fixed in advance.
- **Scorecard:** a versioned JSON file in git.
- **Data:** fixed evaluation sets identified by content hash, compared with paired, day-clustered bootstraps.
- **Tolerances:** set from "A/A" noise, i.e., re-fitting the incumbent on resamples, and from the MDE.
- **Test-set overfitting:** budget the number of gate queries per frozen set (ease.ml/ci's "steps"), retire and refresh sets, and make release decisions on **fresh games played after the candidate was frozen**. At about 7k games a day a 13k-game set refills in about 2 days, so this is cheap.

### Cited Findings
- **Spotify's decision rule.** Ship if and only if:
  1. the treatment is "significantly superior to control on at least one success metric";
  2. it is "significantly non-inferior to control on all guardrail metrics";
  3. no success, guardrail or deterioration metric shows evidence of deterioration;
  4. no quality test invalidates the experiment.

  Corrections:
  - Success metrics get α/S; guardrails need no α correction ("there are no longer multiple chances").
  - Power must be corrected for the number of guardrails: β* = (β − α₋)/((1 − α₋)(G + 1)) when S > 0, or simply β/(G + 1).
  - Without that correction, 5 guardrails at 80 % power each give a simultaneous power "way below 40%", and 10 give about 11 %.

  — [Spotify Engineering 2024](https://engineering.atspotify.com/2024/03/risk-aware-product-decisions-in-a-b-tests-with-multiple-metrics) [full text]; [Schultzberg, Ankargren & Frånberg, arXiv 2402.11609](https://arxiv.org/abs/2402.11609) [abstract]
- **CI for ML models (ease.ml/ci).**
  - Conditions are written over the new model's score *n*, the old model's score *o* and the disagreement *d* (e.g., `n - o > 0.02 +/- 0.01`), with a `reliability` (e.g., 0.9999), a mode (fp-free or fn-free) and `steps` (how many times a test set may be reused).
  - About 30,000–60,000 labels serve 32 evaluations; at one commit a day a test set lasts about a month.
  - Adaptivity modes are *full* (the developer sees pass/fail), *none* (the result is hidden), and *firstChange* (a new test set is needed once the result flips). Adaptive modes need far more samples.
  - The system raises an alarm when a test set "runs out of power".
  - A naive Hoeffding bound would need over 46K labels for a tight estimate; with optimisations, a 1-point tolerance at 0.999 reliability needs about 2K labels per test.

  — [Colyer on ease.ml/ci](https://blog.acolyer.org/2019/06/03/ease-ml-ci); [Renggli et al. 2019, MLSys / arXiv 1903.00278](https://arxiv.org/pdf/1903.00278) [snippet and secondary full text]
- **The reusable holdout.** Access the holdout only through a differentially private mechanism. In Thresholdout, the holdout answers only when it disagrees with the training estimate beyond a noisy threshold. The number of answerable queries can be exponential in n as long as the number of overfitting events is at most quadratic in n. The Google blog says the limit "grows roughly as the square of the number of collected data points". Leaderboards that give feedback let competitors overfit, so "their score on the public leaderboard continues to improve, while the true performance of the model does not". — [Dwork et al. 2015, Science / arXiv 1506.02629](https://arxiv.org/abs/1506.02629) [snippet]; [Google Research blog](https://www.research.google/blog/the-reusable-holdout-preserving-validity-in-adaptive-data-analysis/) [full text]. Related: the Ladder leaderboard mechanism, [Blum & Hardt 2015, arXiv 1502.04585](https://arxiv.org/abs/1502.04585) [standard ref]
- **Counter-evidence on adaptive overfitting.** In over 100 Kaggle competitions there was "little evidence of substantial overfitting" from public-leaderboard reuse; distribution shift was the larger concern. — [Roelofs et al. 2019, NeurIPS](https://papers.nips.cc/paper/9117-a-meta-analysis-of-overfitting-in-machine-learning) [abstract]. ImageNet models re-tested on a new test set lost accuracy but largely kept their ranking. — [Recht et al. 2019, arXiv 1902.10811](https://arxiv.org/abs/1902.10811) [standard ref]
- Selection over many configurations biases the winner's measured score; the evaluation must be nested. — [Cawley & Talbot 2010](https://www.jmlr.org/papers/v11/cawley10a.html) [abstract]
- **Run-to-run variance.** Seeds, data sampling and hyperparameters make single-run comparisons unreliable. Decide on the probability of improvement across randomized runs, which gave a 51× compute saving over the ideal estimator. — [Bouthillier et al. 2021](https://arxiv.org/pdf/2103.03098) [snippet]
- **A/A tests** (comparing a system with itself) validate the measurement pipeline and show how often noise alone produces "wins". — [Kohavi, Tang & Xu, *Trustworthy Online Controlled Experiments* (index: A/A tests p. 200)](https://assets.cambridge.org/97811087/24265/index/9781108724265_index.pdf) [snippet]; [Statsig on A/A tests](https://statsig.com/blog/how-to-aa-test) [snippet, secondary]
- **Disaggregated reporting** (per slice or subgroup) is a core element of model cards. — [Mitchell et al. 2019, arXiv 1810.03993](https://arxiv.org/abs/1810.03993) [standard ref]. A production-readiness rubric that includes model-quality tests before serving: [Breck et al. 2017, "The ML Test Score"](https://doi.org/10.1109/BigData.2017.8258038) [standard ref]. Behavioural invariance and directional tests for models: [Ribeiro et al. 2020, CheckList, arXiv 2005.04118](https://arxiv.org/abs/2005.04118) [standard ref]

### Inferences
- **Derived: why test-set reuse bites hardest with a weak signal.** If you try K tweaks with **zero** true effect and keep the best, the expected best z-score is about 1.54 (K = 10), 1.87 (K = 20) or 2.25 (K = 50), from the expected maximum of K independent standard normals. So **the best of 20 no-op tweaks will on average clear one-sided 5 % significance** (z > 1.645) on a reused holdout. Real tweaks are correlated, which softens this, but the size of the true signal here (about 0.0004 nats) is comparable to these noise maxima. Roelofs's reassuring Kaggle result doesn't carry over: those competitions had larger signals relative to noise.
- **Gate design (illustrative; values to calibrate):**
  - **Datasets.**
    - *Regression set*: frozen, used on every PR, for reproducibility and catching bugs.
    - *Release set*: fresh, all games collected after the candidate's config was frozen, for go/no-go.
    - Identify each set by SHA-256 over sorted (matchId, outcome, patch, band, as-of-snapshot hash). Store the hash, game count, window and a `queries_used / queries_budget` counter in the scorecard. Retire the regression set when the budget is used (e.g., 30 visible runs), ease.ml/ci style.
  - **Success metric:** Δ log loss vs the incumbent, pooled over bands. Superiority test, one-sided α = 0.05, divided by the number of success metrics.
  - **Guardrails** (non-inferiority, margins set in advance):
    - per-band log loss (margin ≈ max(MDE, 2·SD_AA));
    - calibration-in-the-large per band (e.g., |mean predicted − observed| ≤ 1 pp);
    - pooled calibration slope (CI must overlap [0.8, 1.2], or the point estimate stays within ±0.2 of the incumbent);
    - smECE or debiased ECE ≤ the null-95th percentile + a margin;
    - "Clear pick" replication rate ≥ the stated level (Section 5);
    - hit@3 of actual picks not down by more than X pp;
    - for item tables, reliability ≥ the threshold for every displayed estimate.
  - **Deterioration checks:** the Clear-pick share must not jump without a matching gain in replication; the early-patch slice must not get worse.
  - **Quality checks:** dataset hash matches; no duplicate match IDs; as-of snapshot built only from earlier games; bootstrap seed recorded; A/A run passes (incumbent vs incumbent on resampled training data gives Δ ≈ 0 inside the CI).
- **Setting tolerances like performance budgets.** Run the incumbent's full pipeline R times (e.g., 20) on bootstrap resamples of its training window, or on shifted cut times, and score each on the frozen set. The spread of each metric is the "A/A noise" (SD_AA). Use margin = max(MDE at this N and disagreement, 2·SD_AA). This mirrors measuring perf budgets over repeated runs, and it keeps the gate from failing on refit noise. Recompute the margins whenever the dataset size changes.
- **Margin choices for log loss.** With about 1-pp RMS disagreement and 13k games, MDE ≈ 0.0004 nats. A non-inferiority margin of about +0.0005 nats/game pooled, and wider per band (each band has fewer games), is a reasonable starting point, to be revisited with the A/A numbers.
- **Behavioural tests (CheckList-style)** that catch bugs, not statistical regressions:
  - side symmetry (swapping teams gives 1 − p);
  - invariance to irrelevant bans;
  - monotonic comfort (more games on a champion never lowers the comfort term);
  - "Not enough data" when the effective N is below the threshold;
  - no Arena or out-of-scope queues.

  These belong in the same CI job.
- **Avoiding test-set overfitting in practice for a 1–2 person team:**
  1. Tune only on inner folds (Section 3).
  2. Look at the frozen regression set only through the pass/fail gate, with the full numbers kept in CI logs for the owner. This is ease.ml/ci's "none" or "firstChange" style.
  3. Make release decisions only on the fresh release set, which nobody has seen.
  4. Log every gate query against the set's budget.
  5. When exploring many weights at once, a simple Thresholdout variant works: compare the inner-fold estimate with the holdout and reveal the holdout number only if they differ by more than a threshold, adding noise.
- **Scorecard format.** A small JSON in git next to `config/engine.v*.json` (e.g., `eval/scorecards/draft-engine.v2.json`), checked by a CI script analogous to `pnpm perf:guard`. Each run writes the realised metrics, CIs, MDE, P(Δ > 0) and dataset hash, so history is reviewable in PRs. Bump the scorecard version whenever the dataset, a metric definition or a margin changes, never silently.

### Gaps
- I found no published account of small teams (as opposed to large companies) running ML regression gates with statistical margins. The JSON-scorecard design here is a synthesis of ease.ml/ci, Spotify's rule and perf-budget practice, not a cited standard.
- ease.ml/ci's exact bounds, and Thresholdout's threshold and noise constants, were seen only via abstracts or secondary summaries.
- Netflix's offline-to-online practice was seen only via secondary summaries; I found no Netflix tech-blog post with concrete numbers.
- I did not research betting-market benchmarks such as closing-line value; solo-queue games have no market to compare against.
