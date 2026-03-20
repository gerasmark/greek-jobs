# Source research for `greece/jobs`

Research date: 2026-03-19

This file ranks the best sources for a Greece-first jobs visualizer. The goal is not "collect everything"; it is "pick sources that are official, refreshable, and realistic to ship."

## Recommendation in one line

Build v1 on ELSTAT + ESCO + DYPA + ERGANI. Use EURES, JOBmatch, Cedefop, and Elevate Greece as augmenting layers, not as the base denominator.

## Availability snapshot

- ELSTAT Labour Force Survey public occupation time series currently show `1st Quarter 2001 -> 4th Quarter 2025`.
- ELSTAT Job Vacancies public time series currently show `1st Quarter 2023 -> 4th Quarter 2025` by NACE section.
- DYPA monthly statistics page currently shows `January 2026`.
- ERGANI public reports page currently lists monthly private-sector flows through `December 2025` plus the `2025` special issue.
- ESCO is currently on `v1.2.1`, updated `2025-12-10`.

## Core sources for v1

| Priority | Source | Link | What it gives us | Granularity | Refresh | Why it should power v1 |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | ELSTAT Labour Force Survey (SJO01) | https://www.statistics.gr/en/statistics/-/publication/SJO01/2025-Q1 | Official employment counts and long history by occupation group | National, quarterly, 1-digit ISCO groups | Quarterly | This is the cleanest public source for treemap area, trend lines, and national employment totals |
| P0 | ELSTAT occupation classification (ISCO-08) | https://www.statistics.gr/documents/20181/0/Occup_isco_08_el.xls/94b2cfcb-e9b2-4f55-8da9-ad94c6c2498b?t=1718953923105 | Official Greek occupation codes and labels | ISCO hierarchy | Occasional | Gives us stable Greek labels and code structure |
| P0 | ESCO classification + API/download | https://esco.ec.europa.eu/en/about-esco/escopedia/escopedia/esco-languages | Multilingual occupation names, descriptions, and skills graph | Detailed occupation and skill graph | Versioned releases | Best source for Greek + English occupation metadata and later skills overlays |
| P1 | DYPA statistics and diagnosis material | https://www.dypa.gov.gr/statistika | Registered unemployment, cumulative unemployment tables, semiannual profile reports, mismatch studies | Monthly, semiannual, annual | Monthly / annual | Best official source for unemployed-side context and mismatch language |
| P1 | ELSTAT Job Vacancies Survey (SJO41) | https://www.statistics.gr/en/statistics/-/publication/SJO41/- | Official vacancies to be filled immediately, by NACE section | Quarterly, by sector | Quarterly | Strong demand-side context for header panels and sector overlays |
| P1 | ERGANI monthly private-sector flow reports | https://ypergasias.gov.gr/apascholisi/ektheseis-p-s-ergani/ | Hiring, exits, net flow, and seasonality in private salaried employment | Monthly, mostly sector/private-sector oriented | Monthly | Best source for momentum and seasonality, especially for tourism-heavy periods |

## High-value augmenting sources

| Priority | Source | Link | What it gives us | Why it is useful | Why it is not the v1 denominator |
| --- | --- | --- | --- | --- | --- |
| P2 | EURES | https://eures.europa.eu/select-language_en | Near-real-time vacancies in Greece and the EU | Good live demand supplement | Coverage depends on portal feeds, not a full Greek labor-market census |
| P2 | DYPA JOBmatch | https://www2.dypa.gov.gr/jobmatch | Live service / hospitality matching activity | Very relevant for tourism and entry-level work | Sector-specific, not broad enough for the whole workforce |
| P2 | Cedefop Greece skills forecast | https://www.cedefop.europa.eu/ga/country-reports/greece-2025-skills-forecast | Future-looking demand / skills forecast | Useful for forecast layers and narrative panels | Better for phase 2, not for a simple public v1 data pipeline |
| P2 | Elevate Greece | https://elevategreece.gov.gr/ | Startup registry, ecosystem metadata, and possibly jobs/careers slices | Very relevant if we add a startup / tech mode | It covers the startup ecosystem, not the whole labor market |

## Source-by-source notes

### 1. ELSTAT Labour Force Survey is the base table

Why it matters:
- It is the best public denominator for "how big is this occupation family in Greece?"
- It has long history, which makes trend lines and deltas easy.
- It is official and stable.

What we should use:
- Total employed persons
- One-digit occupation groups
- Time series from 2001 onward
- Related total-employment and unemployment context tables

What we should not expect from it in v1:
- Public 3-digit or 4-digit occupation weights
- Clean occupation-level salary data
- Full company/job-posting demand signals

Concrete page evidence:
- On the current ELSTAT LFS page, the time-series links include `04. Persons employed 15+ (one-digit groups of individual occupations) (1st Quarter 2001 - 4th Quarter 2025)`.

### 2. ELSTAT occupation classification gives us the Greek code system

Why it matters:
- We need one official occupation coding system on day one.
- ISCO-08 is already used by ELSTAT and is compatible with ESCO mappings.

Best use:
- Canonical ids
- Greek labels
- Group hierarchy
- Crosswalk anchor between ELSTAT and ESCO

### 3. ESCO is the metadata and skills layer

Why it matters:
- ESCO is already multilingual, including Greek and English.
- It gives us occupation descriptions and linked skills.
- It is much better than inventing our own occupation descriptions.

Best use:
- Occupation descriptions
- Greek / English labels toggle
- Skill chips and later "top linked skills"
- Input text for LLM-derived layers such as AI exposure

### 4. DYPA gives us unemployment-side context

Why it matters:
- ELSTAT tells us how many people are employed; DYPA tells us more about the registered unemployed side.
- The diagnosis mechanism explicitly deals with labor supply, demand, professions, skills, and mismatches.

Best use:
- Header cards for registered unemployment
- Notes about mismatch / shortages
- Annual or semiannual context panels

Important caveat:
- Registered unemployment is not the same thing as the LFS unemployment measure. We should show both clearly and label them as different statistics.

### 5. ELSTAT Job Vacancies is the clean public demand signal

Why it matters:
- It is official.
- It is easier to refresh than scraping private job boards.
- Even though it is sector-based, it gives the app a real demand-side panel.

Best use:
- National vacancy context
- Sector demand heatmaps
- Companion panel next to occupation treemap

Important caveat:
- This is by economic activity section, not by occupation. It should support the occupation visualization, not replace the base employment table.

### 6. ERGANI is the best seasonality / flow source

Why it matters:
- Greece has strong seasonality, especially in tourism.
- ERGANI is better than static annual tables for showing labor-market motion.

Best use:
- Hiring momentum
- Net hiring / net exits
- Monthly seasonality panels

Important caveat:
- It is a private-sector employment-flow source, not a full occupation census.

## What I would not use as the v1 foundation

- Scraped private job boards as the main denominator
  - Good supplement later, weak base now.
- Occupation-level wages as a core v1 layer
  - The easy public sources are weak or not cleanly open at the occupation level for Greece.
- Company-career-page scraping as phase 1
  - Useful later, but too fragile for the first version.

## Best initial source stack

If we want a buildable first release, I would use exactly this stack:

1. ELSTAT LFS for employment size and history
2. ELSTAT ISCO classification for code structure
3. ESCO for bilingual labels, descriptions, and future skill links
4. DYPA monthly stats for unemployment-side context
5. ELSTAT Job Vacancies for demand-side context
6. ERGANI for monthly flows and seasonality

Everything else should be treated as a secondary layer until the core pipeline is stable.
