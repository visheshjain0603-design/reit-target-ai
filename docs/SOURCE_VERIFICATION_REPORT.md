# Source Verification Report

**REIT Target AI | NMIMS B.Sc. Finance — Business Analytics Theme 4**
**Verification performed 4 October 2026. All data in this project is synthetic.**

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
Mumbai's premier office location — and its evidence basis cited a REIT that does
not own anything there. The segment's values are unchanged, and its evidence
basis is now recorded honestly as unsupported.

**SRC-004 — Nexus Select Trust has 19 consumption centres, not 17.** The
register said 17. The publisher's own site states 19 across 15 cities as of 30
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
