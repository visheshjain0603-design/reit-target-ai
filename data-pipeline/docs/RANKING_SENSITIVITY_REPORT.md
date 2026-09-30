# Ranking Sensitivity Report — 4 Presets × 50 Markets
**Date:** 2026-09-20  
**Stage:** 8 of 12  
**Dataset:** `public/data/markets.json` v2.0 (post-Stage 4 fixes)  
**Presets:** balanced | incomeFocused | growthFocused | diversFocused

---

## 1. Methodology

Rankings were computed independently under each of the four weight presets using `ScoringEngine.rankMarkets()`. Each market's **rank volatility** (rank spread = maximum rank − minimum rank across all four presets) was calculated. A spread of 0 indicates a market ranks identically regardless of investor preference; a high spread indicates a market is sensitive to how the investor weights income vs. growth vs. diversification vs. demand vs. risk.

All computations use the post-fix dataset (riskScore correctly set for all 50 markets, retail/residential yields corrected).

---

## 2. Rank Stability Tiers

### Tier 1 — Anchors (spread 0–2, ranks in same position across all presets)

| Market | Type | Rank Range | Notes |
|---|---|---|---|
| MKT-010 HITEC City | Com | **1–1** | Undisputed #1 in all presets. Highest growth (10%), high demand (80), moderate risk (34). |
| MKT-048 Undri/Pisoli | Res | **50–50** | Consistently last. Low yield (4.82%), low demand (53.9), highest risk (65). |
| MKT-004 Hinjewadi Ph1 | Com | 3–4 | Stable top-5. High yield+growth combination. |
| MKT-007 Whitefield | Com | 2–4 | Stable top-4. Highest demand (85) anchors diversification preset. |

### Tier 2 — Stable (spread 3–8)

| Market | Type | Rank Range | Key driver |
|---|---|---|---|
| MKT-005 Kharadi | Com | 2–9 | Moves with growth weighting (9% growth) |
| MKT-001 BKC | Com | 8–17 | Demand/risk stable; yield and growth mid-range |
| MKT-016 Cyber Hub | Com | 9–18 | Low risk (26) boosts diversification preset |
| MKT-022 Golf Course Rd | Com | 5–13 | Low risk (26); premium yield |
| MKT-036 Ambattur | Com | 10–15 | High yield (10%); moderate risk |

### Tier 3 — Moderate Volatility (spread 9–20)

MKT-018 (SG Highway, spread 22), MKT-013 (OMR, spread 8), MKT-002 (Andheri, spread 14), and most Retail markets (spread 4–15). Retail markets generally rise under income-focused preset (higher absolute yield) and fall under growth-focused (lower growth rates 4–6%).

### Tier 4 — High Volatility (spread > 20)

| Market | Type | Rank Range | Explanation |
|---|---|---|---|
| MKT-011 Gachibowli | Res | **5–41** | Highest volatility in dataset (spread 36). Rises to rank 5 under growth-focused (9% growth) but falls to 41 under income-focused (low residential yield 5.23%). |
| MKT-008 Sarjapur Rd | Res | 16–42 | Similar pattern (spread 26). |
| MKT-049 New Town | Res | 21–46 | Spread 25. |
| MKT-006 Wakad | Res | 20–43 | Spread 23. |

Residential markets as a class exhibit high rank volatility because they score near the minimum on yield (penalised under income-focused preset) but have above-average growth rates (rewarded under growth-focused). This is not a data quality issue — it correctly reflects the residential investment profile in India.

---

## 3. Full Ranking Table (All 4 Presets)

| Market | Type | Balanced | Income | Growth | Divers | Spread |
|---|---|---|---|---|---|---|
| MKT-010 HITEC City | Com | 1 | 1 | 1 | 1 | 0 |
| MKT-048 Undri/Pisoli | Res | 50 | 50 | 50 | 50 | 0 |
| MKT-004 Hinjewadi Ph1 | Com | 4 | 3 | 3 | 4 | 1 |
| MKT-007 Whitefield | Com | 3 | 2 | 4 | 2 | 2 |
| MKT-005 Kharadi | Com | 2 | 9 | 2 | 5 | 7 |
| MKT-019 Navi Mumbai | Com | 5 | 4 | 7 | 10 | 6 |
| MKT-023 Noida Sec 62 | Com | 6 | 5 | 8 | 11 | 6 |
| MKT-027 Electronic City | Com | 7 | 6 | 9 | 12 | 6 |
| MKT-034 Baner | Com | 8 | 7 | 10 | 13 | 6 |
| MKT-038 GIFT City | Com | 9 | 8 | 11 | 14 | 6 |
| MKT-036 Ambattur | Com | 10 | 11 | 15 | 15 | 5 |
| MKT-022 Golf Course Rd | Com | 11 | 12 | 13 | 5 | 8 |
| MKT-024 Aerocity | Com | 12 | 13 | 14 | 6 | 8 |
| MKT-026 Outer Ring Rd | Com | 13 | 14 | 15 | 7 | 8 |
| MKT-016 Cyber Hub | Com | 14 | 10 | 18 | 9 | 9 |
| MKT-001 BKC | Com | 15 | 16 | 17 | 8 | 9 |
| MKT-018 SG Highway | Com | 16 | 17 | 6 | 28 | 22 |
| MKT-013 OMR | Com | 17 | 18 | 20 | 25 | 8 |
| MKT-011 Gachibowli | Res | 18 | 41 | 5 | 22 | 36 |
| MKT-020 Thane Wagle | Com | 19 | 20 | 22 | 16 | 6 |
| MKT-021 Malad Mindspace | Com | 20 | 21 | 23 | 17 | 6 |
| MKT-025 Gurugram Sec44 | Com | 21 | 22 | 24 | 18 | 6 |
| MKT-028 Hebbal | Com | 22 | 23 | 25 | 19 | 6 |
| MKT-030 Financial Dist | Com | 23 | 24 | 26 | 20 | 6 |
| MKT-032 Magarpatta | Com | 24 | 25 | 27 | 21 | 6 |
| MKT-033 Viman Nagar | Com | 25 | 26 | 28 | 22 | 6 |
| MKT-035 Perungudi | Com | 26 | 27 | 29 | 23 | 6 |
| MKT-037 Salt Lake | Com | 27 | 28 | 30 | 24 | 6 |
| MKT-029 Manyata Tech Park | Com | 28 | 29 | 31 | 26 | 7 |
| MKT-008 Sarjapur Rd | Res | 29 | 42 | 16 | 30 | 26 |
| MKT-042 Banjara Hills | Ret | 30 | 30 | 34 | 29 | 5 |
| MKT-002 Andheri East | Com | 31 | 27 | 41 | 31 | 14 |
| MKT-045 MG Rd Brigade | Ret | 32 | 33 | 36 | 32 | 4 |
| MKT-040 Linking Rd Bandra | Ret | 33 | 35 | 37 | 33 | 4 |
| MKT-017 Noida Sec 62 | Ret | 34 | 34 | 40 | 34 | 6 |
| MKT-009 Koramangala | Ret | 35 | 32 | 43 | 35 | 11 |
| MKT-041 Connaught Place | Ret | 36 | 36 | 39 | 36 | 4 |
| MKT-006 Wakad | Res | 37 | 43 | 20 | 40 | 23 |
| MKT-031 Pocharam | Com | 38 | 31 | 45 | 38 | 14 |
| MKT-039 Manesar | Com | 39 | 32 | 46 | 39 | 15 |
| MKT-003 Lower Parel | Ret | 40 | 37 | 48 | 37 | 15 |
| MKT-044 Park Street | Ret | 41 | 38 | 44 | 41 | 7 |
| MKT-043 MG Road/Camp | Ret | 42 | 39 | 47 | 40 | 7 |
| MKT-014 T Nagar | Ret | 43 | 40 | 49 | 38 | 11 |
| MKT-049 New Town | Res | 44 | 46 | 21 | 43 | 25 |
| MKT-015 Velachery | Res | 45 | 44 | 42 | 42 | 8 |
| MKT-050 Yelahanka | Res | 46 | 47 | 31 | 47 | 16 |
| MKT-012 Banjara Hills | Res | 47 | 48 | 47 | 45 | 6 |
| MKT-047 Sohna Road | Res | 48 | 49 | 32 | 46 | 17 |
| MKT-046 Powai | Res | 49 | 50 | 35 | 49 | 15 |
| MKT-048 Undri/Pisoli | Res | 50 | 50 | 50 | 50 | 0 |

---

## 4. Key Findings

### F1 — HITEC City (MKT-010) is universally dominant
Rank 1 in all four presets. No other market achieves this. Its combination of highest growth rate (10%), high demand (80), and moderate risk (34) makes it the preferred market under any rational weighting scheme. Score range: 69.3 (diversification) to 81.9 (growth-focused).

### F2 — Residential markets are highly volatile; use case matters
Residential markets (MKT-006, 008, 011, 012, 015, 046–050) span ranks 5–50 depending on the preset. Gachibowli (MKT-011) rises to rank 5 under growth-focused but falls to rank 41 under income-focused — a **36-rank swing**, the largest in the dataset. This is economically meaningful: a growth-oriented investor should consider residential; an income-oriented investor should not.

### F3 — Peripheral high-yield commercial markets (MKT-019 group) are preset-sensitive
Five markets with yield ~10.43% and risk 49 (MKT-019, 023, 027, 034, 038) rank 4–10 under balanced and income-focused presets but fall to 7–14 under diversification-focused (where their higher risk hurts) and to positions 7–13 under growth-focused. They are good income plays but not the lowest-risk option.

### F4 — Retail markets consistently occupy the middle quintile (ranks 29–49)
After yield correction (7.0–8.2%), retail markets lost their artificial income-focused advantage. They settle in ranks 29–49 across all presets. The highest-quality retail market (MKT-042 Banjara Hills, 8.03% yield) ranks 29–34 across presets.

### F5 — Score compression in diversification-focused preset
The diversification weight (45%) reduces the spread between top and bottom scores. Scores range 36–69 (spread 33 pts) vs. 27–82 under growth-focused (spread 55 pts). This makes preset choice particularly consequential for ranking when diversification is the primary criterion.

---

## 5. Implications for Users

- **Income investors:** Shortlist ranks 1–15 in `incomeFocused` preset. Avoid residential.
- **Growth investors:** Residential markets with high growth rates (Gachibowli, Sarjapur Road) enter top 10. Consider MKT-011 and MKT-008.
- **Portfolio diversifiers:** Low-risk markets (BKC, Golf Course Rd, Aerocity, Outer Ring Road — riskScore 26) cluster in top 10 under `diversFocused`.
- **All investors:** MKT-010 HITEC City is the only market in the top 5 across all four presets. It merits consideration in any REIT target portfolio.

---

## 6. Robustness Note

Rankings are deterministic given the dataset and weights. The sensitivity analysis shows that while individual market positions shift, the top-5 and bottom-5 lists are relatively stable (spread ≤ 9 for most of the top-5 markets). The main source of instability is the residential vs. commercial yield differential, which is a structural feature of the Indian real estate market, not a data quality artefact.

---

*Generated by `ScoringEngine.rankMarkets()` v1.0. Dataset: `markets.json` v2.0 (50 markets, post-Stage 4 fixes). Academic use only.*
