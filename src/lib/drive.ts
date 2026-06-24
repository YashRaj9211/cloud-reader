import { SyncData } from '../types';

/**
 * Searches for 'cloud_pdf_reader_sync.json' in Google Drive.
 * Under 'drive.file' scope, it will only find files created by this application.
 */
export async function findSyncFile(token: string): Promise<string | null> {
  const searchQuery = encodeURIComponent("name = 'cloud_pdf_reader_sync.json' and trashed = false");
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${searchQuery}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

/**
 * Downloads the JSON sync metadata.
 */
export async function downloadSyncData(token: string, fileId: string): Promise<SyncData> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error('Failed to download sync metadata.');
  }
  return await res.json();
}

/**
 * Creates a new sync metadata JSON file in Google Drive.
 */
export async function createSyncFile(token: string, syncData: SyncData): Promise<string> {
  const boundary = 'cloud_pdf_reader_boundary';
  const metadata = {
    name: 'cloud_pdf_reader_sync.json',
    mimeType: 'application/json',
  };
  const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const mediaPartHeader = `--${boundary}\r\nContent-Type: application/json\r\n\r\n`;
  const mediaPartFooter = `\r\n--${boundary}--`;

  const blob = new Blob([
    metadataPart,
    mediaPartHeader,
    JSON.stringify(syncData),
    mediaPartFooter
  ], { type: `multipart/related; boundary=${boundary}` });

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: blob,
  });

  if (!res.ok) {
    throw new Error('Failed to create sync metadata file: ' + await res.text());
  }
  const data = await res.json();
  return data.id;
}

/**
 * Updates an existing sync metadata JSON file in Google Drive.
 */
export async function updateSyncFile(token: string, fileId: string, syncData: SyncData): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(syncData),
  });
  if (!res.ok) {
    throw new Error('Failed to update sync metadata: ' + await res.text());
  }
}

/**
 * Lists PDF files uploaded or opened by this app in Google Drive.
 */
export async function listPdfsInDrive(token: string): Promise<any[]> {
  const searchQuery = encodeURIComponent("mimeType = 'application/pdf' and trashed = false");
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${searchQuery}&fields=files(id,name,size,createdTime,modifiedTime)&orderBy=modifiedTime desc`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error('Failed to fetch file list: ' + await res.text());
  }
  const data = await res.json();
  return data.files || [];
}

/**
 * Downloads a PDF file's binary content.
 */
export async function downloadPdfBytes(token: string, fileId: string): Promise<ArrayBuffer> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error('Failed to download document content: ' + await res.text());
  }
  return await res.arrayBuffer();
}

/**
 * Uploads a regular local PDF file to the user's Google Drive.
 */
export async function uploadFileToDrive(token: string, file: File): Promise<string> {
  // 1. Initiate a resumable upload session
  const metadata = {
    name: file.name,
    mimeType: file.type || 'application/pdf',
  };

  const initRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': file.type || 'application/pdf',
      'X-Upload-Content-Length': file.size.toString(),
    },
    body: JSON.stringify(metadata),
  });

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`Failed to initiate upload session: ${errText}`);
  }

  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) {
    throw new Error('Upload session location URL is missing from response headers.');
  }

  // 2. Perform the upload to the session URI
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/pdf',
    },
    body: file,
  });

  if (!putRes.ok) {
    const errText = await putRes.text();
    throw new Error(`Failed to upload file content: ${errText}`);
  }

  const data = await putRes.json();
  return data.id; // Returns Google Drive file ID
}

/**
 * Deletes a file from Google Drive.
 */
export async function deleteFileFromDrive(token: string, fileId: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error('Failed to delete file from Google Drive: ' + await res.text());
  }
}
