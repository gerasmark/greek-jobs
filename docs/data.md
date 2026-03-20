# Starter visible data for `greece/jobs`

This file defines the initial data we should show in the app. The rule is simple: if a field is hard to source or hard to refresh, it should not be in the starter version.

## Unit of analysis for v1

Use the `10 one-digit ISCO occupation groups` as the first treemap nodes.

Why:
- ELSTAT publishes public quarterly employment series for these groups.
- That gives us a reliable area metric immediately.
- It keeps the first pipeline honest and refreshable.

Tradeoff:
- v1 will be less granular than `karpathy/jobs`.
- That is acceptable. A stable 10-group Greece app is better than a fake 300-role app with weak weights.

## Must-have starter data

### Per occupation tile / detail view

| Field | Source | Why it is easy enough |
| --- | --- | --- |
| `isco_major_group` | ELSTAT ISCO classification | Stable official id |
| `label_el` | ELSTAT / ESCO | Official Greek label |
| `label_en` | ESCO | Easy bilingual support |
| `description_short` | ESCO | Reusable occupation summary text |
| `employment_latest` | ELSTAT LFS | Official latest quarterly value |
| `employment_share` | ELSTAT LFS | Derived from latest total employment |
| `employment_history_q` | ELSTAT LFS | Ready-made quarterly series from 2001 onward |
| `employment_yoy_pct` | ELSTAT LFS | Easy derived metric |
| `employment_5y_pct` | ELSTAT LFS | Easy derived metric |
| `ai_exposure_score` | LLM scoring over ESCO/ISCO descriptions | Reuses the upstream repo's strongest idea without needing US data |
| `ai_exposure_rationale` | LLM scoring pipeline | Useful detail text for tooltip / side panel |
| `source_period` | Build metadata | Makes refresh dates explicit |

### Global header / context panels

| Field | Source | Why it belongs in starter |
| --- | --- | --- |
| `total_employed` | ELSTAT LFS | Anchors the whole app |
| `unemployment_rate` | ELSTAT LFS monthly / quarterly release | Core national context |
| `registered_unemployed` | DYPA monthly statistics | Useful companion metric, if clearly labeled |
| `vacancies_by_sector` | ELSTAT Job Vacancies Survey | Adds demand-side context without scraping job boards |
| `private_sector_net_flows` | ERGANI | Adds motion and seasonality |

## Good next additions after the starter release

These are still realistic, but they are not necessary on day one:

- `sector_mix_latest` for each occupation group from the latest ELSTAT cross-tab table
- `remoteability_score` derived with an LLM
- `tourism_sensitivity_score` derived from sector composition plus ERGANI seasonality
- `skills_top_links` from ESCO
- `startup_mode` backed by Elevate Greece

## Data we should explicitly skip in v1

- Occupation-level salary / median pay
  - Hard to source cleanly and refresh consistently in Greece.
- Occupation-level long-term growth forecast
  - The best forecast material is more "report" than "simple refreshable feed".
- 3-digit or 4-digit occupation treemap weights
  - Public Greece data is much weaker there.
- Private-board live jobs as a main layer
  - Too fragmented and brittle for the first release.

## Recommended first screen

If we keep the UI close to the upstream project, the first screen should show:

- Treemap area = `employment_latest`
- Color mode 1 = `employment_yoy_pct`
- Color mode 2 = `ai_exposure_score`
- Header stats = `total_employed`, `unemployment_rate`, `registered_unemployed`
- Side panel = occupation description + history sparkline + AI rationale

That is enough for a strong v1.

## Suggested compact site data shape

This is the minimum JSON shape I would target for the frontend.

Important upstream note:
- The current `karpathy/jobs` frontend mainly needs a flat array with `title`, `category`, and `jobs`.
- Layer-specific fields such as `exposure`, `education`, `pay`, and `outlook` can be `null` without breaking the page.

Proposed Greece-first shape:

```json
[
  {
    "title": "Professionals",
    "label_el": "Greek label here",
    "slug": "isco-2-professionals",
    "category": "occupation-major-group",
    "isco_major_group": "2",
    "jobs": 1234567,
    "employment_share": 0.24,
    "history": [
      {"period": "2001-Q1", "jobs": 800000},
      {"period": "2025-Q4", "jobs": 1234567}
    ],
    "yoy_pct": 3.2,
    "five_year_pct": 11.8,
    "description": "Short ESCO-backed description here.",
    "exposure": 7,
    "exposure_rationale": "Short explanation here.",
    "source_period": "2025-Q4",
    "url": "https://www.statistics.gr/en/statistics/-/publication/SJO01/2025-Q1"
  }
]
```

## Practical note on labels

For the first implementation I would keep:

- `title` in English for code-level consistency
- `label_el` for display when we want Greek-first UI
- `label_en` only if we need a language toggle in the UI

That keeps the data model simple and still leaves room for bilingual presentation.
