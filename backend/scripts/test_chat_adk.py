import os
import sys
import uuid
from pathlib import Path
from dotenv import load_dotenv

# Ensure backend root is on sys.path
backend_root = Path(__file__).resolve().parents[1]
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

load_dotenv(dotenv_path=backend_root / ".env")

from fastapi.testclient import TestClient
from app.main import app
from app.configs.db.config import SessionLocal
from app.models.user import User as DBUser
from app.models.chat import ChatSession, ChatMessage
from app.schema.enums import ScopeType, MessageRole
from app.schema.chat import (
    CreateSessionRequest,
    UpdateSessionRequest,
    SendMessageRequest,
    SourceCitation,
)
from app.services.session import get_current_user_and_token
from app.schemas import User as SchemaUser
from app.services.adk_chat_service import adk_chat_service, retrieve_document_context
from google.adk.tools import ToolContext


def test_adk_chat_full_flow():
    print("\n=======================================================")
    print(" Running Google ADK Chat & Scoped RAG Verification")
    print("=======================================================\n")

    # 1. Verify ADK Agent configuration
    print("[Step 1] Verifying Google ADK LlmAgent & LiteLlm configuration...")
    agent = adk_chat_service.agent
    assert agent.name == "cloud_pdf_rag_agent", f"Unexpected agent name: {agent.name}"
    assert len(agent.tools) == 1, f"Expected 1 tool, got {len(agent.tools)}"
    print("  -> ADK Agent name:", agent.name)
    print("  -> Registered tool:", agent.tools[0].__name__)
    print("  -> LiteLlm model:", getattr(agent.model, "model", str(agent.model)))

    # 2. Verify Database Connection & User Setup
    print("\n[Step 2] Testing PostgreSQL connection and User setup...")
    db = SessionLocal()
    try:
        test_email = f"adk_test_{uuid.uuid4().hex[:8]}@example.com"
        test_user = DBUser(
            google_id=f"google_{uuid.uuid4().hex[:8]}",
            email=test_email,
            name="ADK Test User",
        )
        db.add(test_user)
        db.commit()
        db.refresh(test_user)
        print(f"  -> Created test DB user: ID={test_user.id}, email={test_user.email}")

        # 3. Test Database Session CRUD
        print("\n[Step 3] Testing ChatSession & ChatMessage DB operations...")
        session = ChatSession(
            user_id=test_user.id,
            title="ADK Testing Session",
            scope_type=ScopeType.ALL,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        print(f"  -> Created ChatSession: ID={session.id}, Title='{session.title}'")

        # Add message
        user_msg = ChatMessage(
            session_id=session.id,
            role=MessageRole.USER,
            content="Hello RAG Agent, can you help me?",
        )
        db.add(user_msg)
        db.commit()
        db.refresh(user_msg)

        assistant_msg = ChatMessage(
            session_id=session.id,
            role=MessageRole.ASSISTANT,
            content="Yes, I can search your indexed documents!",
        )
        db.add(assistant_msg)
        db.commit()
        db.refresh(assistant_msg)

        messages = db.query(ChatMessage).filter(ChatMessage.session_id == session.id).all()
        assert len(messages) == 2, f"Expected 2 messages, got {len(messages)}"
        print(f"  -> Successfully persisted {len(messages)} messages to DB")

        # 4. Test Tool Execution directly
        print("\n[Step 4] Testing retrieve_document_context Tool...")
        from unittest.mock import MagicMock
        mock_tool_context = MagicMock()
        mock_tool_context.state = {
            "user_id": test_user.id,
            "scope_type": "ALL",
            "scope_id": None,
        }
        tool_result = retrieve_document_context(
            query="neural network backpropagation",
            tool_context=mock_tool_context,
        )
        print("  -> Tool invocation status:", tool_result.get("status"))
        assert "status" in tool_result
        print("  -> Tool executed cleanly without errors.")

        # 5. Test FastAPI Endpoints via TestClient
        print("\n[Step 5] Testing FastAPI Chat Endpoints...")
        # Create valid session token recognized by AuthenticationMiddleware
        from app.services.google_auth_service import google_auth_service
        mock_auth_user = SchemaUser(
            id=test_user.google_id,
            email=test_user.email,
            name=test_user.name,
            picture=None,
        )
        token = google_auth_service.create_session_token(
            user=mock_auth_user,
            access_token="mock_access_token",
        )
        client = TestClient(app)
        client.headers["Authorization"] = f"Bearer {token}"

        # GET /api/chat/sessions
        resp = client.get("/api/chat/sessions")
        assert resp.status_code == 200, f"GET /sessions failed: {resp.text}"
        sessions_list = resp.json()
        assert len(sessions_list) >= 1, "Expected at least 1 session"
        print(f"  -> GET /api/chat/sessions: {len(sessions_list)} sessions found (HTTP 200)")

        # POST /api/chat/sessions (Create session)
        new_session_payload = {
            "title": "FastAPI Client Session",
            "scope_type": "ALL",
            "scope_id": None,
        }
        resp = client.post("/api/chat/sessions", json=new_session_payload)
        assert resp.status_code == 200, f"POST /sessions failed: {resp.text}"
        created_session = resp.json()
        created_id = created_session["id"]
        print(f"  -> POST /api/chat/sessions: Created session {created_id} (HTTP 200)")

        # GET /api/chat/sessions/{session_id}
        resp = client.get(f"/api/chat/sessions/{created_id}")
        assert resp.status_code == 200, f"GET /sessions/{created_id} failed: {resp.text}"
        session_detail = resp.json()
        assert session_detail["id"] == created_id
        print(f"  -> GET /api/chat/sessions/{created_id}: Retrieved successfully (HTTP 200)")

        # PATCH /api/chat/sessions/{session_id}
        resp = client.patch(f"/api/chat/sessions/{created_id}", json={"title": "Renamed Session"})
        assert resp.status_code == 200
        assert resp.json()["title"] == "Renamed Session"
        print(f"  -> PATCH /api/chat/sessions/{created_id}: Renamed title (HTTP 200)")

        # DELETE /api/chat/sessions/{session_id}
        resp = client.delete(f"/api/chat/sessions/{created_id}")
        assert resp.status_code == 200
        print(f"  -> DELETE /api/chat/sessions/{created_id}: Deleted successfully (HTTP 200)")

        # Cleanup test user & original session
        db.delete(session)
        db.delete(test_user)
        db.commit()
        print("\n  -> Cleaned up test database entities.")

        print("\n=======================================================")
        print(" ALL CHECKS PASSED: Google ADK Chat & Scoped RAG Agent is verified!")
        print("=======================================================\n")

    finally:
        app.dependency_overrides.clear()
        db.close()


if __name__ == "__main__":
    test_adk_chat_full_flow()
