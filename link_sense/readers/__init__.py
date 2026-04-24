from dataclasses import dataclass
from datetime import datetime


@dataclass
class HistoryEntry:
    url: str
    title: str
    visit_count: int
    last_visit_time: datetime
