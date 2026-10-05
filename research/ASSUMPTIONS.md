# Assumptions

Every uncertain point, the answer picked, how it was checked, and a confidence level (high / med / low).

| # | Assumption | Check (argued against it) | Confidence |
| --- | --- | --- | --- |
| A1 | The pasted brief was cut off after "how to share it with"; the intended ending is "…how to share it with friends, and open questions". | The goal section says "simple enough for friends to use with their own accounts", and BUILD-GUIDE.md ends with sharing an installer with friends. No other reading fits. | high |
| A2 | "/research/" means `research/` at the repo root, not `C:\research`. | The brief is about this project and says "write only inside /research/" next to "do not modify existing source code" — a repo-relative folder. A drive-root folder would be outside version control and the brief asks for files the owner reads "in the morning" alongside the code. | high |
