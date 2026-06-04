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
