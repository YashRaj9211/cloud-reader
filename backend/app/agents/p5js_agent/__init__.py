"""
P5.js Agent Package
===================
Exports the p5.js animation agent, prompt instructions, and factory function.
"""

from app.agents.p5js_agent.agent import create_p5js_agent, p5js_agent
from app.agents.p5js_agent.prompts import P5JS_AGENT_INSTRUCTION

__all__ = [
    "p5js_agent",
    "create_p5js_agent",
    "P5JS_AGENT_INSTRUCTION",
]
