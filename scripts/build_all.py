from __future__ import annotations

from fetch_dypa_registered_unemployment import main as fetch_dypa
from fetch_elstat_job_vacancies import main as fetch_vacancies
from fetch_elstat_lfs import main as fetch_lfs
from fetch_ergani_sources import main as fetch_ergani
from build_site_data import main as build_site


def main() -> None:
    fetch_lfs()
    fetch_vacancies()
    fetch_dypa()
    fetch_ergani()
    build_site()


if __name__ == "__main__":
    main()

