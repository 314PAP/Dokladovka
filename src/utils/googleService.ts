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

const DRIVE_ROOT_FOLDER_NAME = "Dokladovka";

const CATEGORY_FOLDER_MAP: Record<string, string> = {
  "zdravotni": "zdravotni",
  "healthdoc": "zdravotni",
  "pracovni_urad": "pracovni_urad",
  "labor": "pracovni_urad",
  "socialni_zabezpeceni": "socialni_zabezpeceni",
  "socialdoc": "socialni_zabezpeceni",
  "smlouvy": "smlouvy",
  "contractdoc": "smlouvy",
  "ostatni": "ostatni",
  "otherdoc": "ostatni"
};

const ensureDriveFolder = async (accessToken: string, name: string, parentId?: string): Promise<string | null> => {
  const parentClause = parentId ? ` and '${parentId}' in parents` : "";
  const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentClause}`;
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (listRes.ok) {
    const data = await listRes.json();
    const existing = data.files && data.files[0];
    if (existing?.id) return existing.id;
  }

  const metadata: any = {
    name,
    mimeType: "application/vnd.google-apps.folder"
  };
  if (parentId) metadata.parents = [parentId];

  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(metadata)
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Nepodařilo se vytvořit složku ${name}: ${errText}`);
  }

  const created = await createRes.json();
  return created.id ?? null;
};

export const ensureDokladovkaStructure = async (accessToken: string): Promise<string | null> => {
  const rootId = await ensureDriveFolder(accessToken, DRIVE_ROOT_FOLDER_NAME);
  if (!rootId) return null;

  const categoryFolders = ["zdravotni", "pracovni_urad", "socialni_zabezpeceni", "smlouvy", "ostatni"];
  for (const folder of categoryFolders) {
    await ensureDriveFolder(accessToken, folder, rootId);
  }

  const zdravotniId = await ensureDriveFolder(accessToken, "zdravotni", rootId);
  if (zdravotniId) {
    await ensureDriveFolder(accessToken, "porizene_obrazky", zdravotniId);
  }

  const dokumentyId = await ensureDriveFolder(accessToken, "dokumenty", rootId);
  if (dokumentyId) {
    const docCategories = ["zdravotni", "pracovni_urad", "socialni_zabezpeceni", "smlouvy", "ostatni"];
    for (const cat of docCategories) {
      await ensureDriveFolder(accessToken, cat, dokumentyId);
    }
  }

  return rootId;
};

export const getDocumentCategoryFolderId = async (
  accessToken: string,
  category: string,
  rootId: string
): Promise<string | null> => {
  const normalized = category?.trim()?.toLowerCase().replace(/\s+/g, "_") || "ostatni";
  const mappedName = CATEGORY_FOLDER_MAP[normalized] || normalized;

  const dokumentyId = await ensureDriveFolder(accessToken, "dokumenty", rootId);
  if (!dokumentyId) return null;

  return ensureDriveFolder(accessToken, mappedName, dokumentyId);
};

const findExistingByName = async (
  accessToken: string,
  name: string,
  parentId: string
): Promise<string | null> => {
  const q = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.files && data.files[0] ? data.files[0].id : null;
};

export const uploadDocumentImageToDrive = async (
  accessToken: string,
  base64Image: string,
  title: string,
  issueDate: string,
  category: string
): Promise<{ id?: string; url?: string }> => {
  const rootId = await ensureDokladovkaStructure(accessToken);
  if (!rootId) throw new Error("Dokladovka root folder missing");

  const categoryId = await getDocumentCategoryFolderId(accessToken, category, rootId);
  if (!categoryId) throw new Error("Category folder missing");

  const safeTitle = (title || "dokument").replace(/[^a-zA-Z0-9áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ\-_. ]+/g, "").trim() || "dokument";
  const datePart = issueDate ? issueDate.replace(/-/g, "") : new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const fileName = `${datePart}-${safeTitle}.jpg`;

  const existingId = await findExistingByName(accessToken, fileName, categoryId);
  if (existingId) {
    return {
      id: existingId,
      url: `https://drive.google.com/file/d/${existingId}/view`
    };
  }

  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: "image/jpeg" });

  const metadata = {
    name: fileName,
    mimeType: "image/jpeg",
    parents: [categoryId]
  };

  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const close_delim = `\r\n--${boundary}--`;

  const metadataStr = JSON.stringify(metadata);
  const header =
    `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${metadataStr}${delimiter}Content-Type: image/jpeg\r\n\r\n`;
  const footer = `\r\n${close_delim}`;

  const encoder = new TextEncoder();
  const headerBytes = encoder.encode(header);
  const footerBytes = encoder.encode(footer);

  const body = new Uint8Array(headerBytes.length + blob.size + footerBytes.length);
  body.set(headerBytes, 0);
  body.set(new Uint8Array(await blob.arrayBuffer()), headerBytes.length);
  body.set(footerBytes, headerBytes.length + blob.size);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      body
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
};

/**
 * Uploads a PDF blob directly to Google Drive via the multipart/related endpoint.
 * Saves to 'Dokladovka/dokumenty/[category]' folder structure.
 */
export async function uploadPdfToGoogleDrive(
  accessToken: string,
  pdfBlob: Blob,
  fileName: string,
  category?: string
): Promise<{ id: string; url: string }> {
  const rootId = await ensureDokladovkaStructure(accessToken);
  if (!rootId) throw new Error("Root folder Dokladovka missing");

  const targetCategoryId = await getDocumentCategoryFolderId(accessToken, category || "Zdravotní", rootId);
  if (!targetCategoryId) throw new Error("Category folder missing");

  const metadata = {
    name: fileName,
    mimeType: "application/pdf",
    parents: [targetCategoryId]
  };

  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const close_delim = `\r\n--${boundary}--`;

  const arrayBuffer = await pdfBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const metadataStr = JSON.stringify(metadata);
  const header =
    `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${metadataStr}${delimiter}Content-Type: application/pdf\r\n\r\n`;
  const footer = `\r\n${close_delim}`;

  const encoder = new TextEncoder();
  const headerBytes = encoder.encode(header);
  const footerBytes = encoder.encode(footer);
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

  const requests = [
    {
      insertText: {
        location: { index: 1 },
        text: content
      }
    },
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
 * Creates the folder structure on first save.
 */
export async function saveUserDataToGoogleDrive(
  accessToken: string,
  data: { receipts: any[]; documents: any[] }
): Promise<string> {
  const rootId = await ensureDokladovkaStructure(accessToken);
  if (!rootId) throw new Error("Root folder Dokladovka missing");

  const syncFolderId = await ensureDriveFolder(accessToken, "dokladovka_sync", rootId);
  if (!syncFolderId) throw new Error("Sync folder missing");

  let fileId = await findSyncFile(accessToken);

  if (!fileId) {
    const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "dokladovka_sync_data.json",
        mimeType: "application/json",
        parents: [syncFolderId]
      })
    });
    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`Failed to create sync file metadata: ${err}`);
    }
    const file = await createRes.json();
    fileId = file.id;
  }

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