/**
 * Dashboard shared utilities
 * ES module — loaded by all dashboard pages.
 */

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function getToken() {
  return new URLSearchParams(window.location.search).get('token')
    || localStorage.getItem('crm_dashboard_token');
}

export function saveToken(token) {
  localStorage.setItem('crm_dashboard_token', token);
}

export function clearToken() {
  localStorage.removeItem('crm_dashboard_token');
}

// ---------------------------------------------------------------------------
// API fetch wrapper
// ---------------------------------------------------------------------------

const BASE = window.location.origin;

export async function api(endpoint, params = {}) {
  const token = getToken();
  if (!token) throw new Error('No token');

  const url = new URL(`${BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/dashboard/index.html';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

export function formatMoney(value) {
  if (value == null) return '-';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatPct(value) {
  if (value == null) return '-';
  return `${Math.round(value * 10) / 10}%`;
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

export function quotaColor(pct) {
  if (pct >= 100) return 'var(--green)';
  if (pct >= 70) return 'var(--yellow)';
  return 'var(--red)';
}

export function quotaClass(pct) {
  if (pct >= 100) return 'val-positive';
  if (pct >= 70) return 'val-warning';
  return 'val-danger';
}

export function sentimentColor(s) {
  const map = { positivo: 'var(--green)', neutral: 'var(--gray-300)', negativo: 'var(--red)', urgente: 'var(--orange)' };
  return map[s] || 'var(--gray-300)';
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

export function $(sel) { return document.querySelector(sel); }
export function $$(sel) { return document.querySelectorAll(sel); }

export function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') e.className = v;
    else if (k === 'textContent') e.textContent = v;
    else if (k === 'innerHTML') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else if (c) e.appendChild(c);
  }
  return e;
}

// ---------------------------------------------------------------------------
// Auto-refresh
// ---------------------------------------------------------------------------

export function startAutoRefresh(callback, intervalMs = 60000) {
  callback(); // initial load
  return setInterval(callback, intervalMs);
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

export function timeAgo(isoDate) {
  if (!isoDate) return '-';
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
