import json
import urllib.parse
from typing import Optional, List, Dict, Any, Tuple
import httpx
from app.schemas import SyncData, BookProgress, Book


class GoogleDriveService:
    @staticmethod
    async def find_sync_file(token: str) -> Optional[str]:
        search_query = urllib.parse.quote("name = 'cloud_pdf_reader_sync.json' and trashed = false")
        url = f"https://www.googleapis.com/drive/v3/files?q={search_query}&fields=files(id)"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
            if resp.status_code != 200:
                return None
            data = resp.json()
            files = data.get("files", [])
            if files:
                return files[0]["id"]
            return None

    @staticmethod
    async def download_sync_data(token: str, file_id: str) -> SyncData:
        url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
            if resp.status_code != 200:
                raise Exception(f"Failed to download sync metadata: {resp.text}")
            try:
                data = resp.json()
                # Parse into SyncData schema
                books = {}
                for b_id, b_progress in data.get("books", {}).items():
                    books[b_id] = BookProgress(**b_progress)
                return SyncData(books=books)
            except Exception as e:
                return SyncData(books={})

    @staticmethod
    async def create_sync_file(token: str, sync_data: SyncData) -> str:
        boundary = "cloud_pdf_reader_boundary"
        metadata = {
            "name": "cloud_pdf_reader_sync.json",
            "mimeType": "application/json",
        }
        meta_json = json.dumps(metadata)
        body_json = json.dumps(sync_data.model_dump())

        parts = [
            f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta_json}\r\n",
            f"--{boundary}\r\nContent-Type: application/json\r\n\r\n{body_json}\r\n",
            f"--{boundary}--\r\n",
        ]
        body = "".join(parts).encode("utf-8")

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": f"multipart/related; boundary={boundary}",
                },
                content=body,
            )
            if resp.status_code not in (200, 201):
                raise Exception(f"Failed to create sync metadata file: {resp.text}")
            return resp.json()["id"]

    @staticmethod
    async def update_sync_file(token: str, file_id: str, sync_data: SyncData) -> None:
        body = json.dumps(sync_data.model_dump()).encode("utf-8")
        url = f"https://www.googleapis.com/upload/drive/v3/files/{file_id}?uploadType=media"
        async with httpx.AsyncClient() as client:
            resp = await client.patch(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                content=body,
            )
            if resp.status_code != 200:
                raise Exception(f"Failed to update sync metadata: {resp.text}")

    @staticmethod
    async def find_or_create_sync_file(token: str) -> Tuple[str, SyncData]:
        file_id = await GoogleDriveService.find_sync_file(token)
        if file_id:
            try:
                sync_data = await GoogleDriveService.download_sync_data(token, file_id)
                return file_id, sync_data
            except Exception:
                sync_data = SyncData(books={})
                return file_id, sync_data
        else:
            sync_data = SyncData(books={})
            new_file_id = await GoogleDriveService.create_sync_file(token, sync_data)
            return new_file_id, sync_data

    @staticmethod
    async def list_pdf_files(token: str) -> List[Dict[str, Any]]:
        search_query = urllib.parse.quote("mimeType = 'application/pdf' and trashed = false")
        url = f"https://www.googleapis.com/drive/v3/files?q={search_query}&fields=files(id,name,size,createdTime,modifiedTime)&orderBy=modifiedTime desc"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
            if resp.status_code != 200:
                raise Exception(f"Failed to fetch file list: {resp.text}")
            data = resp.json()
            return data.get("files", [])

    @staticmethod
    async def download_pdf_content(token: str, file_id: str) -> bytes:
        url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
            if resp.status_code != 200:
                raise Exception(f"Failed to download PDF content: {resp.text}")
            return resp.content

    @staticmethod
    async def upload_pdf_file(token: str, filename: str, content_type: str, file_bytes: bytes) -> str:
        boundary = "cloud_pdf_reader_upload_boundary"
        metadata = {
            "name": filename,
            "mimeType": content_type or "application/pdf",
        }
        meta_json = json.dumps(metadata)
        meta_part = f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta_json}\r\n".encode("utf-8")
        media_header = f"--{boundary}\r\nContent-Type: {content_type or 'application/pdf'}\r\n\r\n".encode("utf-8")
        media_footer = f"\r\n--{boundary}--\r\n".encode("utf-8")

        body = meta_part + media_header + file_bytes + media_footer

        url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart"
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": f"multipart/related; boundary={boundary}",
                },
                content=body,
            )
            if resp.status_code not in (200, 201):
                raise Exception(f"Failed to upload PDF file: {resp.text}")
            return resp.json()["id"]

    @staticmethod
    async def delete_file(token: str, file_id: str) -> None:
        url = f"https://www.googleapis.com/drive/v3/files/{file_id}"
        async with httpx.AsyncClient() as client:
            resp = await client.delete(url, headers={"Authorization": f"Bearer {token}"})
            if resp.status_code not in (200, 204):
                raise Exception(f"Failed to delete file from Google Drive: {resp.text}")


google_drive_service = GoogleDriveService()
