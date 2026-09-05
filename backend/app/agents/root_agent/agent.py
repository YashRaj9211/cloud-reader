"""
Root Agent Definition
=====================
Defines the master coordinator LlmAgent which manages sub-agents (e.g. chat_agent, and future agents).
"""

from google.adk.agents import LlmAgent
from google.adk.tools import AgentTool

from app.agents.chat_agent.agent import chat_agent, create_llm_model
from app.agents.p5js_agent.agent import p5js_agent
from app.agents.pdf_notes_agent.agent import pdf_notes_agent
from app.agents.root_agent.prompts import ROOT_AGENT_INSTRUCTION


def create_root_agent(sub_agents: list = None, tools: list = None) -> LlmAgent:
    """Creates the root coordinator agent equipped with registered sub-agents and tools."""
    if sub_agents is None:
        sub_agents = [chat_agent]

    if tools is None:
        # Equip root agent with p5js_agent and pdf_notes_agent as AgentTools
        tools = [
            AgentTool(agent=p5js_agent),
            AgentTool(agent=pdf_notes_agent),
        ]

    llm = create_llm_model()
    return LlmAgent(
        name="root_agent",
        model=llm,
        instruction=ROOT_AGENT_INSTRUCTION,
        description="Master coordinator agent for Cloud PDF Reader orchestrating specialized sub-agents and tools.",
        sub_agents=sub_agents,
        tools=tools,
    )


# Default root agent instance
root_agent = create_root_agent()
