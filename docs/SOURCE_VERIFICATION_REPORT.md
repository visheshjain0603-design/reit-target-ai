# Source Verification Report

**REIT Target AI | NMIMS B.Sc. Finance — Business Analytics Theme 4**
**Verification performed 4 October 2026; second pass and benchmark comparisons 5 October 2026. All data in this project is synthetic.**

---

## The short version

**Nothing in this project's source register is Verified, and after this exercise
nothing has been upgraded to Verified.** Of the twelve external citations, none
could be traced to a specific document containing a specific figure. Four of the
twelve cite a URL that does not resolve at all.

The data itself is unaffected: no market value was altered, because altering a
value to make a citation fit would be the opposite of verification.

---

## What "verified" has to mean

A citation is verified when the figure the project uses can be found in the
document the project cites. That is a chain of three links, and all three must
hold:

1. the **publisher** exists and the URL belongs to it,
2. the **document** with the cited title exists and is reachable,
3. the **figure** used in this project appears in that document.

A URL that opens satisfies link one at best. Marking a source Verified because
its URL opens would record that a website exists — which is not in doubt and is
not the question. The assignment governing this work says plainly: *never mark a
source Verified merely because the URL opens.* That instruction is the reason
this report concludes as it does.

---

## Results

| ID | Publisher | Cited document | Outcome |
|---|---|---|---|
| SRC-001 | Embassy Office Parks REIT | Annual Report 2024-25 | URL was wrong (404), corrected; publisher confirmed; **document not located**; register note contained a factual error |
| SRC-002 | Mindspace Business Parks REIT | Annual Report 2024-25 | Publisher confirmed; **document not located** |
| SRC-003 | Brookfield India REIT | Annual Report 2024-25 | **Access blocked (403)** — nothing confirmed |
| SRC-004 | Nexus Select Trust | Annual Report 2024-25 | URL was wrong (404), corrected; publisher confirmed; **document not located**; register note contained a factual error |
| SRC-005 | JLL India | India Office Market Report Q4 2024 | URL redirected, corrected; publisher confirmed; **document not located** |
| SRC-006 | CBRE South Asia | India Real Estate Market Outlook 2025 | Publisher confirmed; **document not located** |
| SRC-007 | Knight Frank India | India Real Estate Outlook H1 2025 | Publisher confirmed; **the cited title does not exist** — a comparable series does |
| SRC-008 | Colliers India | India Office Market Q1 2025 | **Access blocked (403)** — nothing confirmed |
| SRC-009 | ANAROCK Research | India Residential Market Report Q4 2024 | **Access blocked (403)** — nothing confirmed |
| SRC-010 | Cushman & Wakefield India | India Office Leasing Outlook 2025 | Publisher confirmed; **the cited title does not exist** — a comparable series does |
| SRC-011 | Mint | REIT benchmark rentals 2024 | **Not verifiable as cited** — the URL is a publication home page |
| SRC-012 | Economic Times Real Estate | Hyderabad overview citing Colliers | **Not verifiable as cited** — the URL is a section index |
| SRC-013 | *(this project)* | Semi-Synthetic Assumption Set v1.0 | Not an external source; present in the repository |

Eight of twelve publishers were confirmed as real organisations whose official
sites are at or near the cited URLs. **Zero of twelve documents were located.**
**Zero of twelve figures were traced.**

---

## The two factual errors found in the register

These were found by reading what the publishers actually say, and they are the
most useful product of the exercise. Both were claims in the register's own
notes, not values in the dataset.

**SRC-001 — Embassy REIT does not hold a BKC asset.** The register note said
Embassy "covers BKC, Whitefield, ORR, Manyata assets". Embassy's own site lists
its Mumbai assets as Express Towers, First International Finance Center and
Embassy 247. There is no Bandra Kurla Complex asset. Embassy Manyata in
Bengaluru is confirmed. The note has been corrected to say what the publisher
says.

This matters because BKC is MKT-001 in this project — the first market segment,
Mumbai's premier office location — and its source basis cited a REIT that does
not own anything there. The segment's values are unchanged, and its external
calibration is now recorded honestly as Unverified.

**SRC-004 — Nexus Select Trust has 19 consumption centres, not 17.** The
register said 17. The publisher's own site states 19 across fifteen cities as of 30
June 2026. Corrected.

---

## Two citations that were never citations

SRC-011 points at `livemint.com`. SRC-012 points at an Economic Times section
index. Neither is a citation: a home page or a section index contains no fixed
claim, changes daily, and cannot evidence anything. They have been left in the
register, marked as not verifiable as cited, rather than deleted — the register
should record that this project once leaned on them.

---

## Four citations with a wrong URL

| ID | Cited URL | Status | Correct URL |
|---|---|---|---|
| SRC-001 | `/investor-relations` | 404 | `https://www.embassyofficeparks.com/investors/` |
| SRC-004 | `/investor-relations` | 404 | `https://www.nexusselecttrust.com/` |
| SRC-005 | `jll.co.in/en/trends-and-insights` | 302 redirect | `https://www.jll.com/en-in/insights` |

The URLs have been corrected in `data-pipeline/source_register.csv`. Correcting a
URL does not verify the citation, and none of the three has been upgraded.

---

## Why none of the documents could be found

Three reasons, and only the third is a defect in this project.

**The cited reports are in the past and the sites show the present.** Commercial
research portals list current publications. A Q4 2024 or 2025 report is
generally no longer on the landing page, and the landing page is what was cited.

**Three publishers return HTTP 403 to automated requests.** Brookfield, Colliers
and ANAROCK could not be read at all. That is their configuration, not evidence
either way, and it is recorded as blocked rather than as absent.

**Two of the cited titles appear to be paraphrases.** Knight Frank publishes
"India Real Estate - Office and Residential Market H2: 2025", not "India Real
Estate Outlook H1 2025". Cushman & Wakefield publishes city-level MarketBeat
reports, not an "India Office Leasing Outlook 2025". A paraphrased title cannot
be looked up, and a citation that cannot be looked up is not a citation. This is
the project's error, and it is now recorded as one.

---

## What was deliberately not done

**No market value was changed.** The temptation in an exercise like this is to
adjust a figure until it matches something a source does say, which converts an
unsupported number into a number that looks supported. The governing instruction
— *do not alter market values merely to increase the number of Verified sources;
flag unsupported values honestly* — forbids it, and it would be wrong anyway.
Every value in `markets.json` is exactly what it was before this report.

**No restricted site was scraped and no citation was invented.** Where a
publisher returned 403, that is the finding.

**Nothing was upgraded to Verified.** Eight publishers were confirmed. Not one
figure was traced to a document. The honest status of this project's external
evidence base is therefore unchanged by this exercise, and saying so is the
report's main conclusion.

---

## What this means for the project

The dataset's defensibility does not rest on these citations, and it is worth
being precise about what it does rest on.

The generator's structure is defensible on economic grounds that can be checked
without any external document: prime assets trade at lower yields than
peripheral ones, which the data now exhibits monotonically; yield correlates
positively with risk within each asset class, which is the risk premium; thin
markets disperse more widely than deep ones. Those relationships are checkable
by inspection of the output, and the test suite checks them.

What the citations were meant to establish is *calibration* — that the levels,
not merely the relationships, resemble Indian market levels. **That remains
unestablished.** The honest position is the one `data-pipeline/docs/DATA_REBUILD_RATIONALE.md`
already takes: the data is calibrated to published benchmark ranges as recorded
in the assumption register, those ranges are not traceable to a specific
document, and no observation corresponds to a real transaction.

For an academic project on synthetic data this is a limitation, not a failure.
It would be a failure to present it as anything else.

---

## How this report is used by the application

The application keeps three things apart: the composite attractiveness score,
simulation support (simulated observations, their P10–P90 spread and the
project's own Assumption Support Grade), and **external calibration**. External
calibration is derived only from the register this report describes:

1. `data-pipeline/scripts/buildMeta.js` reads the `verification_status` of every
   row in `data-pipeline/source_register.csv`, classifies it with
   `AppMeta.sourceOutcome()` as Verified, Partially supported, Unverified or
   Internal (SRC-013, the project's own assumption set), and writes the outcomes
   and a summary to `public/data/meta.json` under `sourceVerification`.
2. The application loads `meta.json` and gives each market segment the status
   `AppMeta.calibrationStatus(sourceIds, outcomes)` computes from the external
   sources that segment cites: Verified only when every one of them is Verified,
   Partially supported when at least one is Verified or Partially supported,
   otherwise Unverified. A segment whose outcomes cannot be loaded is Unverified.
3. No row is Verified or Partially supported, so **every segment is Unverified**.
   The pages, the agent context and the Decision Report show that status, and the
   shortlist candidate always carries the caveat that external calibration remains
   unverified and that further evidence collection and due diligence are required.

`AppMeta.calibrationStatus()` takes no observation count and no grade. The number
of simulated observations and the Assumption Support Grade describe how the
project's own simulation was built and how tightly it pins down a segment's
medians; they are never used to infer calibration. The segment with the most
simulated observations is Unverified like every other (T-166a–d).

A segment can change status only through this register: a figure traced to a
located document, recorded in `source_register.csv`, followed by a rerun of
`buildMeta.js`. T-159c fails if any row claims Verified or Partially supported
without a traced figure from that document in `data-pipeline/benchmark_checks.csv`,
so such a change has to be made together with its evidence and an update to this
report. (Superseded: until 5 October 2026 T-159c required zero verified sources
permanently, which would have failed a genuine tracing as readily as a false claim.)

---

## Second pass, 5 October 2026

**Aim.** Look for the exact cited documents rather than publisher landing pages,
audit how sources are mapped to segments, and — where any primary document could
be read — compare a small set of the project's assumptions with figures quoted in
it. Recorded outcomes distinguish *not retrieved in this pass* from *does not
exist*: a document that could not be fetched is not evidence that it does not exist.

**Mapping audit — 50 of 50 segments inconsistent, now reconciled.** Every
segment's `methodologyNote` named publications that were not the entries in its
`sourceIds`: office segments named JLL/CBRE research but cite SRC-001/SRC-002
(Embassy and Mindspace annual reports); retail segments named JLL and CBRE retail
reports but cite SRC-003/SRC-004 (SRC-003 is Brookfield, an office REIT);
residential segments named Knight Frank and ANAROCK but cite SRC-005/SRC-006
(office and outlook reports). Four of the publications named in the notes are not
in the register at all, and `evidence_register.csv` maps sources a third way. The
notes also claimed, in the present tense, that estimates were "parameterised on"
or "calibrated to" those reports. `data-pipeline/scripts/reconcileProvenance.js`
rewrote both note fields so that each names exactly its own `sourceIds`, says no
document has been located, and records the earlier wording as the authors'
intended benchmark; the original notes are kept in
`data-pipeline/provenance_notes.superseded-20261005.csv`. No value, grade,
`sourceIds` or status changed. The input files (`market_estimates_long.csv`,
`assumptions.csv`) still carry labels such as "Reported" and "City+locality
benchmark from documented source hierarchy"; these are historical intent labels
from when the assumption set was written and are not evidence (they are generator
inputs and are left unchanged so the seeded data can still be reproduced byte for
byte).

**Retrieval outcomes.**

| Source | Outcome of the second pass |
|---|---|
| SRC-001 Embassy REIT Annual Report 2024-25 | Exact document not retrieved in this pass. The publisher's Q4 FY25 earnings presentation (29 April 2025) was read instead |
| SRC-002 Mindspace REIT Annual Report 2024-25 | Exact document located on the publisher's site but too large (over 10 MB) to retrieve in this pass; the Q4 FY25 investor presentation (30 April 2025) was read instead |
| SRC-003 Brookfield India REIT Annual Report 2024-25 | Not retrieved: the publisher's annual-report page returned HTTP 404 |
| SRC-004 Nexus Select Trust Annual Report 2024-25 | Exact PDF address found; not fetched in this pass |
| SRC-005 JLL India Office Market Report Q4 2024 | Not located; a JLL press release (3 January 2025) was read and has no city-level rents |
| SRC-006 CBRE South Asia India Real Estate Market Outlook 2025 | Access blocked (HTTP 403) |
| SRC-007 Knight Frank India Real Estate Outlook H1 2025 | Cited title not found; the publisher's "India Real Estate – Office and Residential Market (January–June 2025)" was read |
| SRC-008 Colliers India Office Market Q1 2025 | Access blocked (HTTP 403) |
| SRC-009 ANAROCK India Residential Market Report Q4 2024 | Cited title not found; ANAROCK's "Indian Residential Real Estate Annual Report 2024" was read |
| SRC-010 Cushman & Wakefield India Office Leasing Outlook 2025 | Access blocked (HTTP 403) |
| SRC-011, SRC-012 (press) | Not attempted: the citations are a home page and a section index, not articles |

**Outcome: 0 of 12 cited documents read as cited**, so no register status changed
and nothing has been upgraded to Verified. Every segment's external calibration
remains Unverified.

**Benchmark comparisons.** Fourteen assumption-level comparisons were made with
figures quoted in the four documents that were read, each with its page or table
(`data-pipeline/benchmark_checks.csv`):

<!-- canonical:BEGIN benchmark-checks -->
| Check | Segment | Parameter | Project assumption | Located figure (quoted) | Source | Relation |
|---|---|---|---|---|---|---|
| BMK-01 | Bandra Kurla Complex, Mumbai | monthly rent (Grade A office) | 170–210 (central 185) INR per sq ft per month | BKC & Off-BKC 2,460 – 4,590 (229–427) 15% 6% | Knight Frank India, India Real Estate – Office and Residential Market (January–June 2025) (H1 2025), Mumbai business-district rental table (p.59 of the extracted text) | below |
| BMK-02 | Bandra Kurla Complex, Mumbai | annual rental growth | 4–10 (central 7) percent per year | BKC & Off-BKC … 15% 6% (12-month and 6-month change) | Knight Frank India, India Real Estate – Office and Residential Market (January–June 2025) (H1 2025), same table | below |
| BMK-03 | Outer Ring Road, Bengaluru | monthly rent (Grade A office) | 92–125 (central 108) INR per sq ft per month | ORR 1,076 - 1,345 (100 - 125) 2% 0% | Knight Frank India, India Real Estate – Office and Residential Market (January–June 2025) (H1 2025), Bengaluru rental table (p.27) | consistent |
| BMK-04 | Gurugram — Cyber Hub, Delhi NCR | monthly rent (Grade A office) | 105–145 (central 125) INR per sq ft per month | Gurugram Zone A 1,292-2,067 (120-192) 8% 4% | Knight Frank India, India Real Estate – Office and Residential Market (January–June 2025) (H1 2025), NCR rental table (p.67); Zone A includes DLF Cyber City | partly consistent |
| BMK-05 | HITEC City, Hyderabad | monthly rent (Grade A office) | 60–85 (central 72) INR per sq ft per month | SBD 753- 1,023 (70 -95) 11% 3% | Knight Frank India, India Real Estate – Office and Residential Market (January–June 2025) (H1 2025), Hyderabad rental table (p.43); SBD includes HITEC City | partly consistent |
| BMK-06 | Kharadi, Pune | monthly rent (Grade A office) | 55–78 (central 66) INR per sq ft per month | PBD East 726-1,183 (67-110) 5% 2% | Knight Frank India, India Real Estate – Office and Residential Market (January–June 2025) (H1 2025), Pune rental table (p.75); PBD East includes Kharadi | below |
| BMK-07 | Wakad, Pune | capital value (residential) | 3840–10200 (central 6160) INR per sq ft | Wakad 108,146-141,923 (10,047-13,185) 18% 15% | Knight Frank India, India Real Estate – Office and Residential Market (January–June 2025) (H1 2025), Pune residential price movement in select locations | below |
| BMK-08 | Undri / Pisoli, Pune | capital value (residential) | 2880–7480 (central 4480) INR per sq ft | Undri 60,461-67,641 (5,617-6,284) 2% 1% | Knight Frank India, India Real Estate – Office and Residential Market (January–June 2025) (H1 2025), Pune residential price movement in select locations | below |
| BMK-09 | Sarjapur Road, Bengaluru | capital value (residential) | 5280–12240 (central 7840) INR per sq ft | Average Capital Value … Bengaluru 8,380 | ANAROCK Research, Indian Residential Real Estate Annual Report 2024: Beyond the Growth Trajectory (January 2025), India residential market overview table, 'Average Capital Value (INR/sqft)' (p.7) | consistent (city level only) |
| BMK-10 | HITEC City, Hyderabad | monthly rent (office, single REIT asset) | 60–85 (central 72) INR per sq ft per month | Mindspace Madhapur 13.7 9.9 3.7 92.3% 97.2% 7.3 69.9 | Mindspace Business Parks REIT, Investor Presentation Q4 FY25 (30 April 2025), Portfolio asset table as of 31 March 2025 (p.54) | consistent (one asset) |
| BMK-11 | Malad — Mindspace, Mumbai | monthly rent (office, single REIT asset) | 82–115 (central 98) INR per sq ft per month | Mindspace Malad 0.8 0.8 - 98.5% 98.5% 3.8 102.2 | Mindspace Business Parks REIT, Investor Presentation Q4 FY25 (30 April 2025), Portfolio asset table as of 31 March 2025 (p.54) | consistent (one asset) |
| BMK-12 | Bandra Kurla Complex, Mumbai | monthly rent (office, single REIT asset) | 170–210 (central 185) INR per sq ft per month | The Square BKC 0.1 0.1 - 100.0% 100.0% 1.7 240.0 | Mindspace Business Parks REIT, Investor Presentation Q4 FY25 (30 April 2025), Portfolio asset table as of 31 March 2025 (p.54) | below |
| BMK-13 | Pocharam, Hyderabad | occupancy (office, single REIT asset) | 55–82 (central 70) percent | Mindspace Pocharam 0.6 0.6 - 0.0% 0.0% - - | Mindspace Business Parks REIT, Investor Presentation Q4 FY25 (30 April 2025), Portfolio asset table as of 31 March 2025 (p.54) | above |
| BMK-14 | Bandra Kurla Complex, Mumbai | monthly rent (office, Mumbai REIT asset outside BKC) | 170–210 (central 185) INR per sq ft per month | Express Towers 0.5 - 0.5 3.6 100% 274 300 10% | Embassy Office Parks REIT, FY2025 Earnings Materials (Q4 FY25 earnings presentation) (29 April 2025), Portfolio summary (p.47) | context only |

14 comparisons: 1 above, 6 below, 4 consistent, 1 context only, 2 partly consistent. Generated from `data-pipeline/benchmark_checks.csv`, which also records each document's URL and its relationship to the source register. None of these documents is the one the register cites, so no source is verified and every segment's external calibration stays Unverified; no assumption was changed to match a figure.
<!-- canonical:END benchmark-checks -->

**What this changes.** The simulated observations stay synthetic, and the
assumptions stay the authors' own: nowhere does the project now say it was
calibrated to published figures. Where the located figure is consistent (ORR
office rent, a Bengaluru city average, single REIT assets in Madhapur and Malad),
that is a sanity check of one parameter, not verification. Where it differs —
most clearly Bandra Kurla Complex office rent, where the project's whole range
(₹170–210 per sq ft per month) is below the quoted district range (₹229–427), and
Wakad residential values, about 40% below — the assumption was not changed: a
recalibration would need a documented method and regeneration of every dependent
output, and one quoted range is not a locality median. These differences are
stated as limitations.

---

## Reproducing this

The register is `data-pipeline/source_register.csv`, with
`verification_status`, `verification_date` and `verification_method` columns
added by this exercise. The pre-verification file is kept alongside it as
`source_register.pre-verification.csv` so the change is auditable.

Each row was checked by fetching the cited URL and reading what the page
actually listed. Statuses used:

| Status | Meaning |
|---|---|
| `Publisher confirmed; document not located` | The URL belongs to the named publisher; the named report is not there |
| `URL corrected; publisher confirmed; document not located` | As above, and the cited URL was wrong |
| `Publisher confirmed; title not found; comparable series exists` | The publisher runs a similar series under a different title |
| `Unverified — access blocked` | The publisher returns 403 to automated requests |
| `Unverified — no article-level citation` | The citation names a home page or section index |
| `N/A — internal assumption set` | Not an external source |

`Verified` is not among them, because nothing earned it.
