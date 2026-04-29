import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export async function exportNodeToPdf(node: HTMLElement, filename: string) {
  const canvas = await html2canvas(node, {
    backgroundColor: "#0d0f1a",
    scale: 2,
    useCORS: true,
    logging: false,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const imgW = pageW - margin * 2;
  const imgH = (canvas.height * imgW) / canvas.width;

  let heightLeft = imgH;
  let yPos = margin;

  pdf.addImage(imgData, "PNG", margin, yPos, imgW, imgH);
  heightLeft -= pageH - margin * 2;

  while (heightLeft > 0) {
    yPos = heightLeft - imgH + margin;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", margin, yPos, imgW, imgH);
    heightLeft -= pageH - margin * 2;
  }

  pdf.save(filename);
}
