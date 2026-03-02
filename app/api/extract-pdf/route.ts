import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { PDFParse } from "pdf-parse";

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const pdfFile = formData.get("pdf") as File;

    if (!pdfFile) {
      return NextResponse.json({ error: "No PDF file provided" }, { status: 400 });
    }

    // Convert file to buffer
    const bytes = await pdfFile.arrayBuffer();
    const buffer = Buffer.from(bytes);

    try {
      // Use pdf-parse to extract text
      const parser = new PDFParse({ data: buffer });
      const pdfData = await parser.getText();
      await parser.destroy();
      
      let text = pdfData.text || "";
      
      // Clean up the text
      text = text
        .replace(/\r\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")  // Remove excessive line breaks
        .replace(/\s{2,}/g, " ")      // Remove excessive spaces
        .trim();

      if (!text || text.length < 10) {
        return NextResponse.json({ 
          text: `[PDF: ${pdfFile.name}]\n\nThe PDF appears to be image-based or has no extractable text. Please describe the main points from your document in the prompt.`,
          filename: pdfFile.name,
          size: pdfFile.size,
          pages: pdfData.total || 0
        });
      }

      console.log(`PDF extracted: ${pdfFile.name}, ${pdfData.total} pages, ${text.length} chars`);

      return NextResponse.json({ 
        text,
        filename: pdfFile.name,
        size: pdfFile.size,
        pages: pdfData.total || 0
      });
    } catch (parseError) {
      console.error("PDF parse error:", parseError);
      return NextResponse.json({ 
        text: `[PDF: ${pdfFile.name}]\n\nCould not extract text from this PDF. Please describe the key points from your document.`,
        filename: pdfFile.name,
        size: pdfFile.size,
        error: "Parse failed"
      });
    }
  } catch (error) {
    console.error("PDF extraction error:", error);
    return NextResponse.json(
      { error: "Failed to process PDF" },
      { status: 500 }
    );
  }
}
