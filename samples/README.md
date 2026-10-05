# Sample files for the Data Centre CSV import (viva demonstration)

All rows are synthetic. The import is a cleaning demonstration: these files never
change the market segments or the analysis.

**How to run:** Data Centre → section 5 → **Import CSV** → choose the file.
The page shows the totals, each cleaning step, and every row with its status and
reason. **Clear the imported file** resets the section.

## 1. `viva-demo-listings.csv` — every cleaning step (15 rows)

Works the same on the live site and on the local version.
Expected result: **15 total, 7 OK, 6 rejected, 2 warnings (1 duplicate, 1 outlier)**.

| Record | What it shows | Expected |
|---|---|---|
| VIVA-01 | Prices written as "15 crore" and "10 lakh" | OK — converted to ₹15,00,00,000 and ₹10,00,000 |
| VIVA-02 | Extra spaces in "  Mumbai  " and property type written as "office" | OK — names trimmed, type becomes Commercial Office |
| VIVA-03 | Indian-format numbers with ₹ and commas ("₹18,00,00,000") | OK |
| VIVA-04 | Decimal crore ("13.5 crore") | OK |
| VIVA-05 | Price per sq ft about 10 times the other BKC rows (165 crore for 5,500 sq ft) | Warning — outlier (1.5 × IQR within Mumbai / BKC / office) |
| VIVA-06 | Exact repeat of VIVA-01 | Warning — duplicate (kept, not deleted) |
| VIVA-07 | Normal retail row | OK |
| VIVA-08 | Area 0 | Rejected — areaSqFt < 10 |
| VIVA-09 | Property type in lower case ("residential") | OK — normalised |
| VIVA-10 | Asking price 0 | Rejected — askingPriceINR ≤ 0 |
| VIVA-11 | Area 2,50,000 sq ft | Rejected — areaSqFt > 100000 |
| VIVA-12 | Negative rent | Rejected — monthlyRentINR ≤ 0 |
| VIVA-13 | Blank asking price | Rejected — askingPriceINR ≤ 0 |
| VIVA-14 | Area written as text ("abc") | Rejected — areaSqFt < 10 (unreadable number) |
| VIVA-15 | Normal row | OK |

Points to make: no row is silently dropped (15 in, 15 out); every rejection has a
stated reason; warnings are kept and flagged; the outlier is judged within its own
city, locality and type, not against the whole file.

**For the professor to try live:** open the file in Excel, change one value — for
example set VIVA-07's rent to 0, or copy a row to make a duplicate — save as CSV
and import again. The counts and reasons change accordingly.

## 2. `viva-demo-area-units.csv` — area units (8 rows)

**Use this on the local version only** (`python3 -m http.server 8080 --directory public`
or the proxy), until the latest changes are deployed. Leave **Unit of a generic
"area" column** on "Not stated".
Expected result: **8 total, 4 OK, 4 rejected**.

| Record | Area given as | Expected |
|---|---|---|
| UNIT-01 | `areaSqFt` 300 | OK — stays 300 sq ft (a small shop is not mistaken for square metres) |
| UNIT-02 | `areaSqM` 30 | OK — 323 sq ft (converted once, 1 m² = 10.7639 sq ft) |
| UNIT-03 | `area` 120 with `areaUnit` sqm | OK — 1,292 sq ft |
| UNIT-04 | `area` "300 sq m" | OK — 3,229 sq ft |
| UNIT-05 | "100 sqm" in the square-feet column | Rejected — unit conflict |
| UNIT-06 | `area` 250 with no unit | Rejected — area unit not stated (or choose a unit on the page and import again: it is then accepted) |
| UNIT-07 | `areaSqFt` 500 and `areaSqM` 100 (different areas) | Rejected — area columns disagree |
| UNIT-08 | `areaUnit` "acres" | Rejected — unit not recognised |

On the live site's older version this file shows the old defect instead: UNIT-01's
300 sq ft becomes 3,229 because the old rule guessed square metres for small
numbers. That before/after is itself a useful viva example.
