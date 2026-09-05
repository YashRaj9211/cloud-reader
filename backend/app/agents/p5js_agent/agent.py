"""
P5.js Agent Definition
======================
Defines the specialized LlmAgent for generating p5.js animations, simulations,
and interactive visual explanations, equipped with the p5js skill.
"""

import logging
import os
from google.adk.agents import LlmAgent
from google.adk.skills import load_skills_from_dir
from google.adk.tools.skill_toolset import SkillToolset

from app.agents.chat_agent.agent import create_llm_model
from app.agents.p5js_agent.prompts import P5JS_AGENT_INSTRUCTION

logger = logging.getLogger(__name__)


def create_p5js_agent() -> LlmAgent:
    """
    Initializes the p5.js animation agent equipped with the p5js SkillToolset.
    The skill provides direct access to p5.js creative coding guidelines,
    animation techniques, and reference architectures.
    """
    llm = create_llm_model()

    # Locate the skills directory relative to this agent
    skills_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "skills")
    tools = []

    try:
        if os.path.exists(skills_dir):
            skills = load_skills_from_dir(skills_dir)
            if skills:
                skill_toolset = SkillToolset(skills=skills)
                tools.append(skill_toolset)
                logger.info("P5.js agent successfully loaded %d skill(s) from %s", len(skills), skills_dir)
            else:
                logger.warning("No skills found in %s for p5js agent", skills_dir)
        else:
            logger.warning("Skills directory does not exist: %s", skills_dir)
    except Exception as e:
        logger.error("Failed to load skills for p5js agent: %s", e, exc_info=True)

    return LlmAgent(
        name="p5js_agent",
        model=llm,
        instruction=P5JS_AGENT_INSTRUCTION,
        description=(
            "Specialist agent that builds creative, interactive, and educational "
            "p5.js animations, simulations, and visual explanations using the p5js skill."
        ),
        tools=tools,
    )


# Default p5js agent instance
p5js_agent = create_p5js_agent()
