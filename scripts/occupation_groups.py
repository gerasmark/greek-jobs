from __future__ import annotations

from typing import Any


GROUPS: list[dict[str, Any]] = [
    {
        "code": "1",
        "slug": "managers",
        "title": "Legislators, senior officials and managers",
        "label_el": "Νομοθέτες, ανώτερα διοικητικά και διευθυντικά στελέχη",
        "category": "knowledge-and-office",
        "description": "Leadership, coordination, policy, and organizational decision-making roles across the economy.",
        "exposure": 7,
        "exposure_rationale": "These roles are highly exposed on planning, reporting, and information-heavy tasks, but less exposed on negotiation, accountability, and people leadership.",
    },
    {
        "code": "2",
        "slug": "professionals",
        "title": "Professionals",
        "label_el": "Επαγγελματίες",
        "category": "knowledge-and-office",
        "description": "Highly skilled professional occupations such as engineers, doctors, lawyers, teachers, and analysts.",
        "exposure": 8,
        "exposure_rationale": "A large share of this work is digital or document-heavy, so AI can reshape analysis, drafting, and research, even where human judgment remains central.",
    },
    {
        "code": "3",
        "slug": "technicians",
        "title": "Technicians and associate professionals",
        "label_el": "Τεχνολόγοι, τεχνικοί και ασκούντες συναφή επαγγέλματα",
        "category": "knowledge-and-office",
        "description": "Technical support and applied-professional roles bridging theory and hands-on execution.",
        "exposure": 6,
        "exposure_rationale": "AI is likely to automate diagnostics, documentation, and some analysis, but many tasks still require fieldwork, equipment, and human oversight.",
    },
    {
        "code": "4",
        "slug": "clerks",
        "title": "Clerks",
        "label_el": "Υπάλληλοι γραφείου",
        "category": "knowledge-and-office",
        "description": "Administrative, records, customer support, and clerical roles concentrated on office processes.",
        "exposure": 8,
        "exposure_rationale": "Routine document handling, coordination, and data entry are among the most exposed workflows to automation and AI copilots.",
    },
    {
        "code": "5",
        "slug": "service-and-sales",
        "title": "Service workers and shop and market sale workers",
        "label_el": "Απασχολούμενοι στην παροχή υπηρεσιών και πωλητές",
        "category": "services-and-sales",
        "description": "Frontline service, hospitality, retail, and sales occupations with strong person-to-person interaction.",
        "exposure": 4,
        "exposure_rationale": "AI can assist scheduling, training, and sales support, but the core work still depends heavily on physical presence and direct customer interaction.",
    },
    {
        "code": "6",
        "slug": "agriculture-and-fishery",
        "title": "Skilled agricultural and fishery workers",
        "label_el": "Ειδικευμένοι γεωργοί, κτηνοτρόφοι, δασοκόμοι και αλιείς",
        "category": "primary-sector",
        "description": "Skilled occupations in agriculture, livestock, forestry, and fishing tied to land, animals, and physical production.",
        "exposure": 2,
        "exposure_rationale": "Digital tools can improve planning and monitoring, but the work remains constrained by physical environments and field operations.",
    },
    {
        "code": "7",
        "slug": "craft-and-trades",
        "title": "Craft and related trade workers",
        "label_el": "Ειδικευμένοι τεχνίτες και ασκούντες συναφή επαγγέλματα",
        "category": "industrial-and-trades",
        "description": "Skilled manual trades across construction, repair, fabrication, and installation work.",
        "exposure": 2,
        "exposure_rationale": "The core value of these occupations is still physical execution, site adaptation, and manual skill, which limits direct AI substitution.",
    },
    {
        "code": "8",
        "slug": "operators-and-assemblers",
        "title": "Plant and machine operators and assembler",
        "label_el": "Χειριστές εγκαταστάσεων και μηχανημάτων και συναρμολογητές",
        "category": "industrial-and-trades",
        "description": "Machine operation, production-line, transport-equipment, and assembly work in industrial settings.",
        "exposure": 3,
        "exposure_rationale": "Automation pressure is meaningful, but physical equipment supervision and industrial constraints still keep exposure below office-heavy roles.",
    },
    {
        "code": "9",
        "slug": "elementary-occupations",
        "title": "Elementary occupations",
        "label_el": "Ανειδίκευτες εργασίες",
        "category": "general-labour",
        "description": "Basic manual, support, and low-specialization occupations across many sectors.",
        "exposure": 2,
        "exposure_rationale": "Many tasks are repetitive, but they often still require physical execution in the real world rather than purely digital work.",
    },
    {
        "code": "X",
        "slug": "unclassified",
        "title": "Other unclassified persons",
        "label_el": "Λοιπά μη ταξινομημένα άτομα",
        "category": "other",
        "description": "A residual published category for people not assigned to the main occupational group structure.",
        "exposure": 5,
        "exposure_rationale": "This is not a coherent occupation family, so any exposure score should be treated only as a neutral placeholder.",
    },
]


def normalize_group_title(value: str) -> str:
    return "".join(ch for ch in value.lower() if ch.isalnum())


BY_SOURCE_TITLE = {
    normalize_group_title(group["title"]): group
    for group in GROUPS
}

