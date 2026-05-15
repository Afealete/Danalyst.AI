"""In-memory session store for uploaded datasets and query results."""
import uuid
from typing import Optional
import pandas as pd


class SessionData:
    def __init__(self, session_id: str, filename: str, df: pd.DataFrame):
        self.session_id = session_id
        self.filename = filename
        self.df = df


class QueryRecord:
    def __init__(self, query_id: str, question: str, answer: str, chart_type: Optional[str], has_chart: bool, has_table: bool, created_at: str, result_df: Optional[pd.DataFrame] = None):
        self.query_id = query_id
        self.question = question
        self.answer = answer
        self.chart_type = chart_type
        self.has_chart = has_chart
        self.has_table = has_table
        self.created_at = created_at
        self.result_df = result_df


# Global in-memory stores (keyed by session_id)
_sessions: dict[str, SessionData] = {}
_query_history: dict[str, list[QueryRecord]] = {}


def create_session(filename: str, df: pd.DataFrame) -> str:
    session_id = str(uuid.uuid4())
    _sessions[session_id] = SessionData(session_id, filename, df)
    _query_history[session_id] = []
    return session_id


def get_session(session_id: str) -> Optional[SessionData]:
    return _sessions.get(session_id)


def get_latest_session() -> Optional[SessionData]:
    """Return the most recently created session."""
    if not _sessions:
        return None
    return list(_sessions.values())[-1]


def add_query_record(session_id: str, record: QueryRecord):
    if session_id not in _query_history:
        _query_history[session_id] = []
    _query_history[session_id].append(record)


def get_query_history(session_id: str) -> list[QueryRecord]:
    return _query_history.get(session_id, [])


def get_query_record(session_id: str, query_id: str) -> Optional[QueryRecord]:
    for record in _query_history.get(session_id, []):
        if record.query_id == query_id:
            return record
    return None
