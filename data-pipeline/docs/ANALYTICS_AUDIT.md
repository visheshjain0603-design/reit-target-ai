# Analytics Audit

**REIT Target AI | NMIMS B.Sc. Finance | Business Analytics | Theme 4 — Building Agents/Artifacts Using Generative AI**
**All data is synthetic.**

**GENERATED FILE.** Produced by `data-pipeline/scripts/auditAnalytics.js`, which
recomputes every headline financial figure from the raw data by a separate route
and compares the result with the engines. Regenerate with:

```bash
node data-pipeline/scripts/auditAnalytics.js
```

The script exits non-zero if any recomputation disagrees, so a broken formula
cannot be committed quietly.

## Result

Every independently recomputed figure agrees with the engine that produces it: the portfolio aggregates, both HHI figures, all eight normalisation ranges, every composite score, every contribution sum, and every point of all three scenario projections.

## Findings about the method

These are not disagreements. The code does what it was written to do; these are
questions about whether what it was written to do is right. None has been changed
silently, because each would alter the project's financial outputs.

### A2 — The diversification factor is a proxy, not the measured effect

The factor is computed from the portfolio's existing SHARE in a city and property
type, through the expression max(0, 1 - share x 2), weighted 60% city and 40% type.
The coefficient of 2 has no stated derivation: it is the reason any city holding
half the portfolio scores zero benefit, and that threshold was chosen, not derived.

Measured against the realised change in HHI that the same investment causes, the
correlation is 0.9287 across all 50 segments, and the heuristic takes only 15
distinct values because it depends on the city and type alone, not on the segment.

The factor is therefore directionally right and numerically coarse. It is NOT
changed here: substituting the realised HHI improvement would alter every
composite score and every ranking in the project, which is a decision for the
author and not for an audit script. It is recorded as a stated limitation, and
the realised before-and-after HHI figures are shown for every segment in the
screener so a reader can see the actual effect alongside the proxy.

### A3 — Occupancy is presented as a scenario assumption but does not affect the yield

The three scenarios each state an occupancy rate (80%, 90%, 95%) and the report
lists it in the assumptions table beside rental and capital growth, which reads as
though all three drive the projection. Two of them do. Occupancy does not.

projectScenario computes occupancyAdjRent = rent x occupancy, but every headline
figure — portfolio value, annual rent, and gross yield — is computed from the
unadjusted rent. Gross yield is rent / value, with no occupancy term at all.

The effect is understated risk: the conservative scenario assumes one fifth of the
space is empty and still reports the yield as though it were fully let. The
arithmetic is not wrong — a GROSS yield correctly ignores vacancy — but displaying
an assumption that changes nothing invites the reader to believe it was applied.

Remedy taken: projection.js now also returns effectiveGrossYield, the
occupancy-adjusted figure, and the label distinguishes the two. The existing
grossYield field is left exactly as it was, so no previously reported number
changes.

### A4 — projectHHI can project a concentration change larger than the investment causes

projectHHI interpolates linearly from the before-HHI toward the after-HHI and then
multiplies the change by a per-scenario damping factor of 0.6, 1.0 or 1.3.

With the project's own figures, the optimistic series ends at 0.3870 where the
investment actually produces 0.3930 — a concentration improvement 30% larger
than the transaction being modelled, arising from a multiplier with no mechanism
behind it. HHI after a known investment is not a forecast: it is arithmetic on the
resulting holdings, and it is already computed exactly by simulateInvestment.

No page calls projectHHI — it is unreachable code, which is why this has never
been displayed. It is marked as unused and not-for-display rather than deleted,
so the reasoning survives for anyone who finds it later and wonders.

## Full output

```
REIT Target AI — analytics audit
Recomputing every headline figure independently of the engines.

1. PORTFOLIO AGGREGATES
  agrees  total portfolio value                          audit 5.000000e+9   engine 5.000000e+9
  agrees  total annual rent                              audit 3.327500e+8   engine 3.327500e+8
  agrees  weighted gross yield                           audit 0.06655000   engine 0.06655000
  per-holding gross yields span 3.000% to 8.000%

2. HERFINDAHL-HIRSCHMAN INDEX
  agrees  city HHI (Σ sᵢ² over city value shares)        audit 0.41300000   engine 0.41300000
  agrees  asset-type HHI (Σ sᵢ² over type value shares)  audit 0.63160800   engine 0.63160800
  city HHI 0.413000 lies in [1/4 = 0.250000, 1] : yes
  type HHI 0.631608 lies in [1/3 = 0.333333, 1] : yes

3. SCORING ENGINE
  agrees  yield range minimum                            audit 0.02664357   engine 0.02664357
  agrees  yield range maximum                            audit 0.09870618   engine 0.09870618
  agrees  growth range minimum                           audit 0.04703000   engine 0.04703000
  agrees  growth range maximum                           audit 0.08662000   engine 0.08662000
  agrees  demand range minimum                           audit 51.40000000   engine 51.40000000
  agrees  demand range maximum                           audit 76.60000000   engine 76.60000000
  agrees  risk range minimum                             audit 25.40000000   engine 25.40000000
  agrees  risk range maximum                             audit 66.20000000   engine 66.20000000
  agrees  largest composite-score recomputation error    audit 0.00000000   engine 0.00000000
  (worst case was null)
  agrees  largest contributions-sum error                audit 0.00000000   engine 0.00000000
  scores outside 0-100: 0
  rank inversions: 0

4. WEIGHT SENSITIVITY
  balanced       highest score: MKT-036 Chennai/Ambattur (72.45, 26 obs, grade D)
                 recommended:   MKT-016 Delhi NCR/Gurugram — Cyber Hub (rank 5)
  incomeFocused  highest score: MKT-038 Ahmedabad/GIFT City (75.40, 26 obs, grade D)
                 recommended:   MKT-024 Delhi NCR/Aerocity (rank 8)
  growthFocused  highest score: MKT-012 Hyderabad/Banjara Hills (77.36, 47 obs, grade C)
                 recommended:   MKT-012 Hyderabad/Banjara Hills (rank 1)
  diversFocused  highest score: MKT-049 Kolkata/New Town (Rajarhat) (73.32, 26 obs, grade D)
                 recommended:   MKT-012 Hyderabad/Banjara Hills (rank 2)
  leader under balanced weights: MKT-036
  perturbations (±5pp, renormalised) that change the leader: 0 of 10
  margin between rank 1 and rank 2: 1.382 points on a 0-100 scale

5. DIVERSIFICATION FACTOR
  correlation between the heuristic factor and the realised HHI improvement: 0.9287  (n = 50)
  distinct heuristic values across all 50 segments: 15

FINDING A2 — The diversification factor is a proxy, not the measured effect
  The factor is computed from the portfolio's existing SHARE in a city and property
  type, through the expression max(0, 1 - share x 2), weighted 60% city and 40% type.
  The coefficient of 2 has no stated derivation: it is the reason any city holding
  half the portfolio scores zero benefit, and that threshold was chosen, not derived.
  
  Measured against the realised change in HHI that the same investment causes, the
  correlation is 0.9287 across all 50 segments, and the heuristic takes only 15
  distinct values because it depends on the city and type alone, not on the segment.
  
  The factor is therefore directionally right and numerically coarse. It is NOT
  changed here: substituting the realised HHI improvement would alter every
  composite score and every ranking in the project, which is a decision for the
  author and not for an audit script. It is recorded as a stated limitation, and
  the realised before-and-after HHI figures are shown for every segment in the
  screener so a reader can see the actual effect alongside the proxy.

6. SCENARIO PROJECTIONS
  agrees  year 0 portfolio value                         audit 5.500000e+9   engine 5.500000e+9
  agrees  year 0 annual rent                             audit 3.772674e+8   engine 3.772674e+8
  agrees  year 0 gross yield                             audit 0.06859407   engine 0.06859407
  agrees  conservative year 1 value                      audit 5.720000e+9   engine 5.720000e+9
  agrees  conservative year 1 rent                       audit 3.885854e+8   engine 3.885854e+8
  agrees  conservative year 3 value                      audit 6.186752e+9   engine 6.186752e+9
  agrees  conservative year 3 rent                       audit 4.122503e+8   engine 4.122503e+8
  agrees  conservative year 5 value                      audit 6.691591e+9   engine 6.691591e+9
  agrees  conservative year 5 rent                       audit 4.373563e+8   engine 4.373563e+8
  agrees  base year 1 value                              audit 5.940000e+9   engine 5.940000e+9
  agrees  base year 1 rent                               audit 3.999035e+8   engine 3.999035e+8
  agrees  base year 3 value                              audit 6.928416e+9   engine 6.928416e+9
  agrees  base year 3 rent                               audit 4.493315e+8   engine 4.493315e+8
  agrees  base year 5 value                              audit 8.081304e+9   engine 8.081304e+9
  agrees  base year 5 rent                               audit 5.048689e+8   engine 5.048689e+8
  agrees  optimistic year 1 value                        audit 6.160000e+9   engine 6.160000e+9
  agrees  optimistic year 1 rent                         audit 4.149941e+8   engine 4.149941e+8
  agrees  optimistic year 3 value                        audit 7.727104e+9   engine 7.727104e+9
  agrees  optimistic year 3 rent                         audit 5.021429e+8   engine 5.021429e+8
  agrees  optimistic year 5 value                        audit 9.692879e+9   engine 9.692879e+9
  agrees  optimistic year 5 rent                         audit 6.075929e+8   engine 6.075929e+8
  conservative   capital 4% vs rental 3% → yield 6.859% to 6.536%  (consistent)
  base           capital 8% vs rental 6% → yield 6.859% to 6.247%  (consistent)
  optimistic     capital 12% vs rental 10% → yield 6.859% to 6.268%  (consistent)

FINDING A3 — Occupancy is presented as a scenario assumption but does not affect the yield
  The three scenarios each state an occupancy rate (80%, 90%, 95%) and the report
  lists it in the assumptions table beside rental and capital growth, which reads as
  though all three drive the projection. Two of them do. Occupancy does not.
  
  projectScenario computes occupancyAdjRent = rent x occupancy, but every headline
  figure — portfolio value, annual rent, and gross yield — is computed from the
  unadjusted rent. Gross yield is rent / value, with no occupancy term at all.
  
  The effect is understated risk: the conservative scenario assumes one fifth of the
  space is empty and still reports the yield as though it were fully let. The
  arithmetic is not wrong — a GROSS yield correctly ignores vacancy — but displaying
  an assumption that changes nothing invites the reader to believe it was applied.
  
  Remedy taken: projection.js now also returns effectiveGrossYield, the
  occupancy-adjusted figure, and the label distinguishes the two. The existing
  grossYield field is left exactly as it was, so no previously reported number
  changes.

FINDING A4 — projectHHI can project a concentration change larger than the investment causes
  projectHHI interpolates linearly from the before-HHI toward the after-HHI and then
  multiplies the change by a per-scenario damping factor of 0.6, 1.0 or 1.3.
  
  With the project's own figures, the optimistic series ends at 0.3870 where the
  investment actually produces 0.3930 — a concentration improvement 30% larger
  than the transaction being modelled, arising from a multiplier with no mechanism
  behind it. HHI after a known investment is not a forecast: it is arithmetic on the
  resulting holdings, and it is already computed exactly by simulateInvestment.
  
  No page calls projectHHI — it is unreachable code, which is why this has never
  been displayed. It is marked as unused and not-for-display rather than deleted,
  so the reasoning survives for anyone who finds it later and wonders.

==========================================================================
Every recomputation agrees with the engines.
3 finding(s) about the method itself, recorded above and in
data-pipeline/docs/ANALYTICS_AUDIT.md. None of them is a disagreement between
the audit and the code; each is a question about what the code was asked to do.
==========================================================================
```
