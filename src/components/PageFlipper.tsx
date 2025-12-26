'use client';

import React, { useState, useMemo } from 'react';

interface PageFlipperProps {
  htmlContent: string;
  onPageChange?: (page: number) => void;
}

export default function PageFlipper({ htmlContent, onPageChange }: PageFlipperProps) {
  const [currentPage, setCurrentPage] = useState(0);

  // Split HTML content into pages
  const pages = useMemo(() => {
    if (!htmlContent) {
      return [];
    }

    // Parse the HTML to extract content
    const mainMatch = htmlContent.match(/<main[^>]*>([\s\S]*?)<\/main>/);
    const mainContent = mainMatch ? mainMatch[1] : htmlContent;

    // Split content by major elements
    const elementRegex = /(<(?:h[1-6]|div|table|figure|p|ul|ol|blockquote)[^>]*>[\s\S]*?<\/(?:h[1-6]|div|table|figure|p|ul|ol|blockquote)>)/gi;
    const elements = mainContent.split(elementRegex).filter(s => s.trim());

    const pagesContent: string[] = [];
    const elementsPerPage = 6;

    for (let i = 0; i < elements.length; i += elementsPerPage) {
      const pageElements = elements.slice(i, i + elementsPerPage);
      const pageContent = pageElements.join('');
      if (pageContent.trim()) {
        pagesContent.push(pageContent);
      }
    }

    if (pagesContent.length === 0) {
      pagesContent.push('<p>No content to display</p>');
    }

    return pagesContent;
  }, [htmlContent]);

  const goToPage = (page: number) => {
    const newPage = Math.max(0, Math.min(pages.length - 1, page));
    setCurrentPage(newPage);
    onPageChange?.(newPage);
  };

  if (pages.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-gray-500">
        Loading book preview...
      </div>
    );
  }

  return (
    <div className="page-flipper-container">
      <style jsx global>{`
        .page-flipper-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 30px;
          background: linear-gradient(135deg, #2c1810 0%, #1a0f0a 100%);
          border-radius: 12px;
          min-height: 650px;
        }

        .book-spread {
          display: flex;
          gap: 4px;
          perspective: 2000px;
        }

        .book-page {
          width: 350px;
          min-height: 500px;
          background: #fdf9f0;
          background-image: 
            linear-gradient(rgba(0,0,0,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,0,0,0.02) 1px, transparent 1px);
          background-size: 20px 20px;
          padding: 30px;
          font-family: 'Spectral', serif;
          font-size: 11px;
          line-height: 1.5;
          color: #1a1a1a;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          overflow: hidden;
          position: relative;
        }

        .book-page.left {
          border-radius: 2px 0 0 2px;
          box-shadow: inset -5px 0 15px rgba(0,0,0,0.1), 0 4px 20px rgba(0,0,0,0.3);
        }

        .book-page.right {
          border-radius: 0 2px 2px 0;
          box-shadow: inset 5px 0 15px rgba(0,0,0,0.1), 0 4px 20px rgba(0,0,0,0.3);
        }

        .book-page.blank {
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ccc;
          font-style: italic;
        }

        .page-content {
          height: 100%;
          overflow: hidden;
        }

        .page-content h1 {
          font-family: 'Cinzel', serif;
          font-size: 18px;
          color: #58170D;
          margin: 0 0 12px 0;
          border-bottom: 2px solid #C9AD6A;
          padding-bottom: 6px;
        }

        .page-content h2 {
          font-family: 'Cinzel', serif;
          font-size: 14px;
          color: #58170D;
          margin: 12px 0 8px 0;
        }

        .page-content h3 {
          font-family: 'Cinzel', serif;
          font-size: 12px;
          color: #58170D;
          margin: 10px 0 6px 0;
        }

        .page-content p {
          margin: 8px 0;
        }

        .page-content img {
          max-width: 100%;
          max-height: 150px;
          object-fit: contain;
          display: block;
          margin: 10px auto;
          border: 1px solid #C9AD6A;
        }

        .page-content table {
          font-size: 9px;
          width: 100%;
          border-collapse: collapse;
        }

        .page-content th {
          background: #58170D;
          color: white;
          padding: 4px;
          text-align: left;
        }

        .page-content td {
          padding: 3px 4px;
          border-bottom: 1px solid #ddd;
        }

        .page-number {
          position: absolute;
          bottom: 10px;
          font-family: 'Cinzel', serif;
          font-size: 10px;
          color: #58170D;
        }

        .page-number.left {
          left: 30px;
        }

        .page-number.right {
          right: 30px;
        }

        .flipbook-controls {
          display: flex;
          gap: 20px;
          margin-top: 25px;
          align-items: center;
        }

        .flipbook-btn {
          padding: 12px 28px;
          background: #C9AD6A;
          border: none;
          border-radius: 6px;
          color: #1a0f0a;
          font-family: 'Cinzel', serif;
          font-weight: bold;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 3px 10px rgba(0,0,0,0.3);
        }

        .flipbook-btn:hover:not(:disabled) {
          background: #d4bc7a;
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(0,0,0,0.4);
        }

        .flipbook-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          transform: none;
        }

        .page-indicator {
          color: #C9AD6A;
          font-family: 'Cinzel', serif;
          font-size: 14px;
        }
      `}</style>

      <div className="book-spread">
        {/* Left page */}
        <div className="book-page left">
          {currentPage * 2 < pages.length ? (
            <>
              <div
                className="page-content"
                dangerouslySetInnerHTML={{ __html: pages[currentPage * 2] }}
              />
              <div className="page-number left">{currentPage * 2 + 1}</div>
            </>
          ) : (
            <div className="blank">End of document</div>
          )}
        </div>

        {/* Right page */}
        <div className="book-page right">
          {currentPage * 2 + 1 < pages.length ? (
            <>
              <div
                className="page-content"
                dangerouslySetInnerHTML={{ __html: pages[currentPage * 2 + 1] }}
              />
              <div className="page-number right">{currentPage * 2 + 2}</div>
            </>
          ) : (
            <div className="blank"></div>
          )}
        </div>
      </div>

      <div className="flipbook-controls">
        <button
          className="flipbook-btn"
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 0}
        >
          ← Previous
        </button>
        <div className="page-indicator">
          Pages {currentPage * 2 + 1}-{Math.min(currentPage * 2 + 2, pages.length)} of {pages.length}
        </div>
        <button
          className="flipbook-btn"
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage * 2 + 2 >= pages.length}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
