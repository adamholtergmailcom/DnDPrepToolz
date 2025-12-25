import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { html } = await request.json();

    if (!html || typeof html !== 'string') {
      return NextResponse.json({ error: 'HTML content is required' }, { status: 400 });
    }

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

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'Letter',
        margin: {
          top: '0.75in',
          right: '0.75in',
          bottom: '0.75in',
          left: '0.75in',
        },
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
