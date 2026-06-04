/**
 * Google Workspace services for Google Drive and Google Docs integrations.
 */

interface GoogleDocItem {
  title: string;
  issuer: string;
  issueDate: string;
  category: string;
  summary: string;
  keyDetails: string[];
}

/**
 * Uploads a PDF blob directly to Google Drive via the multipart/related endpoint.
 */
export async function uploadPdfToGoogleDrive(
  accessToken: string,
  pdfBlob: Blob,
  fileName: string
): Promise<{ id: string; url: string }> {
  const metadata = {
    name: fileName,
    mimeType: "application/pdf"
  };

  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const close_delim = `\r\n--${boundary}--`;

  // Read the PDF Blob as an ArrayBuffer
  const arrayBuffer = await pdfBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  
  // Construct body parts
  const metadataStr = JSON.stringify(metadata);
  const header = 
    `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${metadataStr}${delimiter}Content-Type: application/pdf\r\n\r\n`;
  const footer = `\r\n${close_delim}`;

  const encoder = new TextEncoder();
  const headerBytes = encoder.encode(header);
  const footerBytes = encoder.encode(footer);

  // Combine bytes securely
  const body = new Uint8Array(headerBytes.length + bytes.length + footerBytes.length);
  body.set(headerBytes, 0);
  body.set(bytes, headerBytes.length);
  body.set(footerBytes, headerBytes.length + bytes.length);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      body: body
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Upload na Google Disk selhal: ${errText}`);
  }

  const data = await response.json();
  return {
    id: data.id,
    url: `https://drive.google.com/file/d/${data.id}/view`
  };
}

/**
 * Creates a digitalized document in Google Docs with elegant structure and bold subtitles.
 */
export async function createGoogleDocFromDocument(
  accessToken: string,
  docItem: GoogleDocItem
): Promise<{ id: string; url: string }> {
  // 1. Create a blank Google Doc
  const createResponse = await fetch("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      title: `${docItem.title} - Digitalizováno`
    })
  });

  if (!createResponse.ok) {
    const errText = await createResponse.text();
    throw new Error(`Nepodařilo se vytvořit Google Dokument: ${errText}`);
  }

  const blankDoc = await createResponse.json();
  const documentId = blankDoc.documentId;

  // 2. Format content rules
  let content = "";
  content += `${docItem.title.toUpperCase()}\n`;
  content += `Vystavitel: ${docItem.issuer}\n`;
  content += `Datum doložení: ${docItem.issueDate}\n`;
  content += `Kategorie: ${docItem.category}\n\n`;
  
  if (docItem.summary) {
    content += `AI SHRNUTÍ OBSAHU\n`;
    content += `${docItem.summary}\n\n`;
  }

  if (docItem.keyDetails && docItem.keyDetails.length > 0) {
    content += `KLÍČOVÉ PARAMETRY\n`;
    docItem.keyDetails.forEach(detail => {
      content += `• ${detail}\n`;
    });
  }

  // 3. BatchUpdate to insert and format text beautifully
  const requests = [
    {
      insertText: {
        location: { index: 1 },
        text: content
      }
    },
    // Set style for title
    {
      updateTextStyle: {
        range: {
          startIndex: 1,
          endIndex: docItem.title.length + 1
        },
        textStyle: {
          bold: true,
          fontSize: {
            size: {
              magnitude: 18,
              unit: "PT"
            }
          },
          foregroundColor: {
            color: {
              rgbColor: {
                red: 0.035,
                green: 0.588,
                blue: 0.439
              }
            }
          }
        },
        fields: "bold,fontSize,foregroundColor"
      }
    }
  ];

  const updateResponse = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ requests })
  });

  if (!updateResponse.ok) {
    console.warn("Chyba při stylování vytvořeného Google Dokumentu, vrácena obyčejná verze.");
  }

  return {
    id: documentId,
    url: `https://docs.google.com/document/d/${documentId}/edit`
  };
}

/**
 * Searches for 'dokladovka_sync_data.json' in Google Drive.
 * Returns the file ID if found, otherwise null.
 */
export async function findSyncFile(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=name='dokladovka_sync_data.json' and trashed=false&fields=files(id)",
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  } catch (error) {
    console.error("Error finding sync file on Google Drive:", error);
  }
  return null;
}

/**
 * Downloads receipt and document data from 'dokladovka_sync_data.json' on Google Drive.
 */
export async function downloadUserDataFromGoogleDrive(
  accessToken: string,
  fileId: string
): Promise<{ receipts: any[]; documents: any[] } | null> {
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error("Nelze načíst záložní data");
    return await res.json();
  } catch (error) {
    console.error("Error downloading sync file from Google Drive:", error);
    return null;
  }
}

/**
 * Saves/updates user data to 'dokladovka_sync_data.json' on Google Drive.
 */
export async function saveUserDataToGoogleDrive(
  accessToken: string,
  data: { receipts: any[]; documents: any[] }
): Promise<string> {
  // Try to find file first
  let fileId = await findSyncFile(accessToken);
  
  if (!fileId) {
    // Create new file metadata
    const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "dokladovka_sync_data.json",
        mimeType: "application/json"
      })
    });
    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`Failed to create sync file metadata: ${err}`);
    }
    const file = await createRes.json();
    fileId = file.id;
  }

  // Upload file content
  const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Failed to upload sync file content: ${err}`);
  }

  return fileId!;
}

