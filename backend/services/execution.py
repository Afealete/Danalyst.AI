"""Safe code execution service with AST validation."""
import time
import traceback
import json
import pandas as pd
import numpy as np
from typing import Any, Optional

from utils.validator import validate_code


SAFE_GLOBALS = {
    "__builtins__": {
        # __import__ is required for `import X` statements inside exec'd code.
        # It is safe here because AST validation already blocks disallowed modules
        # before we ever reach exec().
        "__import__": __import__,
        "len": len, "range": range, "enumerate": enumerate, "zip": zip,
        "list": list, "dict": dict, "tuple": tuple, "set": set,
        "str": str, "int": int, "float": float, "bool": bool,
        "round": round, "abs": abs, "min": min, "max": max, "sum": sum,
        "any": any, "all": all, "map": map, "filter": filter,
        "sorted": sorted, "reversed": reversed, "isinstance": isinstance,
        "type": type, "print": lambda *args, **kwargs: None,
        "hasattr": hasattr, "callable": callable,
        "True": True, "False": False, "None": None,
        "ValueError": ValueError, "TypeError": TypeError, "KeyError": KeyError,
        "IndexError": IndexError, "AttributeError": AttributeError,
    }
}


class ExecutionResult:
    def __init__(
        self,
        success: bool,
        result: Any = None,
        fig_json: Optional[str] = None,
        error: Optional[str] = None,
        execution_time_ms: float = 0.0
    ):
        self.success = success
        self.result = result
        self.fig_json = fig_json
        self.error = error
        self.execution_time_ms = execution_time_ms


def execute_code(code: str, df: pd.DataFrame) -> ExecutionResult:
    """
    Safely execute generated code against the provided DataFrame.
    Returns ExecutionResult with data and optional chart.
    """
    # Step 1: AST validation
    is_safe, error_msg = validate_code(code)
    if not is_safe:
        return ExecutionResult(success=False, error=f"Code validation failed: {error_msg}")

    # Step 2: Prepare safe execution namespace
    import pandas
    import numpy
    try:
        import plotly.express as px_mod
        import plotly.graph_objects as go_mod
    except ImportError:
        px_mod = None
        go_mod = None

    local_ns: dict[str, Any] = {
        "df": df.copy(),
        "pd": pandas,
        "np": numpy,
        "result": None,
        "fig": None,
    }

    if px_mod:
        local_ns["px"] = px_mod
    if go_mod:
        local_ns["go"] = go_mod

    exec_globals = {**SAFE_GLOBALS}

    # Step 3: Execute
    start = time.perf_counter()
    try:
        exec(compile(code, "<generated>", "exec"), exec_globals, local_ns)
    except Exception as e:
        elapsed = (time.perf_counter() - start) * 1000
        return ExecutionResult(
            success=False,
            error=f"Execution error: {type(e).__name__}: {e}",
            execution_time_ms=elapsed
        )
    elapsed = (time.perf_counter() - start) * 1000

    result = local_ns.get("result")
    fig = local_ns.get("fig")

    # Step 4: Serialize figure to JSON
    fig_json: Optional[str] = None
    if fig is not None:
        try:
            fig_json = fig.to_json()
        except Exception:
            fig_json = None

    return ExecutionResult(
        success=True,
        result=result,
        fig_json=fig_json,
        execution_time_ms=elapsed
    )


def _df_to_safe_rows(df: pd.DataFrame) -> list:
    """
    Convert a DataFrame to a list of rows with only JSON-serializable Python types.
    Uses pandas' own JSON round-trip so numpy int64/float64/NaN are all handled.
    """
    import json as _json
    raw = _json.loads(df.to_json(orient="split", date_format="iso"))
    return raw["data"]


def result_to_preview(result: Any, max_rows: int = 100) -> Optional[dict]:
    """Convert execution result to DatasetPreview dict (for table display)."""
    if result is None:
        return None

    try:
        if isinstance(result, pd.DataFrame):
            df_r = result.head(max_rows)
            return {
                "columns": [str(c) for c in df_r.columns],
                "rows": _df_to_safe_rows(df_r),
                "total_rows": int(len(result)),
            }
        elif isinstance(result, pd.Series):
            df_r = result.head(max_rows).reset_index()
            return {
                "columns": [str(c) for c in df_r.columns],
                "rows": _df_to_safe_rows(df_r),
                "total_rows": int(len(result)),
            }
    except Exception:
        pass
    return None


def result_to_answer(result: Any) -> str:
    """Convert execution result to a human-readable string answer."""
    if result is None:
        return "Analysis complete. See chart for visualization."
    if isinstance(result, str):
        return result
    if isinstance(result, (int, float, np.integer, np.floating)):
        return str(result)
    if isinstance(result, pd.DataFrame):
        rows, cols = result.shape
        return f"Result: {rows} rows × {cols} columns. See table below."
    if isinstance(result, pd.Series):
        return f"Result: {len(result)} values. See table below."
    try:
        return str(result)
    except Exception:
        return "Analysis complete."
