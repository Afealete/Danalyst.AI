"""AST-based code validator for safe pandas/numpy/plotly code execution."""
import ast
from typing import Optional

ALLOWED_IMPORTS = {"pandas", "numpy", "plotly", "plotly.express", "plotly.graph_objects", "plotly.graph_objs", "matplotlib", "matplotlib.pyplot"}
BLOCKED_MODULES = {"os", "sys", "subprocess", "shutil", "socket", "requests", "urllib", "http", "ftplib", "smtplib", "importlib", "builtins", "eval", "exec", "__import__"}
BLOCKED_NAMES = {"eval", "exec", "compile", "__import__", "open", "input", "print", "breakpoint", "globals", "locals", "vars", "dir", "getattr", "setattr", "delattr", "hasattr"}
BLOCKED_ATTRS = {"system", "popen", "popen2", "popen3", "popen4", "startfile", "execve", "execvp", "fork", "kill", "unlink", "rmdir", "remove", "rmtree"}


class CodeValidator(ast.NodeVisitor):
    def __init__(self):
        self.errors: list[str] = []

    def visit_Import(self, node: ast.Import):
        for alias in node.names:
            base = alias.name.split(".")[0]
            if base in BLOCKED_MODULES:
                self.errors.append(f"Import of '{alias.name}' is not allowed.")
            elif base not in {"pandas", "numpy", "plotly", "matplotlib"}:
                self.errors.append(f"Import of '{alias.name}' is not in the allowed list (pandas, numpy, plotly, matplotlib).")
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom):
        module = node.module or ""
        base = module.split(".")[0]
        if base in BLOCKED_MODULES:
            self.errors.append(f"Import from '{module}' is not allowed.")
        elif base not in {"pandas", "numpy", "plotly", "matplotlib"}:
            self.errors.append(f"Import from '{module}' is not in the allowed list.")
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call):
        if isinstance(node.func, ast.Name):
            if node.func.id in BLOCKED_NAMES:
                self.errors.append(f"Call to '{node.func.id}' is not allowed.")
        elif isinstance(node.func, ast.Attribute):
            if node.func.attr in BLOCKED_ATTRS:
                self.errors.append(f"Attribute access '.{node.func.attr}' is not allowed.")
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute):
        if node.attr in BLOCKED_ATTRS:
            self.errors.append(f"Attribute access '.{node.attr}' is not allowed.")
        self.generic_visit(node)


def validate_code(code: str) -> tuple[bool, Optional[str]]:
    """
    Validate that the code is safe to execute.
    Returns (is_safe, error_message).
    """
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return False, f"Syntax error: {e}"

    validator = CodeValidator()
    validator.visit(tree)

    if validator.errors:
        return False, "; ".join(validator.errors)

    return True, None
