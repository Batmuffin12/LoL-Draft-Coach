# Draft-only win prediction in MOBAs: model families, data needs, and the fit for a small-data solo-queue coach

Notes for the report writer. Research date 2026-10-17. Source labels: **[PDF]** = full paper text read (PDF text extracted locally); **[code]** = source code read (shallow clone); **[blog]** = vendor or author page read in full (self-reported); **[abstract]** = abstract page only; **[snippet]** = search-result snippet only, not verified against the page. "Our" means LoL Draft Coach. The reference point is our production backtest: 13,414 Gold–Plat games, log-loss 0.6928 vs 0.6932 side-only (gain ≈ 0.0004 nats). A coin flip scores ln 2 = 0.6931.

## 1. Which model families have been used for draft-only win prediction, and how do they score?

### Takeaway
Almost every family has been tried: LR / Bradley–Terry on one-hots, LR with hand-picked pair features, FM and low-rank pairwise models, hero embeddings, kNN, GBDT/RF, shallow and deep MLPs, attention models, LSTM/transformer, MCTS-paired value nets. When they are compared on the same data, the order is almost always **LR ≈ Bradley–Terry < GBDT < FM / embeddings ≈ shallow NN < attention models**. The spread is small: about 0.01–0.035 AUC (1–2.5 accuracy points) at 0.5–3 M games. Below about 30k games it disappears or reverses. Credible draft-only LoL solo-queue models reach about **55–56 % accuracy and log-loss 0.682–0.687**. Almost no paper reports log-loss or calibration; the two that do are vendor evaluations (LoLDraftAI, DraftGap).

### Cited Findings

**Head-to-head comparisons on the same data (best evidence for family ranking)**

| Study (venue) | Game, data, skill | Games | Split | Results | Src |
|---|---|---|---|---|---|
| Chen et al., "The Art of Drafting" (RecSys 2018) | Dota 2, normal-skill subset of Semenov's ranked All Pick data (Feb 11–Mar 2, 2016), 111 heroes; Radiant won 53.75 % | 3,056,596 | 10-fold CV, 8:1:1 per fold | Acc / AUC: majority class 0.5378 / 0.5; **LR 0.6358 / 0.6877; GBDT 0.6417 / 0.7014; NN (1 hidden ReLU layer) 0.6535 / 0.7144**. The authors note LR→NN is only +1.8 % acc / +0.03 AUC. Their explanation: players already build competitive line-ups, so interactions "are hard to stand out". | [PDF](https://web.cs.ucla.edu/~yzsun/papers/2018_recsys_drafting.pdf) |
| Chen et al., "Game Avatar Embedding" (GAE, arXiv 2018) | HotS (58 heroes, Dec 2016, replay site), HoN (126), Dota 2 (111, same normal-skill data) | 1,814,066 / 1,101,046 / 3,056,596 | 10-fold CV | AUC HotS / HoN / Dota: **LR 0.6095 / 0.6115 / 0.6875; GBDT 0.6375 / 0.6144 / 0.7014; FM 0.6440 / 0.6154 / 0.7143; GAE (synergy + opposition embeddings) 0.6437 / 0.6220 / 0.7143**. GAE ≈ FM except on HoN. | [PDF](https://arxiv.org/abs/1803.10402) |
| Li et al., "Learning from Group Comparisons: Higher Order Interactions" (HOI, NeurIPS 2018) | HotS public "hero league" of Master players; Dota 2 public games of "notable players"; HotS tournaments | 139,462 (62 heroes) / 46,459 (113) / 9,610 (54) | random 80/20; CV on train | Accuracy %: **HotS public: LR 54.34, Bradley–Terry 53.50, TrueSkill 53.36/53.06, Basic HOI (full pairwise) 54.45, Factorization HOI 54.75. Dota: LR 61.64, BT 61.37, TrueSkill 52.50/52.61, Basic HOI 65.34, FHOI 63.72.** HotS tournament: LR 59.73 vs Basic HOI 80.59 (see pitfalls). No de-duplication step is described. | [PDF](https://proceedings.nips.cc/paper_files/paper/2018/file/8208974663db80265e9bfe7b222dcb18-Paper.pdf) |
| Gu et al., NeuralAC (AAAI 2021) | Dota2015 (yasp.co, 110 heroes), Dota2018 (Varena, 116), "LoL" = 754,700 matches with 148 champions from a **single-lane game mode** (ARAM-type, so not a Summoner's Rift draft); heroes treated as individuals | 800,000 / 580,270 / 754,700 | random 80/10/10 | AUC / Acc Dota2015, Dota2018, LoL: **BT ≈ LR 0.6330/0.5956, 0.6116/0.5784, 0.6347/0.5969; LightGBM 0.6445/0.6035, 0.6224/0.5929, 0.6411/0.6028; NeuralAC (embeddings + intra/inter-team attention) 0.6615/0.6156, 0.6411/0.6012, 0.6663/0.6209**. TrueSkill, HOI and OptMatch fall in between. Table rows were rebuilt from the PDF's text layout and checked against the paper's prose. | [PDF](https://ojs.aaai.org/index.php/AAAI/article/view/16528), [code](https://github.com/firepd/NAC) |
| Chen et al., JueWu-Draft (IEEE ToG 2021) | Honor of Kings, 95 heroes. Human set: top 5 % players, Aug 1–10, 2020. AI set: self-play. | 30 M each | 10-fold CV | **Human: NN acc 0.617 / AUC 0.694 vs LR 0.568 / 0.642; GBDT acc 0.561.** AI self-play: NN 0.847 / 0.908 vs LR 0.725 / 0.771, GBDT 0.713 / 0.751. Predictor: hero embedding → shared FC/ReLU → concat → FC/sigmoid. | [PDF](https://arxiv.org/abs/2012.10171) |
| Tian, Lan, Zhang, Hero Featured Network (CoG 2022) | HoK, top players, one day in Nov 2019 | 27,256 | not captured | Accuracy at minute 0 (line-up only): **LR 53.3, SVM 51.8, LSTM 54.0, Transformer 54.3, TSSTN 54.6, HFN 55.8** | [PDF](https://ieee-cog.org/2022/assets/papers/paper_98.pdf) |
| BPCoach (arXiv 2023) | HoK pro (KPL, 2022) | 1,182 | random 80/20 | Acc / AUC: **LR 0.528/0.532, RF 0.564/0.572, GBDT 0.523/0.523, NN 0.507/0.513**. The authors cite "the small number of professional battles" for the NN result. | [PDF](https://arxiv.org/abs/2311.05912) |
| Błaszczyk & Szajerman (ICCS 2023) | LoL: a Kaggle "pre-match 2021" set and a Riot-API set (ranked solo/duo, top ~0.011 %, games over 20 min, Jul–Oct 2022) | 2,840 / 2,277 | not captured | Pre-made set, champions only (PC): **46.1–56.8 %** across ~20 models (AdaBoost best at 56.81, RF 55.87, LR 52.46, MLP 53.87). Player-champion stats (PS): **70–92 %** (see pitfalls). | [PDF](https://www.iccs-meeting.org/archive/iccs2023/papers/140760152.pdf) |

**Single-family results and learning curves**

- **LR on hero one-hots, Dota 2 (Conley & Perry, Stanford CS229 2013).** Very-high skill (~top 8 %), Nov 5–Dec 7 matches, no leavers; 51,022 train / 5,669 test (random 90/10). LR test accuracy "asymptotically approaches 69.8 % at about an 18,000 training set size". Weighted kNN reached 67.43 % CV at d = 4 and "nearly 70 %" at ~50,000 matches, with the curve still rising. Each match is scored from both side orientations. — [PDF](https://cs229.stanford.edu/proj2013/PerryConley-HowDoesHeSawMeARecommendationEngineForPickingHeroesInDota2.pdf)
- **LR with hand-picked pair features, Dota 2 (Song, Zhang, Ma, CS229 2015).** With 3,000 matches in 10 folds: training error 0.23–0.33, test error 0.42–0.49. Adding 50 hand-picked two-hero combos with 6,000 matches: test error 0.39–0.45. The authors could not separate the effect of the combos from the extra data. — [PDF](https://cs229.stanford.edu/proj2015/249_report.pdf)
- **LR with synergy/counter "advantage" features, Dota 2 (open-source dota2-predictor).** MMR ≥ 4500; 112,057 train / 8,390 test. 7-fold CV ROC AUC 0.630 ± 0.004; test AUC 0.628, accuracy 0.592. Neural networks did "at best as good as the Logistic Regression". — [code/README](https://github.com/andreiapostoae/dota2-predictor)
- **FM / LR / XGBoost / second-order factorization, Dota 2 (Semenov et al., AIST 2016).** Slides only: AUC 0.66–0.70 depending on skill. The picked heroes "explain at least 6 % of information (Shannon) for very high skill players, 10 % for normal skill". — [slides](https://dtai.cs.kuleuven.be/events/MLSA16/slides/05_Daniil_Yashkov.pdf)
- **Deep residual MLP on champion embeddings, LoL solo queue (LoLDraftAI).** Validation loss 0.681 and accuracy 56.1 % (May 2025 archive, Silver–Master+; the code's default split is random by file, and the README doesn't say which mode produced these numbers). Time-split result: see section 3. — [code/README](https://github.com/Looyyd/loldraftai-monorepo-public)
- **NN line-up predictor, Dota 2 (Hanke & Chaimowicz, AIIDE 2017).** One input per hero, 300 hidden units, retrained hourly on current-patch matches with a 70/30 split; reports **88.63 %** accuracy (see pitfalls). — [PDF](https://ojs.aaai.org/index.php/AIIDE/article/view/12938)
- **Already-known results (not repeated):** DraftRec (280k LoL + 50k Dota matches; [abstract](https://arxiv.org/abs/2204.12750)), Do et al. FDG 2021, Yang et al. 2017, the winrate.gg 2026 benchmark, and the iTero mastery curve.
- **Mobile Legends, pro (MSC 2025, Random Forest / XGBoost).** Draft-phase features reached at most **57 %** accuracy, in-game features 84–88 %. — [snippet](https://jurnal.polibatam.ac.id/index.php/JAIC/article/view/11658)

**Calibration (rarely reported)**
- **LoLDraftAI** (bucketed by confidence, 4 Sep 2025, about 4.46 M validation games): predicted and observed win rates match within about 1–2 points. Examples: the 60–62 % bucket observed 0.6174 vs 0.6125 expected; 70–72 % observed 0.7254 vs 0.7125. — [blog](https://loldraftai.com/blog/loldraftai-explained)
- **DraftGap vs LoLDraftAI** (32,750 time-held-out Emerald+ games): expected calibration error 0.0199 vs 0.0088. DraftGap "overstates" winning drafts and "understates" losing ones. — [blog](https://loldraftai.com/blog/draftgap-vs-loldraftai-comparison)
- **arXiv 2609.08060** (pro LoL team-strength model, not draft-only): walk-forward calibration slope 0.995. — [abstract](https://arxiv.org/abs/2609.08060)
- None of the academic papers above reports log-loss or calibration; they report accuracy and/or AUC only.

### Inferences
- Bradley–Terry with hero strengths is the same model as LR on ± one-hots: the two match to 0.0001 AUC in NeuralAC and within 0.3 points in HOI. Our additive "champion strength" term belongs to this family. The pair terms are the "pairwise interaction" family, but with hand-set shrinkage instead of being fitted jointly.
- LoL solo-queue drafts carry less signal than Dota drafts. LR on Dota heroes reaches AUC 0.63–0.69, while the best LoL champion-only models reach about 56 % accuracy (AUC is not reported, probably around 0.58–0.60). Interactions are therefore relatively harder to detect in LoL.
- TrueSkill on heroes is consistently worse than BT/LR (HOI, NeuralAC), so online Elo-style updating of champion ratings is not worth adopting over batch-fitted, shrunk estimates.

### Gaps
- Costa et al., "Feature Analysis to LoL Victory Prediction on the Picks and Bans Phase" (CoG 2021): only a snippet ("RF, SVM, and LR are the best algorithms"); numbers not retrieved ([ResearchGate](https://www.researchgate.net/publication/356873227_Feature_Analysis_to_League_of_Legends_Victory_Prediction_on_the_Picks_and_Bans_Phase)).
- Semenov et al. full paper (per-skill AUC by model, FM vs LR gap) not retrieved; only the slides.
- No MOBA paper was found that uses field-aware FMs, GA2M / Explainable Boosting Machines, or a hierarchical-Bayes draft model. A search for EBM/GA2M on esports found none.
- No credible graph-neural-network draft-outcome paper was found: only a Swansea student abstract ([snippet](https://cs-student-conference.swan.ac.uk/?p=11559)) and a temporal GCN used for hero balance, not outcomes ([snippet](https://unpaywall.org/10.1109%2FTG.2021.3123583)).
- No Arena of Valor draft-prediction paper was found. Mobile Legends work is mostly small student studies.

## 2. How does accuracy scale with training games, and which families can beat a well-regularized additive model at 50k–200k games?

### Takeaway
Gains from modelling interactions grow with data. At **≤30k games** LR is as good as or better than GBDT, NN and transformers. At **~50k–150k** low-rank pairwise models (FM / Factorization HOI) gain a few tenths of a point. At **0.5–3 M** FM, embedding and attention models gain +0.01–0.035 AUC over LR. Only at **tens of millions** does a deep MLP beat a strong additive model on LoL, and then by about **0.004 nats**. At our volume (50k per band, ~200k pooled), no deep family is expected to win. The realistic wins are a statistically fitted version of the additive model (empirical-Bayes priors, pooling across bands and patches, learned weights and temperature), optionally a low-rank FM pair layer trained on all bands pooled, and a learned personal-experience term.

### Cited Findings

**Learning curves found**
- **LR, Dota 2, very-high skill:** the test-accuracy plateau reaches 69.8 % at about 18k training matches. kNN was still rising at 50k ("may imply that more data could further improve"). — [Conley & Perry PDF](https://cs229.stanford.edu/proj2013/PerryConley-HowDoesHeSawMeARecommendationEngineForPickingHeroesInDota2.pdf)
- **LR with advantage features, Dota 2, 4500+ MMR:** "Experimentally, I'd say at least 150k"; "you can see the plateau after 200k". At 112k training games: test AUC 0.628, accuracy 59.2 %. — [dota2-predictor README](https://github.com/andreiapostoae/dota2-predictor)
- **LR at 2.7k training matches:** train error about 28 % vs test error about 45 %, so heavy overfitting at this size. — [Song et al. PDF](https://cs229.stanford.edu/proj2015/249_report.pdf)
- **LoLDraftAI:** inductive biases (class-based embedding initialisation, keeping adjacent patches close, more auxiliary tasks) "with a lot of training data (in the tens of millions) … are not beneficial, however with less data they did bring slight improvements". The champion×patch embedding is kept at 2 dimensions ("Needs to be small to avoid overfit"). — [ML README](https://github.com/Looyyd/loldraftai-monorepo-public/blob/main/apps/machine-learning/README.md), [config.py](https://github.com/Looyyd/loldraftai-monorepo-public/blob/main/apps/machine-learning/utils/match_prediction/config.py)

**Interaction-model gain over LR, by data size (same data, same split)**

| Games | Game | Gain over LR | Source |
|---|---|---|---|
| 1,182 | HoK pro | RF +3.6 pts; NN **−2.1 pts**; GBDT −0.5 pts | [BPCoach](https://arxiv.org/abs/2311.05912) |
| 27,256 | HoK top players | Transformer +1.0 pts; HFN +2.5 pts (single day; split unknown) | [HFN](https://ieee-cog.org/2022/assets/papers/paper_98.pdf) |
| 46,459 | Dota "notable players" | Basic HOI +3.7 pts; FHOI +2.1 pts (random split, de-duplication not described) | [HOI](https://proceedings.nips.cc/paper_files/paper/2018/file/8208974663db80265e9bfe7b222dcb18-Paper.pdf) |
| 139,462 | HotS Master hero league | FHOI +0.41 pts; Basic HOI +0.11 pts; BT −0.84 pts | [HOI](https://proceedings.nips.cc/paper_files/paper/2018/file/8208974663db80265e9bfe7b222dcb18-Paper.pdf) |
| 580k–800k | Dota / LoL single-lane | LightGBM +0.006–0.012 AUC; NeuralAC +0.029–0.032 AUC (+2.0–2.4 pts) | [NeuralAC](https://ojs.aaai.org/index.php/AAAI/article/view/16528) |
| 1.1 M–3.1 M | HotS / HoN / Dota | FM +0.004–0.035 AUC; GBDT +0.003–0.028 AUC | [GAE](https://arxiv.org/abs/1803.10402) |
| 3.06 M | Dota normal skill | NN +1.8 pts / +0.027 AUC; GBDT +0.6 pts / +0.014 AUC | [Art of Drafting](https://web.cs.ucla.edu/~yzsun/papers/2018_recsys_drafting.pdf) |
| 30 M | HoK top 5 % human | NN +4.9 pts / +0.052 AUC | [JueWu-Draft](https://arxiv.org/abs/2012.10171) |
| tens of millions vs aggregated site stats | LoL Emerald+ | Deep MLP vs DraftGap additive model: **log-loss 0.6829 vs 0.6869, accuracy 55.88 vs 54.66 %** (time split, 32,750 games, vendor-run) | [LoLDraftAI blog](https://loldraftai.com/blog/draftgap-vs-loldraftai-comparison) |

**Reference log-loss points for LoL champion-only models (gain vs ln 2 = 0.6931)**
- LoLDraftAI: 0.681 (May 2025; the code's default split is random by file; [README](https://github.com/Looyyd/loldraftai-monorepo-public)); 0.684 after the duplicate fix ([blog](https://loldraftai.com/blog/correction-reddit-post)); 0.6829 on the time split ([blog](https://loldraftai.com/blog/draftgap-vs-loldraftai-comparison)).
- DraftGap formula on its own frozen data: 0.6869 (same time split; matches with any champion-role cell under 50 games excluded).
- Gains: about 0.010 (LoLDraftAI), 0.006 (DraftGap), 0.0004 (ours, Gold–Plat, against a side-only baseline).

### Inferences
- **Size of the remaining signal.** For calibrated predictions near 50 %, expected log-loss ≈ ln 2 − σ²/8, where σ is the standard deviation of the predicted logit across games. LoLDraftAI's 0.010 gain then implies σ ≈ 0.29 logits (predicted win chances spread about ±7 pts, 1 SD). DraftGap's implies about ±5.6 pts. Ours implies an *effective* spread of only about ±1.4 pts. Our draft signal is mostly lost to estimation noise or miscalibration, not to the model family. In the LoLDraftAI calibration table, about 49 % of games have a draft favourite at ≥ 55 % and about 17 % at ≥ 60 % (derived from the bucket counts in its [blog](https://loldraftai.com/blog/loldraftai-explained)).
- **Champion strength is learnable at 50k per band if shrunk correctly.** A champion-role with a 2 % pick rate gets about 1,000 games per 50k (standard error ≈ 1.6 pts). iTero's 1M-game summary says most champions sit at 46–54 %, so the true spread τ is about 2 pts ([iTero](https://www.itero.gg/articles/draft-sq)). The data-weight ("reliability") is then about 0.6 for such a champion and about 0.3 at a 0.5 % pick rate.
  - The empirical-Bayes prior count is n₀ = p(1−p)/τ² ≈ 400–1,100 games for τ = 1.5–2.5 pts.
  - **Our 150-game prior toward 50 % implies τ ≈ 4.1 pts.** That under-shrinks noisy champions about three- to sevenfold, which adds noise and overconfidence.
  - DraftGap uses 1,000 games by default, and shrinks toward the champion's own 30-day rate, not toward 50 % (section 3).
- **Pair terms cannot be learned per band at this volume.** With ~40–60 viable champions per role there are ~1,600–3,600 lane pairs per role; 50k games give ~15–30 games per pair (standard error ≈ 9–13 pts).
  - If true matchup deltas are 1–3 pts, the reliability is a few percent, so even optimally shrunk matchup and synergy terms are almost pure prior. This matches our backtest.
  - Pooling all bands (~200k) only helps the most common pairs.
  - Our pair prior of 400 games implies τ ≈ 2.5 pts; DraftGap's 1,000 implies ≈ 1.6 pts.
  - Low-rank sharing (FM: pair effect = ⟨v_i, v_j⟩ with small rank) is the only way to learn pair structure at this volume. HOI at 139k (+0.4 pts) is the closest analogue, and it is small.
- **Judgement: what can beat our current hand-built additive model at 50k–200k games.**
  1. **The same additive structure, fitted statistically (most likely to win):**
     - Set the shrinkage per term type by empirical Bayes: estimate τ² as the observed variance minus the mean sampling variance.
     - Shrink hierarchically: band toward all bands, current window toward a longer window.
     - Fit a handful of weights by logistic regression on a time split: intercept/side, one scale per term, plus a temperature.
     - Alternatively, fit a jointly penalised LR / Bradley–Terry on champion-role one-hots, with ridge strength chosen by time-split CV.

     Families: Bayesian / hierarchical and BT/LR. The parameter count is tiny, so this is safe at 13k–50k games. It also addresses the overconfidence measured in DraftGap's unscaled 55-term sum.
  2. **A rank-2–8 FM / factorization pair layer, trained on all bands pooled, with strong L2:** possible but small upside (expected ≲ 0.001–0.002 nats). Keep it only if a paired, time-split log-loss test shows a gain.
  3. **A learned personal-experience term** from the friends' own histories (section 4). This is the biggest effect available to us, but it is learnable only from about 10 × 1,000 personal games, so 1–3 parameters (for example, a slope on log games played on the champion, pooled across friends), using the population curves as a prior.
- **What needs far more data:**
  - Deep or residual MLPs over champion embeddings: tens of millions (LoLDraftAI).
  - NNs on one-hots: 3 M–30 M (Art of Drafting, JueWu).
  - Attention models (NeuralAC, DraftRec): ≥ 0.3–0.8 M, with no gain shown at 27k (HFN).
  - GBDT on one-hots: gains only at ≥ 1 M, worse than LR at 1k–30k.
  - kNN: still rising at 50k in Dota.
  - GNNs: no credible evidence at any size.
- **Realistic target.** Moving our Gold–Plat log-loss from 0.6928 toward about 0.687–0.690 by fixing champion-strength estimation and calibration is a testable hypothesis. DraftGap's 0.6869 on Emerald+ used far more data and excluded rare picks, so it is an upper reference, not a promise.
- **Measurement.** With 13,414 test games, a paired per-game log-loss difference between two similar models has a standard error of roughly 0.0003–0.0004. Differences of about 0.001 nats are detectable with a paired bootstrap; accuracy differences under about 1 pt are not. Report log-loss, Brier score and calibration slope, not accuracy.

### Gaps
- No published learning curve for LoL champion-only models (accuracy or log-loss vs games). LoLDraftAI's `dataset_fraction` setting suggests such ablations were possible, but none was published.
- No paper reports the true variance of LoL matchup or synergy deltas once noise is removed. The τ values above are assumptions anchored on iTero's 46–54 % champion range.
- HOI's +3.7 pts at 46k Dota games conflicts with the general pattern. The data was collected per notable player and the paper describes no de-duplication, so leakage cannot be ruled out (unverified).

## 3. What do the tools actually use?

### Takeaway
**DraftGap** is a fixed additive Elo model:
- champion-role ratings plus 25 matchup and 10 duo deltas per team pair, all at weight 1;
- pseudo-count priors of 1,000 games by default;
- Lolalytics Emerald+ data, current patch shrunk toward the last 30 days;
- no learned parameters, no side term and no published backtest.

**LoLDraftAI** is an 11-layer residual MLP over per-slot champion embeddings plus patch, champion×patch, elo and queue embeddings. It is trained multi-task on tens of millions of solo-queue games with random masking, and is the only tool with public calibration numbers. On a 32,750-game time split it beats DraftGap by 0.004 nats. **iTero** describes an ensemble of linear models and GBDTs with time splits, with no metrics beyond accuracy claims. **JueWu-Draft** pairs an MLP win predictor with MCTS. No STRATZ or Dota Plus method documentation was found.

### Cited Findings

**DraftGap** (source code read at commit 872c6d5, 2026-10-10; [repo](https://github.com/vigovlugt/draftgap))
- **Rating scale:** win rate ↔ rating via `-400·log10(1/w − 1)` and `1/(1+10^(−d/400))` (Elo base-10 logistic, the same scale as ours). — [ratings.ts](https://github.com/vigovlugt/draftgap/blob/main/packages/core/src/rating/ratings.ts)
- **Draft score:** `totalRating = allyChampion + allyDuo + matchup − enemyChampion − enemyDuo`, then `winrate = ratingToWinrate(totalRating)`. There is no intercept, side term or learned weight. A config flag `ignoreChampionWinrates` drops the champion term. — [analysis.ts](https://github.com/vigovlugt/draftgap/blob/main/packages/core/src/draft/analysis.ts)
- **Champion term:** current-patch wins/games for the champion-role, plus `priorGames` pseudo-games at that champion-role's **30-day** win rate (0.5 only if it has no 30-day games). The code comment reads "we expect the champion to have a similar winrate to the expected rating". — [analysis.ts](https://github.com/vigovlugt/draftgap/blob/main/packages/core/src/draft/analysis.ts)
- **Duo term:** all 10 ally pairs.
  - Expected rating = sum of the two champions' raw 30-day ratings.
  - Pair stats are averaged over both directions, then `priorGames` pseudo-games are added at the expected win rate.
  - Term = actual rating − expected rating, so the prior pulls the delta toward 0.
- **Matchup term:** **all 25 ally×enemy pairs**, not only lane opponents.
  - Expected rating = r(ally) − r(enemy).
  - Wins combine the ally's wins and the enemy's losses (averaged), with the same pseudo-count prior.
  - Term = actual − expected.
- **Prior sizes:** `priorGamesByRiskLevel`: very-low 3000, low 2000, **medium 1000 (default)**, high 500, very-high 250. — [risk-level.ts](https://github.com/vigovlugt/draftgap/blob/main/packages/core/src/risk/risk-level.ts), [UserContext.tsx](https://github.com/vigovlugt/draftgap/blob/main/apps/frontend/src/contexts/UserContext.tsx)
- **Data:** scraped from Lolalytics with `tier=emerald_plus`, `region=all`; a current-patch dataset and a 30-day dataset. Matchup and synergy data are deleted from the current-patch set, so pair terms use 30-day data only. — [champion.ts](https://github.com/vigovlugt/draftgap/blob/main/apps/dataset/src/lolalytics/champion.ts), [index.ts](https://github.com/vigovlugt/draftgap/blob/main/apps/dataset/src/index.ts)
- **Rank-bias removal:** `removeRankBias` subtracts the tier's aggregate win-rate rating from every champion and matchup stat, because a tier-filtered pool's average win rate is not 50 %. — [Dataset.ts](https://github.com/vigovlugt/draftgap/blob/main/packages/core/src/models/dataset/Dataset.ts)
- **Game-length view:** `analyzeDraftExtra` shrinks per-game-length-bucket ratings toward the champion's overall rating for its "scaling" chart. — [extra-analysis.ts](https://github.com/vigovlugt/draftgap/blob/main/packages/core/src/draft/extra-analysis.ts)
- **No evaluation code:** no backtest, accuracy, log-loss, Brier or calibration code exists in the repo (grep of the clone).

**LoLDraftAI** (public archive of May 2025 code, later made private; [repo](https://github.com/Looyyd/loldraftai-monorepo-public))
- **Architecture** ([model.py](https://github.com/Looyyd/loldraftai-monorepo-public/blob/main/apps/machine-learning/utils/match_prediction/model.py), [config.py](https://github.com/Looyyd/loldraftai-monorepo-public/blob/main/apps/machine-learning/utils/match_prediction/config.py)):
  - Each of the 10 champion slots gets a 126-d champion embedding plus a 2-d champion×patch embedding, concatenated, so role and side are implied by slot order.
  - Added inputs: a 64-d patch embedding, a 32-d elo embedding and a 32-d queue embedding.
  - MLP with hidden layers [1024, 512×4, 256×4, 128, 64], BatchNorm, GELU and residual connections; dropout 0.5, weight decay 0.05.
  - 50 epochs, one-cycle learning rate 8e-4.
- **Elo input:** 7 buckets by the match's average tier: Master+, Diamond I–II, Diamond III–IV, Emerald I, Platinum I, Gold I, Silver I. Queues 420 (solo/duo) and 700 (Clash). — [column_definitions.py](https://github.com/Looyyd/loldraftai-monorepo-public/blob/main/apps/machine-learning/utils/match_prediction/column_definitions.py)
- **Multi-task loss:** win weight 1; four game-length win heads at 0.1 each; game duration 0.01; gold@15 tasks totalling 0.1. — [task_definitions.py](https://github.com/Looyyd/loldraftai-monorepo-public/blob/main/apps/machine-learning/utils/match_prediction/task_definitions.py)
- **Training details** ([ML README](https://github.com/Looyyd/loldraftai-monorepo-public/blob/main/apps/machine-learning/README.md)):
  - Random masking teaches partial drafts, because pick order is not in the Riot API.
  - The pro model is fine-tuned from the solo-queue model with a new queue embedding, mixing solo-queue data back in to avoid "catastrophic forgetting".
- **Split and de-duplication** ([prepare_data.py](https://github.com/Looyyd/loldraftai-monorepo-public/blob/main/apps/machine-learning/scripts/match-prediction/prepare_data.py)):
  - The default split is a random **file-level 90/10** split.
  - An optional `next_patch_test` mode tests on the two most recent patches.
  - Rows whose matchId prefix doesn't match their region are dropped "to fix duplicate rows".
- **Reported metrics:**
  - Solo queue: validation loss 0.681, accuracy 56.1 % (epoch 46). Pro: validation loss 0.6775, accuracy 56.8 %. — [README](https://github.com/Looyyd/loldraftai-monorepo-public)
  - "Millions of games", inputs "champions played, patch, and elo", 56 % accuracy, calibration table. — [blog](https://loldraftai.com/blog/loldraftai-explained)
  - **Time split vs DraftGap (Apr 2026):** Emerald+, EUW1+KR, 32,750 games played after both models' data cutoffs; DraftGap reproduced with a Python port of its formula. Log-loss 0.6829 vs 0.6869; Brier 0.2449 vs 0.2469; accuracy 55.88 vs 54.66 %.
    - By slice (LoLDraftAI vs DraftGap log-loss): Master+ 0.6814 vs 0.6818 (tie); Diamond I–II 0.6818 vs 0.6879; Emerald I 0.6846 vs 0.6871.
    - Source: [vendor blog, a competitor comparison](https://loldraftai.com/blog/draftgap-vs-loldraftai-comparison).

**iTero**
- Pro model described as "many different techniques combined into one", including "simple linear models" and "gradient boosted trees". Splits are by time. Pro accuracy is quoted as "c. 70–73 %" vs bookmakers' "c. 63–65 %"; the article says these numbers are rough. No log-loss, AUC or calibration is given. — [blog (marketing)](https://itero.gg/articles/the-draft-model)
- The Overwolf coach article says the models were repurposed for an "average game", brute-forcing about 160 champions, at "around 67 %" accuracy. — [snippet](https://www.itero.gg/articles/overwolf)
- The solo-queue analysis uses one model to predict gold at 12 minutes and a second for the result, trained on 1M+ games. — [blog](https://www.itero.gg/articles/draft-sq)

**JueWu-Draft (Tencent, HoK)**
- MLP win-rate predictor trained on 30 M games, used as the reward in MCTS, plus a separate policy/value network. About 0.4 M self-play games for the single-round setting. — [PDF](https://arxiv.org/abs/2012.10171)

**Others**
- **dota2protracker:** shows a "D2PT draft prediction" per match, based on STRATZ-parsed drafts, with no published method. — [snippet](https://dota2protracker.com/matches/8973000154)
- **Winio (Dota):** markets learned hero embeddings for 163 heroes trained on 90,000+ drafts. — [snippet, marketing](https://winio.ai/how-the-winio-platform-works)
- **Counterwatch (Overwatch analogue):** shrinks hero win rates toward 50 % with a tuned 400-match prior. — [snippet](https://www.counterwatch.gg/methodology)

### Inferences
- **DraftGap vs our engine.** DraftGap differs from ours mainly in three ways. Each is a cheap change to test:
  - Its champion prior is about 7× stronger and centred on a longer-window estimate instead of 50 %.
  - It sums matchups over all 25 cross pairs, symmetrised.
  - It runs on vastly more data (Lolalytics Emerald+ for all regions).

  Like ours, it never fits its term weights. LoLDraftAI's calibration finding (DraftGap overconfident) is what an unscaled sum of 55 noisy terms produces, so a one-parameter temperature fit would likely help both engines.
- **LoLDraftAI's design is not transferable** to a pure-TypeScript engine at our data volume. It also has no side input beyond slot order.
- **One idea worth copying:** shrinking current-patch statistics toward a longer window (DraftGap) and keeping patch-specific champion effects tiny (LoLDraftAI's 2-d champion×patch embedding) are two expressions of the same principle. Treat patch effects as small deviations, heavily shrunk.

### Gaps
- winrate.gg internals were not re-researched; the 2026 benchmark was already known.
- No STRATZ or Dota Plus documentation of a pre-game draft model was found. Dotabuff, Lolalytics and op.gg draft features were not investigated.
- LoLDraftAI's training-set size is stated only as "millions" (blog) and "tens of millions" (README). Inference: if the validation set is the 10 % file split, the 4.46 M validation games in the Sep 2025 calibration table suggest about 40 M training games.

## 4. Which inputs beyond the ten champions measurably help in solo queue?

### Takeaway
**Player experience on the champion** is by far the largest measurable input: about 13 pts between low- and high-mastery bins, and about +4 to +8 pts over the first games on a champion. Champion-only models plateau at about 55–56 %, while player-based models reach the high 60s. **Side** is worth about 0–1 pt in LoL solo queue (versus about 3.75 pts for Radiant in Dota). **Rank band** changes draft predictability only slightly in LoL. **Patch** is handled as a small, heavily shrunk deviation by both major tools. **Role** is built into every LoL tool, but its effect has not been isolated. **Duo/premade** effects lack a retrievable primary source.

### Cited Findings
- **Experience, iTero (1M+ games):**
  - Under 5k mastery: 41.5 % win rate; over 500k: 54.5 %.
  - 2.5k → 7.5k mastery adds "almost 8" pts; 75k → 175k adds under 1 pt.
  - Team AD share between 20 and 80 % gives about average results; below 20 % hurts more than above 80 %.
  - Source: [blog](https://www.itero.gg/articles/draft-sq)
- **Experience, Riot dev blog:** even an easy-to-learn champion "will likely increase in win rate by 4 % over the first ~15 games", often climbing until about 100 games. — [snippet](https://www.leagueoflegends.com/en-us/news/dev/dev-balancing-new-champions/)
- **Experience, 2017 Nexus analysis:** learning curves differ by champion: flat for Malphite, Volibear and Miss Fortune; steep early for Aurelion Sol and Ivern; long for Yasuo, Riven and Nidalee. — [snippet](https://nexus.leagueoflegends.com/en-us/2017/06/riven-vs-yasuo-1v1-data-only/)
- **Players vs champions:**
  - CHAMP (CIKM 2026, an unnamed large MOBA): a player-history win-rate network reaches **67.73 %** accuracy for matchmaking. — [abstract](https://arxiv.org/abs/2609.04870)
  - Compare with champion-only LoL at about 56 % (LoLDraftAI). DraftRec's +2 pts from player history is already known.
- **Side, LoL solo queue:**
  - lolprofile live snapshot: blue 49 % vs red 51 % over 1,685,172 ranked games; EUW blue 48.7 % (225,083 games). — [snippet](https://lolprofile.net/statistics)
  - Riot (Jan 2020): no clear side advantage in Ranked Solo/Duo. — [snippet](https://esportstales.com/league-of-legends/blue-and-red-side-win-rates)
  - Pro play: blue about 51–52 % in 2021–22 and an outlier near 80 % at Worlds 2023. — [snippet](https://earlygame.com/lol/worlds-2023-blue-or-red-one-side-is-op-this-tournament)
- **Side, Dota:** Radiant won 53.75 % of 3.06 M normal-skill games. — [Art of Drafting PDF](https://web.cs.ucla.edu/~yzsun/papers/2018_recsys_drafting.pdf)
- **Skill, Dota:** heroes explain ≥ 6 % of outcome information at very high skill vs 10 % at normal skill. — [Semenov slides](https://dtai.cs.kuleuven.be/events/MLSA16/slides/05_Daniil_Yashkov.pdf)
- **Rank, LoL:**
  - The deep model's accuracy ranges from 55.27 % (Emerald I) to 56.35 % (Diamond I–II), with Master+ at 55.97 %; DraftGap ranges from 54.37 to 55.76 %. — [blog](https://loldraftai.com/blog/draftgap-vs-loldraftai-comparison)
  - LoLDraftAI feeds elo as a 7-bucket embedding. — [code](https://github.com/Looyyd/loldraftai-monorepo-public/blob/main/apps/machine-learning/utils/match_prediction/column_definitions.py)
- **Patch:**
  - LoLDraftAI: patch embedding plus a deliberately tiny 2-d champion×patch embedding; "early patch data may be combined with the previous patch data". — [config](https://github.com/Looyyd/loldraftai-monorepo-public/blob/main/apps/machine-learning/utils/match_prediction/config.py), [blog](https://loldraftai.com/blog/loldraftai-explained)
  - DraftGap: current patch shrunk toward 30 days with 1,000 pseudo-games. — [code](https://github.com/vigovlugt/draftgap/blob/main/packages/core/src/draft/analysis.ts)
- **Role:** DraftGap keys every statistic by champion×role; LoLDraftAI encodes role through fixed slots (TOP, JUNGLE, MIDDLE, BOTTOM, UTILITY per team). — [code](https://github.com/vigovlugt/draftgap/blob/main/packages/core/src/draft/utils.ts), [code](https://github.com/Looyyd/loldraftai-monorepo-public/blob/main/apps/machine-learning/utils/match_prediction/column_definitions.py)
- **Pick order:** LoLDraftAI says pick order is not in Riot match data, so models trained on it cannot learn "blind-pickability". — [blog](https://loldraftai.com/blog/loldraftai-explained)
- **Pro only:** a first-pick covariate is used in the pro pre-game model of arXiv 2609.08060. — [abstract](https://arxiv.org/abs/2609.08060)

### Inferences
- **Personal experience term.** Our hand-set personal experience penalty addresses the largest real effect, so it is the term most worth calibrating. Fit it from the friends' own histories: win ~ log(games on the champion in the last N months) + champion-strength offset, pooled across friends with shrinkage. Use the iTero and Riot curves as the prior shape. Collected games carry no player IDs, so they cannot supply this.
- **Side.** It is one learned intercept; on our data it is near zero (side-only log-loss 0.6932).
- **Rank band.** Pooling across bands for pair terms and the experience curve costs little predictive accuracy, given how flat draft predictability is across Emerald–Master in LoLDraftAI's slices. Keep only champion strength band-specific, shrunk toward the all-band value.

### Gaps
- **Duo/premade:** a Riot statement (2022) reportedly cited "upwards of a 10 % win-rate spread" from MMR-imbalanced duos, but the primary page was not retrieved. No population-level LoL duo effect was found.
- **Role, patch recency and side:** no ablation isolates these in LoL draft models.
- **Gold–Plat experience curve:** no published LoL experience curve specific to Gold–Plat was found.

## 5. Reported pitfalls

### Takeaway
The large accuracy claims in this literature (62 %, 70–92 %) come from duplicated matches, player statistics that include or postdate the predicted game, tiny test sets, or random splits within one short window. Honest time-split, draft-only LoL numbers cluster at **54–56 % accuracy and log-loss 0.683–0.687**.

### Cited Findings
- **Duplicates across splits.**
  - LoLDraftAI's collector labelled EUW games as KR, OCE and NA, so "almost every match was … duplicated four times", with no unique constraint on matchId. Duplicates crossed the train/test split, producing a claimed 62 % when the true figure was 52 %. Fixed models reached about 55 % and log-loss 0.684. — [blog](https://loldraftai.com/blog/correction-reddit-post)
  - The code now drops rows whose matchId prefix doesn't match their region. — [prepare_data.py](https://github.com/Looyyd/loldraftai-monorepo-public/blob/main/apps/machine-learning/scripts/match-prediction/prepare_data.py)
- **Player statistics leaking outcome.** ICCS 2023 used player-champion statistics: in the Kaggle set, "pre-game statistics … for that champion in previous matches"; in their own Riot-API set, a crawl of "the 20 previously played games" of each player.
  - On the Kaggle set, those statistics alone gave up to about **92 %** accuracy, against **≤ 56.8 %** for champions only. — [PDF](https://www.iccs-meeting.org/archive/iccs2023/papers/140760152.pdf)
  - Inference: statistics gathered after the match can include the predicted game. The same pattern as Do et al.'s 75 % (already known).
- **Implausible or unreplicated claims:**
  - Hanke & Chaimowicz report 88.63 % on Dota line-ups with a 70/30 split of current-patch data ([PDF](https://ojs.aaai.org/index.php/AIIDE/article/view/12938)).
  - HOI reports 80.59 % from heroes alone on 9,610 HotS tournament games with a random split ([PDF](https://proceedings.nips.cc/paper_files/paper/2018/file/8208974663db80265e9bfe7b222dcb18-Paper.pdf)).
  - Conley & Perry's LR reached 69.8 % ([PDF](https://cs229.stanford.edu/proj2013/PerryConley-HowDoesHeSawMeARecommendationEngineForPickingHeroesInDota2.pdf)), against 59.2 % at 112k games ([dota2-predictor](https://github.com/andreiapostoae/dota2-predictor)) and 63.6 % at 3 M ([Art of Drafting](https://web.cs.ucla.edu/~yzsun/papers/2018_recsys_drafting.pdf)) for similar LR setups.
  - Mobile Legends: 96.67 % from a 90-sample test set. — [snippet](https://ejurnal.umri.ac.id/index.php/coscitech/article/view/6707)
- **Random splits within one short window.** The academic comparisons all use them:
  - JueWu: 10-day window, 10-fold CV. Art of Drafting and GAE: ~3-week window, 10-fold CV. HOI: random 80/20. NeuralAC: random 80/10/10. BPCoach: random 80/20.
  - LoLDraftAI's default is a random file-level split, with an optional next-patch test. — [prepare_data.py](https://github.com/Looyyd/loldraftai-monorepo-public/blob/main/apps/machine-learning/scripts/match-prediction/prepare_data.py)
- **Time-split protocols exist:**
  - iTero states a time split ([blog](https://itero.gg/articles/the-draft-model)).
  - LoLDraftAI vs DraftGap used a temporal holdout after both data cutoffs ([blog](https://loldraftai.com/blog/draftgap-vs-loldraftai-comparison)).
  - arXiv 2609.08060 uses walk-forward evaluation with Diebold–Mariano tests ([abstract](https://arxiv.org/abs/2609.08060)).
- **Selection in evaluation.** The DraftGap comparison excluded matches with any champion-role cell under 50 games in DraftGap's data, and it is a competitor-run study. — [blog](https://loldraftai.com/blog/draftgap-vs-loldraftai-comparison)
- **Metric choice.** LoLDraftAI notes that accuracy is capped because most drafts are near 50/50, and that 0.684 log-loss is only slightly better than 0.693. — [blog](https://loldraftai.com/blog/correction-reddit-post)
- **"Predictions about predictions".**
  - LoLDraftAI's suggestion-lift study (10,000 held-out games, patches 15.10–16.08, Silver–Master+) measures *model-predicted* gains of +3.0 to +7.3 % from the top suggestion, not realised win rates.
  - It assumes later opponent picks don't react to the swap.
  - Pick order is unavailable, so slots were randomly shuffled.
  - Source: [blog](https://loldraftai.com/blog/suggestion-lift-study)
- **Rank bias in tier-filtered aggregates.** DraftGap corrects every statistic for the tier's non-50 % aggregate win rate. — [Dataset.ts](https://github.com/vigovlugt/draftgap/blob/main/packages/core/src/models/dataset/Dataset.ts)
- **Pro vs solo queue.**
  - Pro outcomes are dominated by team strength. iTero's pro figure of about 70–73 % is not comparable to draft-only solo queue ([blog](https://itero.gg/articles/the-draft-model)).
  - A team-strength logistic model (5,135 pro games, 2024–26) is "statistically indistinguishable" from Polymarket on 928 maps ([abstract](https://arxiv.org/abs/2609.08060)).
  - Draft-only pro models score about 50–57 %: LoLDraftAI pro 56.8 % ([README](https://github.com/Looyyd/loldraftai-monorepo-public)), BPCoach HoK 50.7–56.4 % ([PDF](https://arxiv.org/abs/2311.05912)), MSC 2025 Mobile Legends ≤ 57 % ([snippet](https://jurnal.polibatam.ac.id/index.php/JAIC/article/view/11658)).
- **Very small pro samples.** BPCoach's authors note that "handling complex but small amounts of data is always a challenge" and that draft-only accuracy of "around 60 % has been unbreakable". — [PDF](https://arxiv.org/abs/2311.05912)

### Inferences
- **For our backtests:**
  - De-duplicate by matchId before any split.
  - Split by time (train on the window before the test day), never randomly.
  - If rows are ever stored per team, keep both teams' rows of a match in the same split.
  - Compute player-experience features only from games strictly before the predicted game.
  - Report paired log-loss differences with bootstrap intervals, plus Brier score and calibration slope.
- **For LoLDraftAI-style suggestion lifts:** evaluate against realised outcomes (for example, the Last game card) before claiming a gain.

### Gaps
- No source was found that documents a "both teams' rows split apart" leak in a MOBA paper. It is a general principle here, not a cited incident.
- No Kaggle notebook with an honest time split for LoL draft-only prediction was found.

## 6. New work 2023–2026

### Takeaway
Since 2023 the practical progress comes from tools, not papers. The main ones are LoLDraftAI's open-sourced deep MLP with vendor-run time-split comparisons, and DraftGap's continued additive approach. Academic 2023–2026 work is mostly HoK pro analytics (small data), player-based matchmaking predictors, and pro team-strength forecasting. No LLM-based draft *win-prediction* paper, contrastive champion-embedding paper or credible GNN draft-outcome paper was found.

### Cited Findings
- **LoLDraftAI (2025–2026):**
  - Open-sourced in May 2025, then taken private. — [repo](https://github.com/Looyyd/loldraftai-monorepo-public)
  - "How it works" post, Sep 2025. — [blog](https://loldraftai.com/blog/loldraftai-explained)
  - Time-split comparison with DraftGap, Apr 2026. — [blog](https://loldraftai.com/blog/draftgap-vs-loldraftai-comparison)
  - Suggestion-lift study, Apr 2026. — [blog](https://loldraftai.com/blog/suggestion-lift-study)
  - Comparison posts with iTero and LoLTheory, Apr 2026; titles only were seen. — [blog index](https://loldraftai.com/blog)
- **DraftGap** is still maintained (last commit 2026-10-10) with the additive formula unchanged in structure. — [repo](https://github.com/vigovlugt/draftgap)
- **arXiv 2609.08060 (Sep 2026):** pre-game paired-comparison model for pro LoL maps.
  - Single-stage logistic regression combining exponentially weighted same-side form, a ridge-shrunk "stable strength" and a first-pick draft covariate.
  - 5,135 games; scores 0.2230 on the global holdout and 0.2207 walk-forward, vs a dynamic Bradley–Terry benchmark at 0.2351; calibration slope 0.995.
  - The abstract doesn't name the metric. Inference: likely the Brier score, since a coin flip scores 0.25.
  - Source: [abstract](https://arxiv.org/abs/2609.08060)
- **CHAMP (CIKM 2026, arXiv 2609.04870):** a domain-aware win-rate network for matchmaking in an unnamed large MOBA, built from player features (not heroes); 67.73 % offline accuracy. — [abstract](https://arxiv.org/abs/2609.04870)
- **arXiv 2605.18338 (May 2026):** player-conditional champion ranking using style similarity, mastery priors and archetype guardrails. Only a single-player, 100-game case study; no quantitative evaluation. — [abstract](https://arxiv.org/abs/2605.18338)
- **BPCoach (2023):** visual analytics for HoK pro drafting with an RF/NN win-rate predictor on 1,182 games. — [PDF](https://arxiv.org/abs/2311.05912)
- **Hero Featured Network (CoG 2022):** HoK, line-up-only accuracy 55.8 % on 27k games. — [PDF](https://ieee-cog.org/2022/assets/papers/paper_98.pdf)
- **Unevaluated hobby repos (snippets):**
  - A transformer that drafts LoL comps. — [lgestin/loldrafter](https://github.com/lgestin/loldrafter)
  - A masked-language-model pick predictor on Match-V5. — [EnguerrandLN/lol-draft-ml-predictor](https://github.com/EnguerrandLN/lol-draft-ml-predictor)
  - A pro-draft MLP. — [Sorixon/esports-draft-predictor](https://github.com/Sorixon/esports-draft-predictor)
- **DraftFM (2026):** "A Foundation Model for Day-Zero Drafting in Magic: The Gathering"; a card game, not a MOBA; title only. — [arXiv](https://arxiv.org/abs/2608.19568)
- **Mobile Legends MSC 2025:** draft-only ≤ 57 % vs in-game 84–88 %. — [snippet](https://jurnal.polibatam.ac.id/index.php/JAIC/article/view/11658)

### Inferences
- The newest evidence (LoLDraftAI vs DraftGap, 2026) is the most relevant to us. On a strict time split in LoL solo queue, a very large deep model beats a well-built additive model by only about 0.004 nats and 1.2 accuracy points. For a ≤ 10-user coach at ~50k games per band, the return on deep architectures is negligible next to fixing estimation and calibration of the additive terms.
- If DraftGap's additive formula is accurate to within about 0.004 nats of the best deep model, its strongest choices are the ones we lack: a strong prior centred on a longer-window estimate, symmetric 25-pair matchups, and a large training pool. Our next experiments should test those first, then a fitted temperature and term weights. FM pair layers come last.

### Gaps
- No 2024–2026 peer-reviewed paper on LoL solo-queue draft-only prediction was found. Searches for transformers, LLM drafting and contrastive embeddings returned older or unrelated work.
- "Lost in Draft" (University of Agder thesis, 2021; MCTS with a win-rate predictor on Dota 2 and LoL; reports that first pick wins more often than last pick under most draft schemes) is known only from a snippet; the PDF download failed ([record](https://uia.brage.unit.no/uia-xmlui/handle/11250/3026277)).
