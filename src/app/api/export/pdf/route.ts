import { NextRequest, NextResponse } from 'next/server';

type PageFormat = 'Letter' | 'A4' | 'A5' | 'Digest';

interface FormatConfig {
  format?: 'Letter' | 'A4' | 'A5';
  width?: string;
  height?: string;
  margin: { top: string; right: string; bottom: string; left: string };
}

const FORMAT_CONFIGS: Record<PageFormat, FormatConfig> = {
  Letter: {
    format: 'Letter',
    margin: { top: '0.75in', right: '0.75in', bottom: '0.75in', left: '0.75in' },
  },
  A4: {
    format: 'A4',
    margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
  },
  A5: {
    format: 'A5',
    margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
  },
  Digest: {
    // 5.5" x 8.5" - common RPG book size
    width: '5.5in',
    height: '8.5in',
    margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
  },
};

export async function POST(request: NextRequest) {
  try {
    const { html, format = 'Letter' } = await request.json();

    if (!html || typeof html !== 'string') {
      return NextResponse.json({ error: 'HTML content is required' }, { status: 400 });
    }

    const formatConfig = FORMAT_CONFIGS[format as PageFormat] || FORMAT_CONFIGS.Letter;

    // Try to use Playwright for PDF generation
    try {
      const { chromium } = await import('playwright');

      const browser = await chromium.launch({
        headless: true,
      });

      const page = await browser.newPage();

      // Set the HTML content
      await page.setContent(html, {
        waitUntil: 'networkidle',
      });

      // Wait for fonts and web components to load
      await page.waitForTimeout(1000);

      // Generate PDF with format-specific settings
      const pdfBuffer = await page.pdf({
        format: formatConfig.format,
        width: formatConfig.width,
        height: formatConfig.height,
        margin: formatConfig.margin,
        printBackground: true,
      });

      await browser.close();

      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="document.pdf"',
        },
      });
    } catch (playwrightError) {
      console.error('Playwright PDF generation failed:', playwrightError);

      // Fallback: Return HTML file for browser printing
      // Add print-ready instructions
      const printReadyHtml = html.replace(
        '</head>',
        `<style>
          @media screen {
            body::before {
              content: "This document is ready for printing. Press Ctrl+P (or Cmd+P on Mac) to print to PDF.";
              display: block;
              background: #fffbeb;
              border: 2px solid #f59e0b;
              padding: 1rem;
              margin-bottom: 1rem;
              font-family: sans-serif;
              font-size: 14px;
              border-radius: 8px;
            }
          }
          @media print {
            body::before {
              display: none !important;
            }
          }
        </style>
        </head>`
      );

      return new NextResponse(printReadyHtml, {
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': 'attachment; filename="document.html"',
        },
      });
    }
  } catch (error) {
    console.error('PDF export error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
