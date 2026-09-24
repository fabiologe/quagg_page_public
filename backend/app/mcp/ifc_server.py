"""IFC-Schema-MCP (stdio, fuer Claude Code lokal) — Fahrplan IFC-Konsistenz, Stufe 7.

  cd backend && app/mcp/.venv-mcp/bin/python -m app.mcp.ifc_server

Eingetragen in `.mcp.json` als `ifc`. Die Werkzeuge stehen in ifc_tools.py (rein,
getestet in backend/app/ifc/tests/test_mcp_werkzeuge.py); hier werden sie nur
angemeldet. Kein Remote-Betrieb: die Schema-Auskunft braucht keinen Connector.
"""

from fastmcp import FastMCP

from app.mcp import ifc_tools as W

ifc_mcp = FastMCP("ifc", instructions=W.ANLEITUNG)
for _werkzeug in W.WERKZEUGE:
    ifc_mcp.tool(_werkzeug)


def main() -> None:
    ifc_mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
