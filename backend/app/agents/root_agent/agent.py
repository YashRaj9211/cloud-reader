"""
Root Agent Definition
=====================
Defines the master coordinator LlmAgent which manages sub-agents (e.g. chat_agent, and future agents).
"""

from google.adk.agents import LlmAgent

from app.agents.chat_agent.agent import chat_agent, create_llm_model
from app.agents.root_agent.prompts import ROOT_AGENT_INSTRUCTION


def create_root_agent(sub_agents: list = None) -> LlmAgent:
    """Creates the root coordinator agent equipped with registered sub-agents."""
    if sub_agents is None:
        sub_agents = [chat_agent]

    llm = create_llm_model()
    return LlmAgent(
        name="root_agent",
        model=llm,
        instruction=ROOT_AGENT_INSTRUCTION,
        description="Master coordinator agent for Cloud PDF Reader orchestrating specialized sub-agents.",
        sub_agents=sub_agents,
    )


# Default root agent instance
root_agent = create_root_agent()
