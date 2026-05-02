import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import QRCode from "qrcode";
import delfosLogo from "@/assets/delfos-logo.png";

type InfoLine = { label: string; value: string };

interface PrintPosterButtonProps {
  url: string;
  title: string;
  description?: string | null;
  subtitle?: string;
  infoLines?: InfoLine[];
  callToAction?: string;
  footerNote?: string;
  fileName?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  label?: string;
}

const PrintPosterButton = ({
  url,
  title,
  description,
  subtitle,
  infoLines = [],
  callToAction = "Aponte a câmera para o QR Code e participe!",
  footerNote = "Bolões inteligentes em delfos.app.br",
  fileName = "cartaz-delfos.pdf",
  variant = "outline",
  size = "sm",
  label = "Imprimir",
}: PrintPosterButtonProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const qrDataUrl = await QRCode.toDataURL(url, {
        errorCorrectionLevel: "H",
        margin: 1,
        width: 800,
        color: { dark: "#0a0a0a", light: "#ffffff" },
      });

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      // Background frame
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pageW, pageH, "F");

      // Top gradient bar (simulated with 3 stripes: cyan → orange → pink)
      const stripeH = 6;
      pdf.setFillColor(34, 211, 238); // cyan
      pdf.rect(0, 0, pageW / 3, stripeH, "F");
      pdf.setFillColor(249, 115, 22); // orange
      pdf.rect(pageW / 3, 0, pageW / 3, stripeH, "F");
      pdf.setFillColor(236, 72, 153); // pink
      pdf.rect((pageW / 3) * 2, 0, pageW / 3, stripeH, "F");

      // Outer border
      pdf.setDrawColor(220, 220, 220);
      pdf.setLineWidth(0.4);
      pdf.roundedRect(8, 12, pageW - 16, pageH - 20, 4, 4);

      // Logo
      try {
        const logoImg = await fetch(delfosLogo).then(r => r.blob()).then(blob =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          })
        );
        const logoW = 60;
        const logoH = 24;
        pdf.addImage(logoImg, "PNG", pageW / 2 - logoW / 2, 16, logoW, logoH, undefined, "FAST");
      } catch {
        // skip logo if it fails
      }

      // Subtitle (e.g., "BOLÃO" / "COMUNIDADE")
      if (subtitle) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(120, 120, 120);
        pdf.text(subtitle.toUpperCase(), pageW / 2, 50, { align: "center" });
      }

      // Title
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(28);
      pdf.setTextColor(20, 20, 20);
      const titleLines = pdf.splitTextToSize(title, pageW - 40);
      const titleY = 56;
      pdf.text(titleLines, pageW / 2, titleY, { align: "center" });
      const titleH = titleLines.length * 10;

      // Description
      let cursorY = titleY + titleH + 4;
      if (description) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(12);
        pdf.setTextColor(90, 90, 90);
        const descLines = pdf.splitTextToSize(description, pageW - 50);
        const limited = descLines.slice(0, 4);
        pdf.text(limited, pageW / 2, cursorY, { align: "center" });
        cursorY += limited.length * 6 + 4;
      }

      // QR Code (large, centered)
      const qrSize = 95;
      const qrX = (pageW - qrSize) / 2;
      const qrY = cursorY + 4;
      // QR background card
      pdf.setFillColor(248, 250, 252);
      pdf.setDrawColor(34, 211, 238);
      pdf.setLineWidth(0.8);
      pdf.roundedRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 3, 3, "FD");
      pdf.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize, undefined, "FAST");

      // CTA below QR
      let belowY = qrY + qrSize + 14;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.setTextColor(40, 40, 40);
      pdf.text(callToAction, pageW / 2, belowY, { align: "center" });
      belowY += 7;

      // URL text
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.setTextColor(34, 130, 180);
      const cleanUrl = url.replace(/^https?:\/\//, "");
      pdf.text(cleanUrl, pageW / 2, belowY, { align: "center" });
      belowY += 8;

      // Info lines (entry fee etc.)
      if (infoLines.length > 0) {
        const boxW = pageW - 50;
        const boxX = (pageW - boxW) / 2;
        const lineH = 8;
        const boxH = infoLines.length * lineH + 8;
        pdf.setFillColor(245, 247, 250);
        pdf.setDrawColor(230, 230, 230);
        pdf.roundedRect(boxX, belowY, boxW, boxH, 2, 2, "FD");
        let infoY = belowY + 7;
        infoLines.forEach((line) => {
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(11);
          pdf.setTextColor(80, 80, 80);
          pdf.text(`${line.label}:`, boxX + 6, infoY);
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(20, 20, 20);
          const valueLines = pdf.splitTextToSize(line.value, boxW - 50);
          pdf.text(valueLines[0] || "", boxX + boxW - 6, infoY, { align: "right" });
          infoY += lineH;
        });
        belowY += boxH + 6;
      }

      // Footer
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(10);
      pdf.setTextColor(150, 150, 150);
      pdf.text(footerNote, pageW / 2, pageH - 14, { align: "center" });

      pdf.save(fileName);
      toast({ title: "Cartaz gerado!", description: "PDF pronto para impressão." });
    } catch (e: any) {
      toast({
        title: "Erro ao gerar cartaz",
        description: e.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={generate}
      disabled={loading}
      className="gap-1.5"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
      {label}
    </Button>
  );
};

export default PrintPosterButton;
