# Evaluator CSV fixtures

Two small CSV files for anyone assessing this project who wants to see the data
import path behave, without having to construct input themselves.

`markets-valid.csv` is six rows that the cleaning pipeline accepts in full.
`markets-invalid.csv` is six rows, each breaking exactly one rule, so the
rejection reasons are unambiguous — a file breaking several rules at once would
show only that something failed.

Both are synthetic. Neither contains real market data, and the values are
deliberately round so they are obviously invented.

Import them through **Data Centre → Import CSV**, or run the test suite, which
asserts that the valid file is accepted with no rejections and the invalid file
is rejected with a stated reason for every bad row (T-156).

| File | Rows | Expected outcome |
|---|---|---|
| `markets-valid.csv` | 6 | all accepted, no rejections, no missing columns |
| `markets-invalid.csv` | 6 | every row rejected or flagged, each with a reason |

## What each invalid row breaks

| Row | Locality | Defect | Rule it breaks |
|---|---|---|---|
| 1 | Zero Area | `areaSqFt` = 0 | area must be at least 10 sq ft |
| 2 | Giant Floorplate | `areaSqFt` = 500000 | area must not exceed 100,000 sq ft |
| 3 | Free Building | `askingPriceINR` = 0 | asking price must be above zero |
| 4 | Negative Rent | `monthlyRentINR` = −45000 | monthly rent must be above zero |
| 5 | Blank Price | `askingPriceINR` empty | asking price must be present and numeric |
| 6 | Text Area | `areaSqFt` = "large" | area must be numeric |
