import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import './Pagination.css';

/**
 * Professional, reusable pagination component.
 * Works for both client-side and server-side pagination — parent owns the state.
 *
 * Props:
 *   currentPage      (number, 1-indexed)
 *   totalPages       (number) — if not provided, computed from totalItems/pageSize
 *   totalItems       (number) — for the "Showing X–Y of Z" label
 *   pageSize         (number) — items per page
 *   onPageChange     (fn) — (newPage) => void
 *   pageSizeOptions  (number[]) — optional e.g. [10, 20, 50] to show size selector
 *   onPageSizeChange (fn) — (newSize) => void — required when pageSizeOptions is provided
 *   siblingCount     (number) — how many page buttons to show on each side of current. Default 1.
 */
export default function Pagination({
    currentPage,
    totalPages: totalPagesProp,
    totalItems,
    pageSize,
    onPageChange,
    pageSizeOptions,
    onPageSizeChange,
    siblingCount = 1
}) {
    const totalPages = totalPagesProp ?? Math.max(1, Math.ceil((totalItems || 0) / (pageSize || 1)));
    if (!totalItems || totalPages <= 1) return null;

    const from = (currentPage - 1) * pageSize + 1;
    const to = Math.min(currentPage * pageSize, totalItems);

    // Build the page-number window
    const start = Math.max(1, currentPage - siblingCount);
    const end = Math.min(totalPages, currentPage + siblingCount);
    const pages = [];
    for (let i = start; i <= end; i++) pages.push(i);

    const go = (p) => {
        const next = Math.max(1, Math.min(totalPages, p));
        if (next !== currentPage) onPageChange(next);
    };
    const atFirst = currentPage <= 1;
    const atLast = currentPage >= totalPages;

    return (
        <nav className="pagination-nav" aria-label="Pagination">
            <div className="pagination-info">
                Showing <strong>{from}</strong>–<strong>{to}</strong> of <strong>{totalItems}</strong>
            </div>

            <div className="pagination-controls">
                {pageSizeOptions && onPageSizeChange && (
                    <select
                        className="pagination-size"
                        value={pageSize}
                        onChange={e => onPageSizeChange(Number(e.target.value))}
                        aria-label="Items per page"
                    >
                        {pageSizeOptions.map(n => <option key={n} value={n}>{n} / page</option>)}
                    </select>
                )}

                <div className="pagination-btns" role="group">
                    <button className="pg-btn pg-icon" disabled={atFirst} onClick={() => go(1)} title="First page" aria-label="First page">
                        <ChevronsLeft size={16} strokeWidth={2} />
                    </button>
                    <button className="pg-btn pg-icon" disabled={atFirst} onClick={() => go(currentPage - 1)} title="Previous page" aria-label="Previous page">
                        <ChevronLeft size={16} strokeWidth={2} />
                    </button>

                    {start > 1 && (
                        <>
                            <button className="pg-btn" onClick={() => go(1)}>1</button>
                            {start > 2 && <span className="pg-ellipsis" aria-hidden="true">…</span>}
                        </>
                    )}

                    {pages.map(p => (
                        <button
                            key={p}
                            className={`pg-btn ${p === currentPage ? 'active' : ''}`}
                            onClick={() => go(p)}
                            aria-current={p === currentPage ? 'page' : undefined}
                        >
                            {p}
                        </button>
                    ))}

                    {end < totalPages && (
                        <>
                            {end < totalPages - 1 && <span className="pg-ellipsis" aria-hidden="true">…</span>}
                            <button className="pg-btn" onClick={() => go(totalPages)}>{totalPages}</button>
                        </>
                    )}

                    <button className="pg-btn pg-icon" disabled={atLast} onClick={() => go(currentPage + 1)} title="Next page" aria-label="Next page">
                        <ChevronRight size={16} strokeWidth={2} />
                    </button>
                    <button className="pg-btn pg-icon" disabled={atLast} onClick={() => go(totalPages)} title="Last page" aria-label="Last page">
                        <ChevronsRight size={16} strokeWidth={2} />
                    </button>
                </div>
            </div>
        </nav>
    );
}
