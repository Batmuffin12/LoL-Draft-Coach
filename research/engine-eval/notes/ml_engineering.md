# ML engineering for a TypeScript draft-coach engine: training, export, inference, drift, explainability, cost

Research date: 2026-10-17. Versions and dates come from the npm registry, PyPI JSON API and GitHub API as queried on that day unless stated. "Local measurement" means a benchmark run for these notes on the developer PC (Windows 11, 16 logical CPUs, Node 24.14.0, Python 3.14.8, scikit-learn 1.9.1, LightGBM 4.7.0, interpret 0.7.8, onnxruntime 1.31.0 / onnxruntime-node 1.30.0) on **synthetic** LoL-like drafts. Those numbers have no URL. The method is described under section 1, "Local benchmark method". Anything read only from a search snippet is marked "(snippet)".

## 1. Training options and their trade-offs: TS/Node, Python with export, or trees compiled to JS (maintenance status in 2026)

### Takeaway
In 2026 the JavaScript ML training ecosystem is thin and mostly stale. TensorFlow.js has had no release since tfjs-v4.22.0 (Oct 2024). The ml.js model packages date from 2020–2022. YDF's JS packages are 0.0.x. The WASM ports of LightGBM and XGBoost are new 0.x packages with about 3k downloads a month. The Python stack is very active: scikit-learn 1.9.1, LightGBM 4.7.0, XGBoost 3.4.1, interpret 0.7.8 and PyMC 6.3.2 all shipped in 2025–26. A practical split follows:
- **Logistic regression and FM-type additive or pairwise models:** a small hand-written TypeScript trainer is enough. It is fast and needs no dependencies (local measurement: 80 ms for 200k drafts).
- **EBM, gradient-boosted trees and hierarchical Bayes:** train them in Python offline and export JSON tables or trees.
- **Code generation (m2cgen):** effectively unmaintained, and it breaks on LightGBM categorical splits.

### Cited Findings
**(a) Training in TypeScript or Node**
- TensorFlow.js: the newest GitHub release is tfjs-v4.22.0 ("Latest", dated 21 Oct). The release before it, 4.21.0, is dated 04 Sep. The page makes no maintenance-mode or deprecation statement. — [tfjs releases](https://github.com/tensorflow/tfjs/releases)
- On npm, @tensorflow/tfjs and @tensorflow/tfjs-node are both still 4.22.0. The registry dates the 4.22.0 publish to 2024-10-21 and 4.21.0 to 2024-09-03; metadata was last modified in Jan 2025. The repo's last push was 2026-06-23, and it has 19,148 stars. Downloads over 2026-09-13..10-12 were 2,193,053 (tfjs) and 446,822 (tfjs-node). — [npm @tensorflow/tfjs](https://www.npmjs.com/package/@tensorflow/tfjs); [GitHub API tensorflow/tfjs](https://api.github.com/repos/tensorflow/tfjs); [npm downloads API](https://api.npmjs.org/downloads/point/last-month/@tensorflow/tfjs)
- ml.js:
  - ml-matrix is active: 6.15.0, last modified 2026-08-05, 7.3M downloads a month.
  - ml-logistic-regression is stale. Version 2.0.0 was published 2020-05-03, the repo's last push was 2022-03-03, and it has 18 stars, yet it still gets 742k downloads a month.
  - ml-random-forest 2.1.0, ml-cart 2.1.1 and ml-xgboost 1.1.2 have registry metadata last modified in 2022.
  - Sources: [npm ml-matrix](https://www.npmjs.com/package/ml-matrix); [npm ml-logistic-regression](https://www.npmjs.com/package/ml-logistic-regression); [GitHub API mljs/logistic-regression](https://api.github.com/repos/mljs/logistic-regression)
- @stdlib/ml-incr-binary-classification 0.2.3 ("Incrementally perform binary classification using stochastic gradient descent (SGD)") was last modified 2026-02-08, and its repo was pushed 2026-10-03. It gets 5,458 downloads a month. — [GitHub API stdlib-js/ml-incr-binary-classification](https://api.github.com/repos/stdlib-js/ml-incr-binary-classification); [npm](https://www.npmjs.com/package/@stdlib/ml-incr-binary-classification)
- Yggdrasil Decision Forests (YDF):
  - ydf-inference 0.0.4 (2024-10-17) runs in browsers and Node.js. ydf-training 0.0.1 (2024-10-18) is "implemented with Javascript and WebAssembly" (snippet).
  - Downloads: 386 and 34 a month.
  - The Python package ydf is at 0.16.1 (2026-03-26).
  - Sources: [npm ydf-training](https://npmjs.com/package/ydf-training); [YDF JS docs](https://ydf.readthedocs.io/javascript/); [PyPI ydf](https://pypi.org/project/ydf/)
- New WASM or TypeScript ports (all version 0.x):
  - @wlearn/xgboost 0.3.0 ("XGBoost v3.4.1 compiled to WebAssembly") and @wlearn/lightgbm 0.3.0 ("LightGBM WASM port"), both dated 2026-09-30, with about 2.9k and 3.0k downloads a month.
  - @knockdata/lightgbmjs 0.2.1, with 45 downloads a month.
  - @liquidau/solvers 0.6.3 (2026-10-13, "Exact, scikit-learn-verified solvers in TypeScript: weighted L2 logistic regress…"), with 1,769 downloads a month.
  - brain.js is still on 2.0.0-beta.24 (Jul 2024).
  - Sources: [npm @wlearn/xgboost](https://www.npmjs.com/package/@wlearn/xgboost); [npm @wlearn/lightgbm](https://www.npmjs.com/package/@wlearn/lightgbm); [npm @liquidau/solvers](https://www.npmjs.com/package/@liquidau/solvers)

**(b) Training in Python and exporting**
- PyPI latest versions (upload date of the latest file):

  | Package | Version | Released | Notes |
  | --- | --- | --- | --- |
  | scikit-learn | 1.9.1 | 2026-09-10 | BSD-3, Python ≥3.11 |
  | lightgbm | 4.7.0 | 2026-07-18 | Windows wheel 1.4 MB |
  | xgboost | 3.4.1 | 2026-08-15 | Python ≥3.12, wheels 49–58 MB |
  | catboost | 1.2.10 | 2026-02-18 | wheels about 100 MB |
  | interpret | 0.7.8 | 2026-03-17 | interpret-core wheel 15.6 MB |
  | glum | 3.4.1 | 2026-05-06 | |
  | statsmodels | 0.15.0 | 2026-08-27 | |
  | torch | 2.14.1 | 2026-09-30 | Windows wheel 124 MB, Linux 555 MB |
  | pymc | 6.3.2 | 2026-09-08 | |
  | numpyro | 0.22.0 | 2026-09-18 | |
  | cmdstanpy | 1.3.0 | 2025-10-20 | |
  | optuna | 5.0.0 | 2026-09-07 | |

  Sources: [PyPI scikit-learn](https://pypi.org/project/scikit-learn/); [PyPI lightgbm](https://pypi.org/project/lightgbm/); [PyPI xgboost](https://pypi.org/project/xgboost/); [PyPI interpret](https://pypi.org/project/interpret/); [PyPI pymc](https://pypi.org/project/pymc/); [PyPI torch](https://pypi.org/project/torch/)
- interpret's release rhythm: 0.6.16 (Jul 9, 2025), then 0.7.0–0.7.4 (Jul–Dec 2025), then 0.7.5–0.7.8 (Feb–Mar 2026). The repo is MIT, has 6,961 stars and was pushed 2026-10-16. — [PyPI interpret](https://pypi.org/project/interpret/); [GitHub API interpretml/interpret](https://api.github.com/repos/interpretml/interpret)
- LightGBM's GitHub repo is now `lightgbm-org/LightGBM` (MIT, 18,885 stars, pushed 2026-10-16). A mirror says it moved from Microsoft in March 2026, with the same maintainers (snippet). — [GitHub API lightgbm-org/LightGBM](https://api.github.com/repos/lightgbm-org/LightGBM); [mirror note](https://source-hub.etos-pro.ru/microsoft/LightGBM/blame/branch/master/README.md)
- Dedicated factorization-machine libraries are abandoned: xlearn 0.40a1 (2018-12-04) and fastFM 0.2.11 (2017-11-23). — [PyPI xlearn](https://pypi.org/project/xlearn/); [PyPI fastFM](https://pypi.org/project/fastFM/)
- Export tooling is maintained:
  - onnx 1.23.2 (2026-10-06) and onnxruntime 1.31.0 (2026-10-09).
  - skl2onnx 1.20.0 and onnxmltools 1.16.0 (both 2026-01-30).
  - ebm2onnx 3.3.1 (2025-12-18; MIT, 23 stars).
  - hummingbird-ml 0.4.12 (2024-10-25; repo still pushed 2026-09-14).
  - Sources: [PyPI skl2onnx](https://pypi.org/project/skl2onnx/); [PyPI onnxmltools](https://pypi.org/project/onnxmltools/); [PyPI ebm2onnx](https://pypi.org/project/ebm2onnx/); [GitHub API microsoft/hummingbird](https://api.github.com/repos/microsoft/hummingbird)
- glum supports a separate penalty for each coefficient:
  - P1: "This array controls the strength of the regularization for each coefficient independently."
  - P2: "A 1d array is interpreted as diagonal (square) matrix."
  - X can be a sparse matrix.
  - Solvers include 'irls-cd' (IRLS with coordinate descent) and 'lbfgs'.
  - Source: [glum GLM docs](https://glum.readthedocs.io/en/latest/glm.html)
- scikit-learn 1.9.1 signatures:
  - `LogisticRegression.fit(X, y, sample_weight=None)`, with a `warm_start` parameter (default False).
  - `SGDClassifier.partial_fit(X, y, classes=None, sample_weight=None)`.
  - These were confirmed by inspecting the installed 1.9.1 package. — [LogisticRegression docs](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LogisticRegression.html); [SGDClassifier docs](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.SGDClassifier.html)
- LoLDraftAI as a worked example of offline training:
  - It is a PyTorch model (embeddings plus an MLP with residual connections) trained on "millions of games". "Full training takes a few hours."
  - It is converted to ONNX "because the model is quite small… it runs fast even on cpu inference".
  - Its `train.py --continue_training` / `adapt_model.py` "update the model on a new patch without training from scratch".
  - Sources: [LoLDraftAI: How it works (Sep 4, 2025)](https://loldraftai.com/blog/loldraftai-explained); [loldraftai-monorepo-public ML README](https://github.com/Looyyd/loldraftai-monorepo-public/blob/HEAD/apps/machine-learning/README.md)

**(c) Compiling trees to JS**
- m2cgen:
  - Latest release 0.10.0 (Apr 26, 2022). Python classifiers list 3.7–3.10. The repo's last push was 2024-08-03 (3,000 stars, not archived).
  - It lists JavaScript among its outputs, plus LightGBM boosting ("gbdt/dart/goss booster only"), XGBoost ("gbtree… /gblinear booster only") and scikit-learn linear models.
  - Sources: [PyPI m2cgen](https://pypi.org/project/m2cgen/); [m2cgen README](https://github.com/BayesWitnesses/m2cgen); [GitHub API](https://api.github.com/repos/BayesWitnesses/m2cgen)
- Treelite and TL2cgen:
  - Treelite 4.7.2 (2026-09-02) describes itself as a "Universal model exchange and serialization format for decision tree forests".
  - TL2cgen ("TreeLite 2 C GENerator") 1.0.0 (2024-03-06) generates C, not JS.
  - Sources: [GitHub API dmlc/treelite](https://api.github.com/repos/dmlc/treelite); [GitHub API dmlc/tl2cgen](https://api.github.com/repos/dmlc/tl2cgen); [PyPI treelite](https://pypi.org/project/treelite/)
- The LightGBM README lists Treelite, lleaves and Hummingbird as unofficial compilers. It says they are "not maintained or officially endorsed by the LightGBM development team" (snippet). — [LightGBM repo](https://github.com/lightgbm-org/LightGBM)
- `lgbm-to-code` (PyPI) claims JavaScript output (snippet; not verified). — [PyPI lgbm-to-code](https://pypi.org/project/lgbm-to-code)
- `Booster.dump_model()` exports a LightGBM model as JSON ("Dump Booster to JSON format"). — [LightGBM Booster docs](https://lightgbm.readthedocs.io/en/latest/pythonapi/lightgbm.Booster.html)

### Inferences
#### Local benchmark method
This method applies to every "local measurement" in these notes.

**Synthetic data**
- 170 champions and 5 roles.
- Each champion has one primary role (34 per role) and a 30% chance of a secondary role. Popularity within a role pool is Zipf-like (exponent 0.9).
- The true win logit is the sum of:
  - a 0.04 blue-side bias,
  - champion-role strengths (σ = 0.12) for the blue team minus the red team,
  - an antisymmetric lane-matchup term per role (σ ≈ 0.10),
  - a bot–support duo term (σ = 0.06).
- Labels are drawn from a Bernoulli distribution. Train/test split is 80/20.

**Encodings**
- Logistic regression: a sparse antisymmetric team encoding:
  - each champion-role gets +1 (blue) or −1 (red);
  - each lane pair gets an unordered pair index with a ±1 sign;
  - the duo gets ±1.
  - This gives 174,250 columns and 17 non-zeros per game.
- LightGBM and EBM: 10 categorical slots.
- EBM interactions are given explicitly: the 5 lanes plus 2 duos.

**Caveats**
- The generator has exactly the logistic-regression structure, so the quality numbers must not be read as a ranking of model families. Only the times, memory and sizes are the point.
- Holdout AUC is about 0.60–0.61 and accuracy about 57–58%. That is the same magnitude as real draft-only models (LoLDraftAI reports 55.9% on real data, section 5).
- Scripts were run from the session scratchpad: `bench/train.py`, `node_train.mjs`, `node_infer.mjs`, `ebm_ref.py`, `m2c_test.py`.

#### Results and implications
- **Pure TypeScript/JS training is fast enough to run inside the existing hourly Node job** (local measurement). Hand-written logistic regression (Adagrad SGD, about 40 lines, no libraries) on 200k drafts × 174,250 sparse dimensions:
  - 3 epochs: 80 ms, holdout log loss 0.6751 and AUC 0.6079. This matches scikit-learn lbfgs on the same data (2.76 s, 0.67495 and 0.6080).
  - 10 epochs: 239 ms, and it overfits slightly (0.6781).
- **Factorization machine in plain JS** (k = 8, over side × role × champion one-hots, all 45 pairs): 163 ms for 3 epochs and 522 ms for 10 epochs (local measurement). It was untuned and scored worse on this synthetic truth (AUC 0.589), so FM quality needs real-data testing.
- **The training algorithm is not the hard part in TypeScript.** Regularization tuning, per-block penalties, deterministic seeds and evaluation are the work. TS has no maintained equivalent of scikit-learn's solvers or cross-validation tools. The young @liquidau/solvers package is the only candidate seen, and it is unvetted.
- **Per-block regularization** (for example, pair terms shrunk much harder than main terms):
  - In scikit-learn it can be emulated by scaling columns: scaling a column by k is equivalent to dividing its L2 penalty by k².
  - glum supports it directly through a per-coefficient P2.
  - A hand-written TS trainer can apply a separate λ per block.
- **EBM, GBDT, PyMC/NumPyro hierarchical models and NNs have no credible JS trainer.** The JS options are 0.x WASM ports or YDF 0.0.x. These belong in a Python job whose output is a JSON artifact the TypeScript engine evaluates.
- **m2cgen is not a good path** (local measurement, m2cgen 0.10.0 with LightGBM 4.7.0):
  - A raw `lightgbm.Booster` fails with "Model 'lightgbm_Booster' is not supported". Only the scikit-learn wrapper `LGBMClassifier` works.
  - A model with categorical splits fails ("ValueError: could not convert string to float: '14||27||35||…'").
  - With one-hot numeric inputs (1,700 columns, 100 trees × 31 leaves), export takes 0.24 s and gives a 1.0 MB JS function (60 KB gzip). It matches Python raw scores to 5.6e-16 and scores 170 rows in 238 µs in Node.
  - Taken together, evaluating `dump_model()` JSON with a small TypeScript tree walker is safer than generated code from an unmaintained tool.

### Gaps
- I did not verify whether ONNX Runtime's on-device training APIs still ship or work in Node in 1.30 or 1.31.
- The @wlearn and @knockdata WASM ports were not tested (correctness, size, threading).
- I did not verify whether tfjs-node still downloads native libtensorflow at install time (its npm tarball is only about 2 MB unpacked).
- No real-data training run was made. Real pools (about 60–120 champions per slot) and more pair terms will change the times and sizes.

## 2. Inference in Electron and Node: onnxruntime-node vs onnxruntime-web (WASM) vs plain JSON tables in TypeScript

### Takeaway
For a pure, offline engine that scores about 170 candidates per draft update, plain tables evaluated in TypeScript cost microseconds and add almost nothing to the installer. ONNX Runtime costs far more on every axis:
- **Speed** (local measurement): typed-array tables take 3.7 µs per update and EBM JSON 65 µs. onnxruntime-node takes 0.9 ms per update and the WASM runtime 2.6 ms per update.
- **Session creation:** onnxruntime-node needs 138 ms and onnxruntime-web 211 ms.
- **Installer size:**
  - The Windows x64 native ONNX Runtime binaries are about 67 MB raw (about 29 MB gzip), including the DirectML and DX compiler DLLs.
  - The CPU WASM binary is 14.2 MB raw (3.7 MB gzip).

ONNX Runtime only pays off for models that cannot be flattened into tables, such as neural nets or deep tree ensembles.

### Cited Findings
- **onnxruntime-node 1.30.0 (npm latest on 2026-10-17, published 2026-09-14):**
  - Unpacked size 301,068,136 bytes in 43 files, MIT. These are prebuilt binaries for every OS and architecture.
  - The GitHub release v1.31.0 is dated 09 Oct (PyPI onnxruntime 1.31.0 uploaded 2026-10-09). On that day npm still served 1.30.0.
  - Sources: [npm onnxruntime-node](https://www.npmjs.com/package/onnxruntime-node); [onnxruntime releases](https://github.com/microsoft/onnxruntime/releases); [PyPI onnxruntime](https://pypi.org/project/onnxruntime/)
- **onnxruntime-node files for win32-x64** (sizes measured from the installed 1.30.0 package):

  | File | Size (MB) |
  | --- | --- |
  | `onnxruntime.dll` | 28.75 |
  | `DirectML.dll` | 18.53 |
  | `dxcompiler.dll` | 17.99 |
  | `dxil.dll` | 1.51 |
  | `onnxruntime_binding.node` | 0.30 |

  The binaries sit under `bin/napi-v6/…`, and package.json declares `napi_versions: [6]`. — [npm onnxruntime-node (code tab)](https://www.npmjs.com/package/onnxruntime-node?activeTab=code)
- **onnxruntime-node README (1.30.0):**
  - "ONNXRuntime works on Node.js v16.x+ (recommend v20.x+) or Electron v15.x+ (recommend v28.x+)."
  - "The Windows version supports WebGPU execution provider and DML execution provider."
  - The CUDA EP binaries (Linux x64) "are installed automatically when you install the package", unless you pass `--onnxruntime-node-install=skip`.
  - The package has a `postinstall` script.
  - Source: [npm onnxruntime-node](https://www.npmjs.com/package/onnxruntime-node)
- The ORT JS docs list CPU prebuilt binaries for Windows, Linux and macOS (x64 and arm64), DirectML on Windows only and CUDA on Linux x64 only. — [ORT Node.js docs](https://onnxruntime.ai/docs/get-started/with-javascript/node.html)
- **onnxruntime-web 1.30.0:**
  - Unpacked size 144,618,540 bytes in 509 files.
  - The `dist` folder holds `ort-wasm-simd-threaded.wasm` (14.24 MB), `.jsep.wasm` (28.31 MB, WebGPU/JSEP), `.asyncify.wasm` (26.78 MB) and `.jspi.wasm` (16.76 MB). Sizes were measured from the installed package.
  - Source: [npm onnxruntime-web](https://www.npmjs.com/package/onnxruntime-web)
- Downloads over 2026-09-13..10-12: onnxruntime-node 28,256,054 and onnxruntime-web 24,174,462. Both are mainstream and maintained. — [npm downloads API](https://api.npmjs.org/downloads/point/last-month/onnxruntime-node)
- **ORT Web environment flags:**
  - `env.wasm.numThreads` defaults to 0, meaning automatic. "Only when the browser supports WebAssembly multi-threading and `crossOriginIsolated` mode is enabled, multi-threading will be enabled."
  - "Setting it to `1` will force disable multi-threading."
  - The proxy worker "cannot work in a Content Security Policy (CSP) restricted environment."
  - Source: [ORT web env flags](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)
- **Native modules in Electron:**
  - Node-API is "Application Binary Interface (ABI) stable across versions of Node.js… allow[s] modules compiled for one major version to run on later major versions of Node.js without recompilation." — [Node-API docs](https://nodejs.org/api/n-api.html)
  - Electron's docs say Electron has "a different application binary interface (ABI) from a given Node.js binary". Native modules "will need to be recompiled for Electron" with @electron/rebuild. That page does not discuss Node-API modules. — [Electron native modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
  - In packaged apps, native `.node` and `.dll` files must sit outside `app.asar`. Electron Forge's auto-unpack-natives plugin "will automatically add all native Node modules… to the asar.unpack config". electron-builder's docs, as quoted in a sharp issue thread, say modules that must be unpacked are detected automatically. Both are snippets. — [Forge auto-unpack-natives](https://www.electronforge.io/config/plugins/auto-unpack-natives); [sharp issue thread](https://github.com/lovell/sharp/issues/3985)
- LoLDraftAI runs ONNX inference on the server, not on the client: "The model inference is done from an Azure docker container instance… converted to onnx format… runs fast even on cpu inference". Its web front end calls `/api/predict` and `/api/champion-suggestions` routes. — [LoLDraftAI ML README](https://github.com/Looyyd/loldraftai-monorepo-public/blob/HEAD/apps/machine-learning/README.md); [repo tree](https://github.com/Looyyd/loldraftai-monorepo-public)

### Inferences
- **Latency per draft update, 170 candidates** (local measurement, Node 24.14, one process):

  | Method | What was scored | Steady-state time per update | Cold cost | Agreement with Python |
  | --- | --- | --- | --- | --- |
  | Typed-array tables | 10 terms per candidate (champion-role, 5 matchups, 4 synergies) plus sorting the reasons of the best candidate | 3.7 µs (1.7 MB of tables) | – | – |
  | EBM evaluated from its `to_json` export (simple Map and nested-array lookups) | 170 rows | 65 µs | JSON load 1.8 ms | probabilities within 1.1e-16; per-term contributions equal to `eval_terms` exactly |
  | onnxruntime-node, CPU EP (2.26 MB LightGBM ONNX, 138 trees, batch 170 × 10) | batch of 170 | median 0.91 ms; first run 1.7 ms | require 18 ms; session creation 138 ms | max diff 5.3e-8 (float32) |
  | onnxruntime-web WASM in Node, 1 thread | batch of 170 | median 2.6 ms; first run 23.8 ms | import 6.5 ms; session creation 211 ms | max diff 9.8e-8 |

  onnxmltools wrote a fixed output shape `{1}` for `label`, so ORT printed a shape warning on every run of a 170 batch. Fixing the graph's output dimensions is part of the export work.
- Every option is far below a 16 ms frame at steady state. The real costs are cold-start and size. The project's measured cold start is 426 ms (v0.7.9, CLAUDE.md), so an ORT session created on the start-up path would add about a third to half of it. Creating the session lazily, or after first paint, would hide most of that.
- **Installer impact** (local measurement of gzip -9 and brotli-11, used as stand-ins for NSIS compression):
  - onnxruntime-node for Windows x64: about 67 MB raw → about 29 MB gzip / 23 MB brotli. Of the compressed size:
    - `onnxruntime.dll`: about 10.6 MB gzip;
    - `DirectML.dll`, `dxcompiler.dll` and `dxil.dll`: about 18 MB gzip.
  - The CPU-only WASM: 14.2 MB raw → 3.7 MB gzip / 2.4 MB brotli.
  - Model artifacts are small:
    - EBM JSON (17 terms): 0.48 MB → 0.12 MB gzip;
    - LightGBM ONNX (138 trees): 2.26 MB → 0.14 MB gzip;
    - m2cgen JS (100 trees): 1.0 MB → 0.06 MB gzip.
  - Whether the DirectML and DX compiler DLLs can be dropped for a CPU-only app was not verified.
- **Architecture fit.** The project rule is that `packages/engine` is pure (no network, no filesystem) and that outside services sit behind adapters.
  - JSON tables keep the engine a pure function of (snapshot, draft).
  - An ONNX model would need a native or WASM runtime handle and asynchronous `session.run`. That handle would have to sit behind an adapter in the main process, and the engine would no longer be synchronous and pure.
  - The panel's engine already runs in the Electron main process (CLAUDE.md). That removes the browser-only constraints (crossOriginIsolated, CSP) if WASM were used, but not the size and cold-start costs.
- **What can be tables.** A trained model that can be flattened into tables needs no runtime: logistic regression with pairwise terms, FM (store embeddings or precomputed pair scores), EBM/GA2M, or a GAM. Only GBDT and NNs need a tree walker or ORT. GBDT needs one only if the trees are deep or numerous. A TypeScript walker over `dump_model()` JSON avoids ORT entirely.

### Gaps
- Not measured inside a packaged Electron app (asar unpacking, main process vs utility process, memory overhead of ORT).
- The real NSIS/7z installer size delta was not measured.
- An EBM converted with ebm2onnx was not benchmarked in ORT.
- The process RSS after loading both ORT runtimes (167 MB) was not isolated per runtime.

## 3. Explainable trained models: exporting GAM/GA2M/EBM, additive attributions, and keeping "each reason is a real number"

### Takeaway
EBM (InterpretML's GA2M) is the mainstream trained model whose exported form is literally per-term lookup tables. The model is an intercept plus one score per champion slot plus one score per chosen pair cell. Its JSON export can also carry per-cell sample weights and standard deviations.

In a local test, a 30-line JavaScript evaluator reproduced Python's probabilities to within 1e-16 and the per-term contributions exactly. Each shown reason can therefore be a model term with its training weight and uncertainty.

Other model families:
- **Logistic regression and FM:** give exact additive log-odds attributions per coefficient or per pair.
- **GBDT:** needs TreeSHAP. No JavaScript TreeSHAP package was found.
- **Neural nets** (LoLDraftAI): explain by counterfactual ablation ("Impact").

### Cited Findings
- **EBM predictions are table lookups:**
  - "score contributions from individual features and interactions are added together to make a prediction. Each individual score contribution is determined using a lookup table." — [EBM internals: regression](https://interpret.ml/docs/ebm-internals-regression.html) ([notebook](https://github.com/interpretml/interpret/blob/develop/docs/interpret/ebm-internals-regression.ipynb))
  - "the values stored in ebm.term_scores_ are identical to the values shown in the global explanation graphs… This full model transparency is what makes EBMs a glassbox model." — [EBM internals: regression](https://interpret.ml/docs/ebm-internals-regression.html)
- **Binning rules:**
  - Categorical features use "a dictionary that maps the category strings to bin indexes".
  - Index 0 is reserved for missing values and the last index for unseen values.
  - Continuous values are binned with cut points (`np.digitize(feature_val, bins) + 1`). A value equal to a cut point goes into the upper bin.
  - Source: [EBM internals: regression](https://interpret.ml/docs/ebm-internals-regression.html)
- **Pair terms and the logit:**
  - A pair term is a 2-D table indexed `term_scores_[t][(bin_i, bin_j)]`.
  - Pairs may use a lower-resolution binning, `bins_[f][1]` instead of `bins_[f][0]`.
  - The logit is converted with "1 / (1 + np.exp(-logits))".
  - Source: [EBM internals: binary classification](https://interpret.ml/docs/ebm-internals-classification.html) ([notebook](https://github.com/interpretml/interpret/blob/develop/docs/interpret/ebm-internals-classification.ipynb))
- **EBM API in interpret 0.7.8:**
  - `to_json(file, detail='all', indent=2)` and `to_jsonable(detail=…)`, with detail levels `'minimal'`, `'interpretable'`, `'mergeable'` and `'all'`.
  - `eval_terms(X)` "Returns per-term scores for each sample, identical to the local explanation values".
  - Post-fit editing: `monotonize`, `remove_terms`, `scale`, `sweep`.
  - Fitted attributes include `bin_weights_` ("Per-term total sample weights in each term's bins"), `standard_deviations_` ("Per-term standard deviations of the bagged scores") and `bagged_scores_`.
  - Source: [ExplainableBoostingClassifier API](https://interpret.ml/docs/python/api/ExplainableBoostingClassifier.html)
- **EBM defaults** (same page): `interactions='3x'`, `max_bins=1024`, `max_interaction_bins=64`, `outer_bags=14`, `inner_bags=0`, `learning_rate=0.015`, `max_rounds=50000`, `early_stopping_rounds=100`, `n_jobs=-2` (all threads but one). — [ExplainableBoostingClassifier API](https://interpret.ml/docs/python/api/ExplainableBoostingClassifier.html)
- ebm2onnx converts EBMs to ONNX (3.3.1, Dec 2025). This is an alternative to JSON, but not needed when evaluating in TypeScript. — [PyPI ebm2onnx](https://pypi.org/project/ebm2onnx/)
- **SHAP for linear models:** for independent features, interventional SHAP values are "coef[i] * (x[i] - X.mean(0)[i])". For sparse input, "only interventional option is supported." — [shap LinearExplainer](https://shap.readthedocs.io/en/latest/generated/shap.LinearExplainer.html)
- **LightGBM contributions:** `predict(..., pred_contrib=True)` returns "a matrix with an extra column, where the last column is the expected value". SHAP interaction values need the shap package. — [LightGBM Booster docs](https://lightgbm.readthedocs.io/en/latest/pythonapi/lightgbm.Booster.html)
- **Factorization machines:**
  - An FM represents each pair weight as an inner product of latent vectors. It can estimate interactions "between features which appear together very infrequently".
  - The pairwise sum can be rearranged from O(kd²) to O(kd).
  - Rendle, ICDM 2010, DOI 10.1109/ICDM.2010.127.
  - Sources (snippet): [d2l.ai FM chapter](https://d2l.ai/chapter_recommender-systems/fm.html); [Rendle 2010 record](https://kops.uni-konstanz.de/entities/publication/e48fe3cf-8ca6-429c-959b-3b97fb5c3785)
- **How the products explain:**
  - LoLDraftAI's "Impact" is "a calculated metric, not a model output": the win-rate difference between the final draft with a champion and the same draft with an "average" replacement at that role. Suggestions score the draft with each candidate and rank by win rate. — [LoLDraftAI explained](https://loldraftai.com/blog/loldraftai-explained)
  - DraftGap is an explicit additive model:
    - It converts win rates to Elo ratings (`-400 * log10(1/w - 1)`).
    - It sums ally champion, ally duo and matchup ratings and subtracts the enemy champion and duo ratings.
    - Each champion result and each duo result keeps its own `rating`, `wins` and `games`. Matchups have their own result type, whose fields were not read.
    - Source: [draftgap ratings.ts](https://github.com/vigovlugt/draftgap/blob/main/packages/core/src/rating/ratings.ts); [draftgap analysis.ts](https://github.com/vigovlugt/draftgap/blob/main/packages/core/src/draft/analysis.ts)
- **LoLDraftAI calibration** (Sep 4, 2025): predicted 50–52% → observed 0.5136 on 1,206,459 games; 60–62% → 0.6174 on 367,006 games; 70–72% → 0.7254 on 20,691 games. "the model rarely predicts above 60% for a team." — [LoLDraftAI explained](https://loldraftai.com/blog/loldraftai-explained)

### Inferences
**Local checks of EBM export**
- Evaluating EBM JSON in JS is exact (local measurement). A 17-term EBM (10 nominal champion slots + 5 lane pairs + 2 duo pairs, 50k drafts) was exported with `to_json(detail="minimal")`. The JSON is `{version, ebm: {outputs, intercept, features[{name, type, categories}], terms[{term_features, scores}]}}`, 0.48 MB. A plain JS evaluator then:
  - matched `predict_proba` on 170 drafts to within 1.1e-16;
  - matched `eval_terms` per term exactly.
- What each JSON detail level contains (local check, interpret 0.7.8):

  | Detail level | Term fields | Size (20k-row model, 4 bags) |
  | --- | --- | --- |
  | `minimal` | `term_features`, `scores` | 219 KB |
  | `interpretable` | adds `standard_deviations`, `bin_weights` | 481 KB |
  | `mergeable` / `all` | adds `bagged_scores` | 1.06 MB |

  With the default 14 bags, `all` reached 8.1 MB against 0.48 MB minimal. The "interpretable" level carries what a reason needs: the score of the cell, its weight ("1,240 games" if unweighted), and an uncertainty usable for confidence labels.
- Nominal champion features keep full resolution in pair tables (local check). A 120-category slot gave 120 main categories and a 122 × 122 pair table, both with the default `max_interaction_bins=64` and with 256. Nominal features had only one bin level, so matchup cells are not merged.

**Mapping to the current engine**
- A GA2M with terms (champion × role, lane matchup, duo/synergy pairs) has the same shape as the current additive Elo/log-odds engine. Moving from hand-set weights to EBM-fitted tables could keep the UI's "per-factor reason with a number" contract unchanged.
- Caveats:
  - With time-decay sample weights, `bin_weights_` become "effective games". Raw counts for display would need a separate count table, which the snapshot already has.
  - EBM learns blue-slot and red-slot tables separately. A side-agnostic model would need mirrored training rows (swap the teams and flip the label) or averaging. EBM has no documented way to tie parameters between features.
- Turning log-odds contributions into "+x % win rate" needs a stated baseline, because they do not add in probability space. Two options:
  - σ(z) − σ(z − c_i): the change from removing the term;
  - σ(b + c_i) − σ(b) from a 50% baseline.
  DraftGap faces the same issue with Elo ratings, and LoLDraftAI with ablation deltas.

**Other model families**
- Logistic regression with pair features: with the ±1 antisymmetric encoding, each active coefficient is directly the reason (champion strength, matchup, duo), in log-odds. SHAP adds only mean-centering, which a reference draft handles.
- FM: per-pair contributions ⟨v_i, v_j⟩ are exact numbers, and there are only 45 pairs for 10 picks. FM gives smoothed estimates for rare pairs, but the reason for a rare pair then reflects learned similarity, not observed games. The UI should then show the games count from the snapshot to stay honest.
- GBDT and NN: explanation needs either TreeSHAP in TypeScript (an `npm search treeshap` on 2026-10-17 returned nothing; "shap" packages are only visualization libraries, e.g. shapjs 0.35.3 from 2020) or LoLDraftAI-style ablation. Ablation costs about one extra model evaluation per term or champion. Both produce "real numbers", but no longer ones tied to a count of games.

### Gaps
- No public write-up was found on how op.gg, u.gg or Mobalytics explain draft suggestions.
- InterpretML has no documented JSON *import* (from_json) for round trips in Python. Not verified either way.
- No literature was fetched on attribution conventions for FMs (for example, how to split pair contributions).

## 4. Drift: retraining cadence, time-decay weights, patch as a feature, warm starts, and how draft tools handle new patches

### Takeaway
No published standard cadence exists. The two open draft tools take complementary approaches:
- **LoLDraftAI:**
  - Patch is a model input: patch embeddings plus a deliberately small champion-patch embedding.
  - It trains on the last 52 patches and merges thin patches into the previous one.
  - A new patch's embedding is warm-started from the previous patch's, and a "next patch" holdout tests generalization.
  - The model is updated "every few days", with "a few days delay after new patches".
- **DraftGap:**
  - Rebuilds its data daily.
  - Shrinks current-patch champion win rates toward the 30-day rate, with 250–3,000 prior games set by a user risk level.
  - Uses only 30-day data for matchups and duos.

The best evidence on window length is a 2022 pro-play experiment: the best model used 21 patches (about 10.5 months).

### Cited Findings
- **LoLDraftAI training setup** (public monorepo, state as of May 2025):
  - `NUM_RECENT_PATCHES = 52  # Number of most recent patches to use for training`.
  - `PATCH_MIN_GAMES = 10_000  # Minimum number of games in a patch to be considered standalone(otherwise merged with previous patch)`. The function's docstring says "<200k games", which is inconsistent with the constant.
  - With `next_patch_test`, "The 2 most recent patches will be mapped to the same value as the 3rd most recent patch… This allows testing how well the model generalizes to future patches."
  - Source: [prepare_data.py](https://github.com/Looyyd/loldraftai-monorepo-public/blob/HEAD/apps/machine-learning/scripts/match-prediction/prepare_data.py)
- **LoLDraftAI model inputs and capacity:**
  - "Patch embeddings (meta changes across patches)".
  - "Champion-patch embeddings… small in dimension because could overfit easily".
  - Other regularizers, such as making "adjacent patches… close in embedding space", were removed: "With a lot of training data (in the tens of millions) they are not beneficial, however with less data they did bring slight improvements."
  - Source: [LoLDraftAI ML README](https://github.com/Looyyd/loldraftai-monorepo-public/blob/HEAD/apps/machine-learning/README.md)
- **LoLDraftAI warm start:**
  - `adapt_model.py` "adapts the model for a new patch, by either sliding the embeddings… or by adding new patch embeddings". The newest patch embedding is "initialized with" the previous one.
  - Continued training uses `learning_rate = 4e-4  # Lower LR for continued training`, against 8e-4 with a one-cycle schedule from scratch. The config also sets `num_epochs = 50`, `weight_decay = 0.05`, `patch_embed_dim = 64`.
  - Sources: [adapt_model.py](https://github.com/Looyyd/loldraftai-monorepo-public/blob/HEAD/apps/machine-learning/scripts/match-prediction/adapt_model.py); [config.py](https://github.com/Looyyd/loldraftai-monorepo-public/blob/HEAD/apps/machine-learning/utils/match_prediction/config.py)
- **LoLDraftAI site statements:**
  - Patch is a model input. The model is updated "every few days" because full training is needed.
  - "Expect a few days delay after new patches."
  - "Early patch data may be combined with the previous patch data for better predictions."
  - "Last model update: October 10 on patch 16.20."
  - Sources: [LoLDraftAI explained](https://loldraftai.com/blog/loldraftai-explained); [LoLDraftAI blog index](https://loldraftai.com/blog)
- An April 2025 article reports LoLDraftAI training on about 10 million matches from "the last three patches", Emerald+ (snippet). This conflicts with the 52-patch window in the May 2025 code; they may describe different times. — [mein-mmo.de](https://mein-mmo.de/lol-neue-ki-sagt-match-vorraus-bevor-es-beginnt/)
- **DraftGap's data pipeline:**
  - A GitHub Actions workflow "Update dataset" runs on `cron: "0 12 * * *"` (daily) and uploads to S3 using repository secrets.
  - The dataset app pulls champion data from Lolalytics and static data from Riot's Data Dragon.
  - It builds a `current-patch` dataset and a `30-days` dataset, and calls `deleteDatasetMatchupSynergyData(datasetCurrentPatch)` before storing. So matchup and synergy data come only from the 30-day window.
  - Sources: [dataset.yml](https://github.com/vigovlugt/draftgap/blob/main/.github/workflows/dataset.yml); [apps/dataset/src/index.ts](https://github.com/vigovlugt/draftgap/blob/main/apps/dataset/src/index.ts)
- **DraftGap's shrinkage:**
  - Champion stats for the current patch are combined with a prior of `{ wins: priorGames * fullChampionRoleWinrate, games: priorGames }` taken from the 30-day data.
  - `priorGamesByRiskLevel`: very-low 3000, low 2000, medium 1000, high 500, very-high 250.
  - Duo terms are measured relative to the additive expectation of the two champions (`rating = actualRating - expectedRating`), with the same prior.
  - Sources: [analysis.ts](https://github.com/vigovlugt/draftgap/blob/main/packages/core/src/draft/analysis.ts); [risk-level.ts](https://github.com/vigovlugt/draftgap/blob/main/packages/core/src/risk/risk-level.ts)
- **Bayes Esports experiment (iGB, 30 June 2022, pro play, map winner):**
  - Data was sliced into two-week patch windows; models were trained on more and more patches and tested on the most recent matches, with Brier score.
  - "The most accurate model was trained on 5,000 games from 21 patches (about 10.5 months)." Training only on the last 12 patches was "too small".
  - Minimum sample about 3,000 games; optimal window "between 6 and 12 months worth of patches".
  - A Brier difference of "at least 0.005" was treated as significant. Models trained on fewer patches favoured the red side.
  - Source: [How much LoL data is enough data?](https://igamingbusiness.com/esports/how-much-league-of-legends-data-is-enough-data/)
- **Academic sources:**
  - Chitayat, Block, Walker and Drachen (arXiv 2305.18477, 2023): frequent parameter changes give esport analytics models "a short lifespan", a problem the literature largely ignores. Their patch-notes-based character representation kept a Dota 2 kills model (85% AUC) accurate across two later versions. — [arXiv 2305.18477](https://arxiv.org/abs/2305.18477)
  - Gama et al., "A Survey on Concept Drift Adaptation", ACM Computing Surveys 46(4), 2014, DOI 10.1145/2523813. It defines concept drift as a change over time in the relation between inputs and target (abstract only read). — [survey record](https://research.tue.nl/en/publications/a-survey-on-concept-drift-adaptation/)
- **Warm-start primitives in the libraries:**
  - LightGBM `train(..., init_model=…)` is the "model… used for continue training". `Booster.refit(data, label, decay_rate=0.9, …)` refits leaf values with "leaf_output = decay_rate * old_leaf_output + (1.0 - decay_rate) * new_leaf_output". — [lightgbm.train](https://lightgbm.readthedocs.io/en/latest/pythonapi/lightgbm.train.html); [Booster.refit](https://lightgbm.readthedocs.io/en/latest/pythonapi/lightgbm.Booster.html)
  - EBM: `fit(X, y, sample_weight=None, bags=None, init_score=None)` (signature checked in 0.7.8). `merge_ebms(models)` "Merges EBM models trained on similar datasets that have the same set of features", giving "averaged mean and standard deviation". — [merge_ebms](https://interpret.ml/docs/python/api/merge_ebms.html); [EBM API](https://interpret.ml/docs/python/api/ExplainableBoostingClassifier.html)
- iTero (pro-focused) evaluates with a time split: to predict games from a given date, it trains only on earlier games (article dated Jan 26, 2022). — [iTero draft model](https://itero.gg/articles/the-draft-model)

### Inferences
**How many games before a number can be trusted.** The binomial standard error of a win rate is about 0.5/√n:

| Games | Standard error |
| --- | --- |
| 250 | ±3.2 pp |
| 1,000 | ±1.6 pp |
| 2,500 | ±1.0 pp |
| 10,000 | ±0.5 pp |

- Claiming a 2 pp matchup effect at about 2 SE needs roughly 2,500 games in that cell.
- With about 50k games per band per window, champion-role main effects stabilize within days of a patch.
- Most lane-matchup cells stay thin for a whole patch. That is why DraftGap takes pairs only from 30 days, and why FMs or shrinkage are needed for pairs.

**Patch-aware training in a linear or GA2M model.** The equivalent of LoLDraftAI's approach is:
- multi-patch data with time-decay sample weights (a half-life of about 1–2 patches, matching the existing half-life aggregation in `config/meta.v1.json`);
- plus current-patch offset terms (champion × current patch) with strong L2 toward 0.

Ridge regularization is the MAP estimate under a Gaussian prior, so this is the hierarchical shrinkage that DraftGap does with pseudo-counts. LoLDraftAI's "small champion-patch embedding" is the neural-net counterpart.

**Cadence.** A cheap, defensible cadence for this product:
- keep hourly counts as today;
- refit model weights daily, and right after a patch once a minimum number of games is reached, warm-starting from the previous fit (LightGBM `init_model`/`refit`, EBM `init_score` from the previous model's logits, or the previous coefficients for logistic regression);
- choose the half-life and prior strength with a next-patch holdout (LoLDraftAI's protocol) rather than by hand.

**Warm starts.** For logistic regression and FM, warm-starting from the previous coefficients is trivial in a TypeScript trainer and stabilizes the champion terms across refits.

### Gaps
- No public methodology was found for how op.gg, u.gg or lolalytics handle new patches: windows, minimum games, blending. One search returned only general guides.
- I found no study that measures how fast a solo-queue draft-model degrades across patches, or the optimal half-life for solo queue (the Bayes Esports result is pro play with 5k games).
- The Gama et al. survey's sections on forgetting and instance weighting were not read; only the abstract.

## 5. Reproducible evaluation without heavy MLOps

### Takeaway
The heavy tools are alive: DVC came under lakeFS in Nov 2025 and is at 3.67.1, and MLflow is at 3.17.1. A solo developer gets the essentials more cheaply with four pieces:
- content-hashed dataset snapshots;
- a JSON experiment log in git;
- a model card per published model;
- a CI gate on log loss, Brier and ECE with tolerances derived from bootstrap confidence intervals.

LoLDraftAI's public comparison is a good template for the protocol. It froze both tools, evaluated on 32,750 matches played after the cutoff, reported log loss, accuracy, Brier and ECE with 95% bootstrap CIs, and adjusted for side and elo bucket.

### Cited Findings
- **DVC under lakeFS:**
  - lakeFS acquired the DVC open-source project from Iterative.ai (announced Nov 18, 2025). It "will now take over stewardship and active development of DVC". DVC continues "as an independent open source tool focused on data scientists working with smaller datasets".
  - The repo now lives at treeverse/dvc (pushed 2026-10-12). The latest PyPI release is 3.67.1 (2026-03-31).
  - Sources: [lakeFS acquires DVC](https://lakefs.io/blog/lakefs-acquires-dvc/); [DVC FAQ post](https://dvc.org/blog/dvc-joins-lakefs-your-questions-answered/); [GitHub API treeverse/dvc](https://api.github.com/repos/treeverse/dvc); [PyPI dvc](https://pypi.org/project/dvc/)
- **What `dvc.lock` records:**
  - Dependencies and outputs, with "a content hash field (`md5`, `etag`, or `checksum`)", and parameter "key and value".
  - This lets DVC "detect when stage definitions, or their dependencies have changed", which "invalidate[s] stages, requiring their reproduction".
  - This is the pattern to copy without adopting DVC. — [dvc.yaml / dvc.lock docs](https://doc.dvc.org/user-guide/project-structure/dvcyaml-files)
- MLflow 3.17.1 (2026-10-13). Its repo now describes it as "The open source AI engineering platform for agents, LLMs, and ML models". — [PyPI mlflow](https://pypi.org/project/mlflow/); [GitHub API mlflow/mlflow](https://api.github.com/repos/mlflow/mlflow)
- **Model cards** (Mitchell et al., arXiv 1810.03993, 2018/2019) are "short documents accompanying trained machine learning models". They include:
  - benchmarked evaluation across conditions and groups;
  - intended use contexts;
  - details of the performance evaluation procedures.
  - Source: [Model Cards for Model Reporting](https://arxiv.org/abs/1810.03993)
- **LoLDraftAI vs DraftGap evaluation protocol** (self-reported by LoLDraftAI, Apr 19, 2026):
  - DraftGap was frozen at its `current-patch.json` dated 2026-04-18 12:57 UTC. LoLDraftAI's training data ended 2026-04-17 23:25 UTC.
  - The test set was 32,750 ranked solo/duo matches after both cutoffs: Emerald+, EUW1 and KR.
  - Matches with any (champion, role) cell under 50 games in DraftGap's data were excluded. LoLDraftAI was run side-agnostic and with a single elo bucket.
  - 95% bootstrap CIs were computed by resampling matches.
  - Results:

    | Model | Log loss | Accuracy | Brier | ECE |
    | --- | --- | --- | --- | --- |
    | DraftGap | 0.6869 (0.6851–0.6887) | 54.66% | 0.2469 | 0.0199 |
    | LoLDraftAI | 0.6829 (0.6811–0.6846) | 55.88% | 0.2449 | 0.0088 |

  - The authors published the evaluation data and DraftGap snapshots for re-checking.
  - Source: [DraftGap vs LoLDraftAI](https://loldraftai.com/blog/draftgap-vs-loldraftai-comparison)
- LoLDraftAI hosts its training logs on Weights & Biases and reports bucketed calibration. — [LoLDraftAI explained](https://loldraftai.com/blog/loldraftai-explained)
- **Hosting model artifacts on GitHub Releases:** "Each file included in a release must be under 2 GiB"; up to 1,000 assets per release; "no limit on the total size of a release, nor bandwidth usage". — [About releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- **GitHub Actions schedules:**
  - Scheduled workflows run at most every 5 minutes. They "can be delayed during periods of high loads… High load times include the start of every hour", and "some queued jobs may be dropped".
  - "In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days."
  - Source: [Events that trigger workflows](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows)

### Inferences
- **A lightweight recipe that fits this repo.**
  1. **Dataset snapshot.** A deterministic SQL export (sorted, fixed columns: patch, band, 10 champion ids, side, outcome, no PUUIDs) written as gzipped NDJSON or Parquet. Name it by its sha256 and store it in R2 (free egress, section 6). A manifest JSON records `{sha256, rows, patches, bands, query hash, collector version}`.
  2. **Experiment log.** Each run appends one JSON line to `research/experiments/*.jsonl` in git with: code commit, data sha256, config hash, seed, metrics with bootstrap CIs, next-patch metrics and calibration buckets.
  3. **Model card.** Each published model carries a JSON or Markdown card covering: data window, bands, metrics by band and patch age, intended use, known limits (side blindness, blind-pick bias, thin cells).
  4. **CI gate.** CI re-scores the candidate and production models on a frozen holdout snapshot. It fails if log loss worsens beyond the CI half-width or ECE exceeds a threshold. This mirrors the repo's existing `pnpm perf:guard` budgets and `pnpm --filter @ldc/server backtest`.
- **Tolerances can be grounded in published numbers.** At about 33k test games, LoLDraftAI's 95% CI half-width is about ±0.0018 log loss and ±0.54 pp accuracy. Differences smaller than about 0.002 log loss are not detectable at that size. Bayes Esports used a Brier difference of 0.005 as its significance bar on smaller pro data.
- **Holdout design should copy the published protocols:**
  - a time split (iTero) or next-patch split (LoLDraftAI), never a random split, because random splits leak the patch meta;
  - side-agnostic scoring if the product is side-agnostic;
  - exclusion or flagging of thin cells.

### Gaps
- No LoL- or esports-specific write-up of lightweight MLOps (snapshots, model cards, CI) was found beyond these tool blogs.
- MLflow's local file-store mode and DVC's no-remote mode were not examined in detail.

## 6. Cost and resources: CPU, memory, installer size and money (Railway vs developer PC vs GitHub Actions)

### Takeaway
Money is not the constraint for any candidate model at 50k–500k drafts: one training run costs fractions of a cent on Railway, and GitHub Actions is free for public repos. The constraints are memory peaks, adding a Python runtime to the Railway image, and installer size:
- **Logistic regression and LightGBM** train in seconds and under 0.5 GB.
- **EBM** with default parallelism peaks at 2.7–3.5 GB. With `n_jobs=2` it needs about 0.75 GB and 39 s for 200k drafts.
- **Pure-JS logistic regression or FM** trains in under 0.6 s inside the existing Node job.

A sensible split: train logistic regression or FM in Node inside the hourly job, and run EBM/GBDT/Bayes on GitHub Actions or the developer PC. Either way, publish a versioned JSON artifact.

### Cited Findings
- **Railway pricing:**
  - Hobby is $5/month with $5 of usage included; unused credit does not carry over.
  - vCPU costs $0.00000772 per vCPU-second (about $20 per vCPU-month). Memory costs $0.00000386 per GB-second (about $10 per GB-month).
  - Volumes cost about $0.15 per GB-month, and egress $0.05 per GB.
  - Sources: [Railway pricing](https://railway.com/pricing); [Railway plans](https://docs.railway.com/reference/pricing/plans)
- **Railway plan limits:** the per-service maximums ("including replica multiplication") are 48 GB RAM and 48 vCPU on Hobby, with 6 replicas listed. That suggests about 8 vCPU / 8 GB per replica; this is my inference, not stated. The default volume is 5 GB on Hobby. — [Railway plans](https://docs.railway.com/reference/pricing/plans)
- **GitHub-hosted runners:**
  - On public repos, `ubuntu-latest` and `windows-latest` have 4 CPUs, 16 GB RAM and a 14 GB SSD. On private repos they have 2 CPUs and 8 GB.
  - "Use of the standard GitHub-hosted runners is free and unlimited on public repositories."
  - Source: [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- **GitHub Actions limits:**
  - A job can run for up to 6 hours, and a workflow run up to 35 days.
  - The Free plan allows 20 concurrent jobs. For private use it includes 2,000 minutes a month, 500 MB of artifact storage and 10 GB of cache per repo.
  - Source: [Actions limits](https://docs.github.com/en/actions/reference/limits)
- **Cloudflare R2:** $0.015/GB-month. The free tier includes 10 GB-month, 1M Class A and 10M Class B operations. Egress is free. — [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- DraftGap's precedent: its daily data build runs free on `ubuntu-latest` in GitHub Actions and publishes to S3. — [dataset.yml](https://github.com/vigovlugt/draftgap/blob/main/.github/workflows/dataset.yml)
- LoLDraftAI's neural-net full training takes "a few hours" on "millions of games", and its repo has GPU serving scripts. — [LoLDraftAI explained](https://loldraftai.com/blog/loldraftai-explained); [repo tree](https://github.com/Looyyd/loldraftai-monorepo-public)

### Inferences
- **Training cost** (local measurement, 16-thread desktop). "Wall" is training time only. "Peak" is process plus child processes, including data and design matrix.

  | Model | 50k drafts | 200k drafts | 500k drafts | Peak memory |
  | --- | --- | --- | --- | --- |
  | scikit-learn LogisticRegression (lbfgs, single-threaded, 174k sparse columns, 17 non-zeros/row) | 2.0 s | 2.8 s | 4.4 s | 229 / 277 / 502 MB |
  | scikit-learn SGDClassifier (log loss) | 1.4 s | 2.3 s | 4.2 s | ≤ 502 MB |
  | LightGBM, 10 categorical slots, early stopping (80 / 138 / 232 rounds), 16 threads | 1.6 s | 3.1 s | 3.6 s | 170–246 MB |
  | LightGBM, same, 2 threads | 1.7 s | 3.9 s | 6.1 s | 170–244 MB |
  | LightGBM on the 174k-column sparse matrix, 16 threads | – | 5.9 s (53 CPU-s) | – | 437 MB |
  | EBM (10 nominal slots + 7 pairs), default `n_jobs=-2` (15 workers) | 8.1 s | 20.0 s | 56.5 s | 2.7 / 2.9 / 3.5 GB |
  | EBM, `n_jobs=2` | – | 39.1 s | – | 747 MB |
  | EBM, `n_jobs=1` | 15.0 s | – | – | 231 MB |
  | Pure-JS logistic regression (Adagrad, 3 epochs) | – | 80 ms (RSS about 66 MB) | – | – |
  | Pure-JS FM (k = 8, 3 epochs) | – | 163 ms | – | – |
- **Export sizes** (local measurement):

  | Artifact | Raw | gzip |
  | --- | --- | --- |
  | Logistic regression, non-zero coefficients as JSON | about 113 KB | – |
  | LightGBM `dump_model` JSON | 1.0 / 1.9 / 3.1 MB (50k / 200k / 500k) | – |
  | LightGBM ONNX | 2.26 MB | 0.14 MB |
  | EBM JSON, minimal (43 × 43 pair tables) | 0.48 MB | 0.12 MB |

  Real slots with about 120 champions would give 122 × 122 pair tables (14.9k cells each). With 20 pair terms that is about 300k numbers, roughly 3 MB raw and about 1 MB gzip per band at full precision. Rounding scores to 4–5 decimals would shrink it further.
- **Money per run on Railway** at the listed rates, assuming every allocated core is busy (an upper bound):
  - EBM, 500k drafts, default parallelism: about 15 vCPU × 56.5 s ≈ 848 vCPU-s ≈ $0.0065, plus 3.5 GB × 56.5 s ≈ 196 GB-s ≈ $0.0008 → about $0.007 per run. Run hourly, that is about $5/month, a real share of a $5–20 budget. Run daily, about $0.2/month.
  - EBM with `n_jobs=2`, 200k drafts: about $0.0007 per run (about $0.5/month hourly).
  - scikit-learn logistic regression, 500k drafts: about $0.00004 per run.
  - Pure-JS logistic regression: effectively $0.
  - The money risk is therefore EBM retrained hourly with full parallelism. The operational risk is the 2.7–3.5 GB memory spike on a service sized for the collector (out-of-memory). EBM inside Railway needs `n_jobs` capped at 1–2.
- **Where to train:**
  - **Pure-JS logistic regression or FM in the hourly Node job:** no new runtime, no data leaves the server, and it fits the sleep-friendly design (no extra timers).
  - **Python models on Railway:** need Python plus numpy, scipy, pandas, scikit-learn, LightGBM and interpret-core (wheels alone total tens of MB; interpret-core is 15.6 MB) in the image or a second service. That conflicts with "keep the server simple and sleepable".
  - **GitHub Actions** (this repo is public): free 4-vCPU / 16-GB runners comfortably fit EBM at 500k drafts. Caveats:
    - it needs a training extract uploaded somewhere CI can read. R2 is already used for the server's daily user-data backups; the collector rows are not necessarily included. A 500k-draft compact extract is roughly 12 MB at about 25 bytes per game;
    - the R2 credentials must be stored as Actions secrets (DraftGap's pattern with S3);
    - a cron near the top of the hour can be delayed or dropped;
    - scheduled workflows are disabled after 60 days without repo activity.
  - **Developer PC:** fine for experiments, but a dependency for production refreshes.
  - Whichever trainer is used, the output should be a versioned, hashed JSON artifact the server serves next to the meta snapshot. GitHub Releases (free, 2 GiB per file) or R2 can hold the history.
- **Installer size:** see section 2. Tables add almost nothing, the ORT CPU WASM adds about 3.7 MB gzip, and onnxruntime-node for Windows x64 adds about 29 MB gzip (including the DirectML and DX compiler DLLs).

### Gaps
- I did not verify whether Railway bills vCPU by allocation or by measured use (the pricing page gives only per-vCPU-second rates). The cost figures above are upper bounds.
- I did not verify whether artifact storage is free for public repos (the 500 MB figure is for the Free plan generally).
- No timings on a 4-vCPU GitHub runner or a Railway container. The desktop numbers will be slower there, more so for EBM.
- FM and EBM times on real data, with more categories and pairs, are unknown.

## 7. Open-source code worth borrowing (DraftGap, LoLDraftAI, DraftRec, others) and their licences

### Takeaway
Two codebases are directly reusable under MIT:
- **DraftGap** (active TypeScript monorepo): Lolalytics-based daily dataset build, Elo-rating additive model, pseudo-count shrinkage of current-patch data toward 30-day data.
- **LoLDraftAI's public archive** (May 2025 state): PyTorch training with patch embeddings, ONNX export, patch-adaptation script, next-patch test.

DraftRec has no licence file, so only its paper can be used. The other draft-model repositories found are small and unvetted.

### Cited Findings
- **vigovlugt/draftgap:**
  - MIT, 68 stars, created 2022-11-16, last push 2026-10-10, 425 commits.
  - TypeScript monorepo (Bun `bun.lock`, Turborepo, Nix flake).
  - Layout:
    - `apps/dataset` (Lolalytics scrapers `src/lolalytics/*.ts`, Riot static data `src/riot.ts`, S3 storage);
    - `packages/core/src/{draft/analysis.ts, draft/suggestions.ts, rating/ratings.ts, risk/risk-level.ts, statistics/stats.ts}`;
    - `.github/workflows/dataset.yml`;
    - an `AGENTS.md`.
  - Sources: [repo](https://github.com/vigovlugt/draftgap); [GitHub API](https://api.github.com/repos/vigovlugt/draftgap)
- **Looyyd/loldraftai-monorepo-public:**
  - MIT, "Public archive of the loldraftai monorepo. The archived version represents the state as of May 2025". Last push 2026-03-21.
  - Contents:
    - `apps/machine-learning`: `train.py`, `train_pro.py`, `prepare_data.py`, `adapt_model.py`, `convert_to_onnx.py`, `serve-model.py` (FastAPI + onnxruntime), Dockerfiles;
    - `apps/data-collection` (TypeScript), `apps/desktop`, `apps/web-frontend` (Next.js API routes), `packages/riot-api`.
  - `requirements-inference.txt` pins `scikit-learn==1.5.2  # For label encoders  # Pin to match training environment`.
  - A second repo, Zayndrix/loldraftai-monorepo (MIT), also exists.
  - Sources: [GitHub search API](https://api.github.com/search/repositories?q=loldraftai); [repo](https://github.com/Looyyd/loldraftai-monorepo-public); [requirements-inference.txt](https://github.com/Looyyd/loldraftai-monorepo-public/blob/HEAD/apps/machine-learning/requirements-inference.txt)
- **dojeon-ai/DraftRec:** code for the paper "DraftRec: Personalized Draft Recommendation for Winning in Multi-Player Online Battle Arena Games". The GitHub API reports no licence; 18 stars, last push 2023-08-11. — [GitHub API dojeon-ai/DraftRec](https://api.github.com/repos/dojeon-ai/DraftRec)
- **Smaller repositories found by GitHub search** (stars as of 2026-10-17):
  - RihalMahmood/DraftSense: MIT, 0 stars, "statistical matchup data with a trained XGBoost".
  - jbaptiste-q/dota2-draft-win-prediction: licence NOASSERTION, "A leakage-controlled study" of pro Dota 2 drafts.
  - neoblades02/dota2-prediction: no licence, "Roster-aware, patch-aware win probabilities".
  - bugboy1769/dota2_drafting_model: no licence, "AlphaZero style".
  - Source: [GitHub search API](https://api.github.com/search/repositories?q=league+of+legends+draft+prediction&sort=stars)
- iTero's model is closed source. It was built first in Excel and now in Python, as "layers" of linear models and gradient-boosted trees. — [iTero draft model](https://itero.gg/articles/the-draft-model)

### Inferences
- **Worth borrowing from DraftGap** (MIT: keep the copyright notice):
  - the Elo↔win-rate transforms;
  - pair terms defined as a residual over the additive expectation, which keeps duo and matchup reasons "pure";
  - the user-selectable prior-games table, which is a ready design for "confidence" or risk levels;
  - the daily GitHub Actions dataset build with secrets.
  The 2026 comparison shows the cost of this design: higher log loss and roughly double the ECE of LoLDraftAI on the same 32,750 games. Its blind spots are team identity, damage profile and side.
- **Worth borrowing from LoLDraftAI (MIT):**
  - patch merging below a games threshold;
  - the sliding patch window with warm-started embeddings;
  - the `next_patch_test` evaluation;
  - the side-agnostic, single-elo evaluation knobs;
  - pinning the training library version for inference.
  Its serving model (server-side ONNX in a container) does not fit this project's offline desktop scoring and secret-free client. Only the training and evaluation ideas carry over.
- **DraftRec** cannot be copied (no licence). Its ideas (personalization from player history) may still inform the personal term.

### Gaps
- DraftRec's paper and data format were not read.
- DraftGap's `suggestions.ts`, the Lolalytics scraper details and its handling of rank bias (`removeRankBias`) were not read in full.
- The small repositories were not reviewed for code quality or correctness.
- No maintained open-source code was found for a GA2M/EBM-based LoL draft model.
