import { jsPDF } from "jspdf";

interface ReceiptItem {
  name: string;
  price: number;
}

interface Receipt {
  id: string;
  shopName: string;
  totalAmount: number;
  date: string;
  category: string;
  items: ReceiptItem[];
}

interface DocumentItem {
  id: string;
  title: string;
  issuer: string;
  issueDate: string;
  category: string;
  summary: string;
  keyDetails: string[];
}

// Fail-safe diacritics removal for standard PDF Helvetica font compatibility
export function sanitizeText(text: string): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^\x00-\x7F]/g, ""); // strip any remaining non-ascii characters to prevent pdf crash
}

/**
 * Cleanly exports a formatted PDF report of expenses (Receipts) for a chosen period.
 */
export function exportExpensesToPDF(
  receipts: Receipt[],
  startDate: string,
  endDate: string,
  totalSpent: number
) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const periodStr = `${startDate ? new Date(startDate).toLocaleDateString("cs-CZ") : "pocatek"} - ${
    endDate ? new Date(endDate).toLocaleDateString("cs-CZ") : "soucasnost"
  }`;

  // Color theme: Deep Indigo slates
  const PRIMARY_COLOR = [79, 70, 229]; // Indigo-600 #4f46e5
  const SECONDARY_COLOR = [100, 116, 139]; // Slate-500
  const TEXT_DARK = [15, 23, 42]; // Slate-900
  const ROW_BG = [248, 250, 252]; // Slate-50

  // Title page & Header Banner
  doc.rect(0, 0, 210, 40, "F");
  doc.setFillColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
  doc.rect(0, 0, 210, 38, "F");

  // Title Text
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(sanitizeText("PREHLED VÝDAJU A UTENCK"), 14, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(sanitizeText(`Exportovane období: ${periodStr}`), 14, 25);
  doc.text(sanitizeText(`Vygenerováno dne: ${new Date().toLocaleDateString("cs-CZ")}`), 14, 30);

  // Summary Metadata Panel
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(sanitizeText("SOUHRNNÉ STATISTIKY"), 14, 52);

  // Line separator
  doc.setDrawColor(226, 232, 240);
  doc.line(14, 55, 196, 55);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  // Stats boxes
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, 59, 56, 22, 2, 2, "F");
  doc.setTextColor(SECONDARY_COLOR[0], SECONDARY_COLOR[1], SECONDARY_COLOR[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(sanitizeText("CELKOVÁ ÚTRATA"), 18, 65);
  doc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
  doc.setFontSize(14);
  doc.text(`${totalSpent.toLocaleString("cs-CZ")} Kc`, 18, 74);

  doc.setFillColor(241, 245, 249);
  doc.roundedRect(77, 59, 56, 22, 2, 2, "F");
  doc.setTextColor(SECONDARY_COLOR[0], SECONDARY_COLOR[1], SECONDARY_COLOR[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(sanitizeText("POCET ÚTCENEK"), 81, 65);
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.setFontSize(14);
  doc.text(`${receipts.length} ks`, 81, 74);

  doc.setFillColor(241, 245, 249);
  doc.roundedRect(140, 59, 56, 22, 2, 2, "F");
  doc.setTextColor(SECONDARY_COLOR[0], SECONDARY_COLOR[1], SECONDARY_COLOR[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(sanitizeText("PRUMERNÝ NÁKUP"), 144, 65);
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.setFontSize(14);
  const avg = receipts.length > 0 ? Math.round(totalSpent / receipts.length) : 0;
  doc.text(`${avg.toLocaleString("cs-CZ")} Kc`, 144, 74);

  // List of receipts
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(sanitizeText("ZOZNAM POLOŽEK"), 14, 95);

  doc.line(14, 98, 196, 98);

  // Draw Table Header
  doc.setFillColor(241, 245, 249);
  doc.rect(14, 103, 182, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.text(sanitizeText("Datum"), 16, 108);
  doc.text(sanitizeText("Obchod / Poskytovatel"), 42, 108);
  doc.text(sanitizeText("Kategorie"), 110, 108);
  doc.text(sanitizeText("Cástka"), 192, 108, { align: "right" });

  let currentY = 111;

  receipts.forEach((receipt, index) => {
    // Check if we need a new page
    if (currentY > 265) {
      doc.addPage();
      currentY = 20;

      // Repeat Table Header
      doc.setFillColor(241, 245, 249);
      doc.rect(14, currentY, 182, 8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
      doc.text(sanitizeText("Datum"), 16, currentY + 5);
      doc.text(sanitizeText("Obchod / Poskytovatel"), 42, currentY + 5);
      doc.text(sanitizeText("Kategorie"), 110, currentY + 5);
      doc.text(sanitizeText("Cástka"), 192, currentY + 5, { align: "right" });
      currentY += 10;
    }

    // Zebra striping
    if (index % 2 === 1) {
      doc.setFillColor(ROW_BG[0], ROW_BG[1], ROW_BG[2]);
      doc.rect(14, currentY, 182, 7, "F");
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);

    doc.text(new Date(receipt.date).toLocaleDateString("cs-CZ"), 16, currentY + 4.5);
    doc.text(sanitizeText(receipt.shopName), 42, currentY + 4.5);
    doc.text(sanitizeText(receipt.category), 110, currentY + 4.5);
    doc.setFont("helvetica", "bold");
    doc.text(`${receipt.totalAmount.toLocaleString("cs-CZ")} Kc`, 192, currentY + 4.5, { align: "right" });

    currentY += 7;

    // Sub-items list if they exist
    if (receipt.items && receipt.items.length > 0) {
      receipt.items.forEach((item) => {
        if (currentY > 275) {
          doc.addPage();
          currentY = 20;
        }
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.5);
        doc.setTextColor(SECONDARY_COLOR[0], SECONDARY_COLOR[1], SECONDARY_COLOR[2]);
        doc.text(`- ${sanitizeText(item.name)}`, 46, currentY + 3);
        doc.text(`${item.price.toLocaleString("cs-CZ")} Kc`, 192, currentY + 3, { align: "right" });
        currentY += 5;
      });
      currentY += 2; // small gap
    }
  });

  // Footer page number and reference list size
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(SECONDARY_COLOR[0], SECONDARY_COLOR[1], SECONDARY_COLOR[2]);
    doc.text(
      sanitizeText(`Strana ${i} z ${pageCount} | Vygenerovano aplikací Inteligentní Úctenky`),
      105,
      287,
      { align: "center" }
    );
  }

  doc.save(`Prehled_Vydaju_${startDate || "vse"}_do_${endDate || "dnes"}.pdf`);
}

/**
 * Cleanly exports a formatted PDF report of Documents for archiving.
 */
export function exportDocumentsToPDF(
  documents: DocumentItem[],
  startDate: string,
  endDate: string
) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const periodStr = `${startDate ? new Date(startDate).toLocaleDateString("cs-CZ") : "pocatek"} - ${
    endDate ? new Date(endDate).toLocaleDateString("cs-CZ") : "soucasnost"
  }`;

  // Colors: Emerald-teal style for documents
  const PRIMARY_COLOR = [9, 150, 112]; // Teal-600
  const SECONDARY_COLOR = [100, 116, 139]; // Slate-500
  const TEXT_DARK = [15, 23, 42]; // Slate-900

  // Title page & Header Banner
  doc.rect(0, 0, 210, 40, "F");
  doc.setFillColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
  doc.rect(0, 0, 210, 38, "F");

  // Title Text
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(sanitizeText("ARCHIV OSOBNÍCH DOKUMENTU"), 14, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(sanitizeText(`Zvolené období: ${periodStr}`), 14, 25);
  doc.text(sanitizeText(`Počet dokumentů v archivu: ${documents.length} ks`), 14, 30);

  let currentY = 52;

  if (documents.length === 0) {
    doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(12);
    doc.text(sanitizeText("Žádné dokumenty neodpovídají zvolenému období."), 14, currentY);
  } else {
    documents.forEach((document, index) => {
      // Check space needed for single document block setup (usually ~50-60mm)
      if (currentY > 235) {
        doc.addPage();
        currentY = 20;
      }

      // Card boundary line
      doc.setDrawColor(226, 232, 240);
      doc.line(14, currentY, 196, currentY);
      currentY += 6;

      // Document Title & Category Tag
      doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(sanitizeText(`${index + 1}. ${document.title}`), 14, currentY);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setFillColor(241, 245, 249);
      const catText = `Kategorie: ${document.category}`;
      const textWidth = doc.getTextWidth(sanitizeText(catText));
      doc.rect(196 - textWidth - 4, currentY - 4, textWidth + 4, 5.5, "F");
      doc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
      doc.text(sanitizeText(catText), 196 - textWidth - 2, currentY);

      currentY += 6;

      // Meta (Date, Issuer, ID)
      doc.setTextColor(SECONDARY_COLOR[0], SECONDARY_COLOR[1], SECONDARY_COLOR[2]);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      const metaStr = `Vydavatel: ${document.issuer}  |  Vydáno: ${new Date(
        document.issueDate
      ).toLocaleDateString("cs-CZ")}  |  ID: ${document.id}`;
      doc.text(sanitizeText(metaStr), 14, currentY);

      currentY += 6;

      // Summary Box
      if (document.summary) {
        // Multi-line summary
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, currentY, 182, 14, 1.5, 1.5, "F");
        doc.setTextColor(47, 55, 78);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        const splitSummary = doc.splitTextToSize(
          sanitizeText(`AI Shrnutí: ${document.summary}`),
          176
        );
        doc.text(splitSummary, 17, currentY + 4.5);
        currentY += 18;
      }

      // Key Details
      if (document.keyDetails && document.keyDetails.length > 0) {
        doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.text(sanitizeText("Klíčové parametry:"), 14, currentY);
        currentY += 4.5;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        document.keyDetails.forEach((detail) => {
          if (currentY > 275) {
            doc.addPage();
            currentY = 20;
          }
          doc.text(`   [x]  ${sanitizeText(detail)}`, 14, currentY);
          currentY += 4;
        });
      }

      currentY += 8; // Spacer between cards
    });
  }

  // Footer page numbering
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(SECONDARY_COLOR[0], SECONDARY_COLOR[1], SECONDARY_COLOR[2]);
    doc.text(
      sanitizeText(`Strana ${i} z ${pageCount} | Vygenerovano aplikaci Inteligentní Úctenky`),
      105,
      287,
      { align: "center" }
    );
  }

  doc.save(`Archiv_Dokumentu_${startDate || "vse"}_do_${endDate || "dnes"}.pdf`);
}
