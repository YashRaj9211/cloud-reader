"""
Root Agent Package
"""

from app.agents.root_agent.agent import create_root_agent, root_agent
from app.agents.root_agent.prompts import ROOT_AGENT_INSTRUCTION

__all__ = [
    "root_agent",
    "create_root_agent",
    "ROOT_AGENT_INSTRUCTION",
]
