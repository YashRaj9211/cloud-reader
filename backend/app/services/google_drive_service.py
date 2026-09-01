import json
import urllib.parse
from typing import Optional, List, Dict, Any, Tuple
import httpx
from app.schemas import SyncData, BookProgress, Book


DRIVE_HTTP_TIMEOUT = httpx.Timeout(connect=15.0, read=120.0, write=60.0, pool=15.0)


class GoogleDriveService:
    @staticmethod
    async def find_sync_file(token: str) -> Optional[str]:
        search_query = urllib.parse.quote("name = 'cloud_pdf_reader_sync.json' and trashed = false")
        url = f"https://www.googleapis.com/drive/v3/files?q={search_query}&fields=files(id)"
        async with httpx.AsyncClient(timeout=DRIVE_HTTP_TIMEOUT) as client:
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
        async with httpx.AsyncClient(timeout=DRIVE_HTTP_TIMEOUT) as client:
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
            except Exception:
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

        async with httpx.AsyncClient(timeout=DRIVE_HTTP_TIMEOUT) as client:
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
        async with httpx.AsyncClient(timeout=DRIVE_HTTP_TIMEOUT) as client:
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
    async def list_pdf_files(token: str, folder_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Lists PDF files from Google Drive.
        If folder_id is specified, lists PDFs inside that folder.
        """
        query_parts = ["mimeType = 'application/pdf'", "trashed = false"]
        if folder_id:
            query_parts.append(f"'{folder_id}' in parents")
        search_query = urllib.parse.quote(" and ".join(query_parts))

        url = (
            f"https://www.googleapis.com/drive/v3/files?q={search_query}"
            f"&fields=files(id,name,size,createdTime,modifiedTime,parents)"
            f"&orderBy=modifiedTime desc"
        )
        async with httpx.AsyncClient(timeout=DRIVE_HTTP_TIMEOUT) as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
            if resp.status_code != 200:
                raise Exception(f"Failed to fetch file list: {resp.text}")
            data = resp.json()
            return data.get("files", [])

    @staticmethod
    async def download_pdf_content(token: str, file_id: str) -> bytes:
        url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
        async with httpx.AsyncClient(timeout=DRIVE_HTTP_TIMEOUT) as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
            if resp.status_code != 200:
                raise Exception(f"Failed to download PDF content: {resp.text}")
            return resp.content

    @staticmethod
    async def upload_pdf_file(
        token: str,
        filename: str,
        content_type: str,
        file_bytes: bytes,
        parent_folder_id: Optional[str] = None,
    ) -> str:
        boundary = "cloud_pdf_reader_upload_boundary"
        metadata: Dict[str, Any] = {
            "name": filename,
            "mimeType": content_type or "application/pdf",
        }
        if parent_folder_id:
            metadata["parents"] = [parent_folder_id]

        meta_json = json.dumps(metadata)
        meta_part = f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta_json}\r\n".encode("utf-8")
        media_header = f"--{boundary}\r\nContent-Type: {content_type or 'application/pdf'}\r\n\r\n".encode("utf-8")
        media_footer = f"\r\n--{boundary}--\r\n".encode("utf-8")

        body = meta_part + media_header + file_bytes + media_footer

        url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart"
        async with httpx.AsyncClient(timeout=DRIVE_HTTP_TIMEOUT) as client:
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
        async with httpx.AsyncClient(timeout=DRIVE_HTTP_TIMEOUT) as client:
            resp = await client.delete(url, headers={"Authorization": f"Bearer {token}"})
            if resp.status_code not in (200, 204):
                raise Exception(f"Failed to delete file from Google Drive: {resp.text}")

    # ==========================================
    # Directory & Folder Management Methods
    # ==========================================

    @staticmethod
    async def list_folders(token: str, parent_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Lists Google Drive directories / folders.
        If parent_id is specified, lists subfolders inside parent_id.
        """
        query_parts = [
            "mimeType = 'application/vnd.google-apps.folder'",
            "trashed = false"
        ]
        if parent_id:
            query_parts.append(f"'{parent_id}' in parents")

        search_query = urllib.parse.quote(" and ".join(query_parts))
        url = (
            f"https://www.googleapis.com/drive/v3/files?q={search_query}"
            f"&fields=files(id,name,parents,createdTime,modifiedTime)"
            f"&orderBy=name"
        )
        async with httpx.AsyncClient(timeout=DRIVE_HTTP_TIMEOUT) as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
            if resp.status_code != 200:
                raise Exception(f"Failed to list directories: {resp.text}")
            data = resp.json()
            return data.get("files", [])

    @staticmethod
    async def get_folder(token: str, folder_id: str) -> Dict[str, Any]:
        """
        Gets details of a specific folder from Google Drive.
        """
        url = (
            f"https://www.googleapis.com/drive/v3/files/{folder_id}"
            f"?fields=id,name,parents,createdTime,modifiedTime"
        )
        async with httpx.AsyncClient(timeout=DRIVE_HTTP_TIMEOUT) as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
            if resp.status_code != 200:
                raise Exception(f"Failed to retrieve directory details: {resp.text}")
            return resp.json()

    @staticmethod
    async def create_folder(
        token: str,
        name: str,
        parent_folder_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Creates a new folder/directory in Google Drive.
        """
        metadata: Dict[str, Any] = {
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
        }
        if parent_folder_id:
            metadata["parents"] = [parent_folder_id]

        url = "https://www.googleapis.com/drive/v3/files?fields=id,name,parents,createdTime,modifiedTime"
        async with httpx.AsyncClient(timeout=DRIVE_HTTP_TIMEOUT) as client:
            resp = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json=metadata,
            )
            if resp.status_code not in (200, 201):
                raise Exception(f"Failed to create directory: {resp.text}")
            return resp.json()

    @staticmethod
    async def update_folder(
        token: str,
        folder_id: str,
        name: Optional[str] = None,
        parent_folder_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Renames or moves a folder in Google Drive.
        """
        params = {"fields": "id,name,parents,createdTime,modifiedTime"}
        body: Dict[str, Any] = {}
        if name:
            body["name"] = name

        url = f"https://www.googleapis.com/drive/v3/files/{folder_id}"
        async with httpx.AsyncClient(timeout=DRIVE_HTTP_TIMEOUT) as client:
            if parent_folder_id:
                # Fetch current parents to remove
                existing = await GoogleDriveService.get_folder(token, folder_id)
                prev_parents = ",".join(existing.get("parents", []))
                params["addParents"] = parent_folder_id
                if prev_parents:
                    params["removeParents"] = prev_parents

            resp = await client.patch(
                url,
                params=params,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json=body if body else None,
            )
            if resp.status_code != 200:
                raise Exception(f"Failed to update directory: {resp.text}")
            return resp.json()

    @staticmethod
    async def delete_folder(token: str, folder_id: str) -> None:
        """
        Deletes a folder/directory from Google Drive.
        """
        await GoogleDriveService.delete_file(token, folder_id)

    @staticmethod
    async def move_file_to_folder(
        token: str,
        file_id: str,
        target_folder_id: str,
    ) -> Dict[str, Any]:
        """
        Moves a file/book into a target folder in Google Drive.
        """
        # Retrieve existing parents to remove
        url_get = f"https://www.googleapis.com/drive/v3/files/{file_id}?fields=parents"
        async with httpx.AsyncClient(timeout=DRIVE_HTTP_TIMEOUT) as client:
            resp_get = await client.get(url_get, headers={"Authorization": f"Bearer {token}"})
            prev_parents = ""
            if resp_get.status_code == 200:
                prev_parents = ",".join(resp_get.json().get("parents", []))

            url_patch = f"https://www.googleapis.com/drive/v3/files/{file_id}"
            params = {
                "addParents": target_folder_id,
                "fields": "id,name,parents",
            }
            if prev_parents:
                params["removeParents"] = prev_parents

            resp_patch = await client.patch(
                url_patch,
                params=params,
                headers={"Authorization": f"Bearer {token}"},
            )
            if resp_patch.status_code != 200:
                raise Exception(f"Failed to move file to directory: {resp_patch.text}")
            return resp_patch.json()

    @staticmethod
    async def remove_file_from_folder(
        token: str,
        file_id: str,
        folder_id: str,
    ) -> Dict[str, Any]:
        """
        Removes a file/book from a folder in Google Drive.
        """
        url_patch = f"https://www.googleapis.com/drive/v3/files/{file_id}"
        params = {
            "removeParents": folder_id,
            "fields": "id,name,parents",
        }
        async with httpx.AsyncClient(timeout=DRIVE_HTTP_TIMEOUT) as client:
            resp_patch = await client.patch(
                url_patch,
                params=params,
                headers={"Authorization": f"Bearer {token}"},
            )
            if resp_patch.status_code != 200:
                raise Exception(f"Failed to remove file from directory: {resp_patch.text}")
            return resp_patch.json()


google_drive_service = GoogleDriveService()
