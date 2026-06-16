import { LitElement, nothing } from 'lit';

export class AgentTable extends LitElement {
  static properties = {
    groupBy: { type: String, attribute: 'group-by' },
    sort: { type: String },
    density: { type: String, reflect: true },
  };

  // Light DOM: native <table> a11y + document theme tokens.
  // Deliberately diverges from shadow-DOM components — NO static styles, NO css``.
  createRenderRoot() { return this; }

  // Never let Lit manage the server-emitted children.
  render() { return nothing; }

  constructor() {
    super();
    this.groupBy = '';
    this.sort = '';
    this.density = '';
    // Private state — ephemeral, no localStorage.
    this._sortKey = '';
    this._sortDir = 'ascending';
    this._colTypes = new Map();   // key -> data-type string
    this._colCount = 0;
  }

  firstUpdated() {
    this.#enhance();
  }

  // ── Top-level enhancement ──────────────────────────────────────────────────

  #enhance() {
    const scroll = this.querySelector('.agent-table-scroll');
    const table = scroll?.querySelector('table');
    if (!table) return;

    this.#readColumnMeta(table);
    this.#parseSortAttr();
    this.#injectSortButtons(table);

    if (this.groupBy) {
      this.#applyGroupBy(table);
    }
  }

  // ── Column metadata ────────────────────────────────────────────────────────

  #readColumnMeta(table) {
    const ths = table.querySelectorAll('thead th[data-key]');
    this._colCount = ths.length;
    for (const th of ths) {
      this._colTypes.set(th.dataset.key, th.dataset.type || 'text');
    }
  }

  // Parse the server-emitted `sort` attribute ("effort desc", "name asc", etc.)
  #parseSortAttr() {
    if (!this.sort) return;
    const parts = this.sort.trim().split(/\s+/);
    const key = parts[0];
    const dir = (parts[1] || 'ascending').toLowerCase() === 'desc' ? 'descending' : 'ascending';
    if (this._colTypes.has(key)) {
      this._sortKey = key;
      this._sortDir = dir;
    }
  }

  // ── Sort buttons ───────────────────────────────────────────────────────────

  #injectSortButtons(table) {
    const ths = table.querySelectorAll('thead th[data-key]');
    for (const th of ths) {
      const key = th.dataset.key;

      // Move existing text content into a button.
      const labelText = th.textContent.trim();
      th.textContent = '';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'agent-table-sort';
      btn.textContent = labelText;
      btn.addEventListener('click', () => this.#sortBy(key, table));
      th.appendChild(btn);

      // Reflect the server-side initial sort on the th.
      if (key === this._sortKey) {
        th.setAttribute('aria-sort', this._sortDir);
      }
    }
  }

  // ── Sorting ────────────────────────────────────────────────────────────────

  #sortBy(key, table) {
    // Toggle direction if same key, else default to ascending.
    if (key === this._sortKey) {
      this._sortDir = this._sortDir === 'ascending' ? 'descending' : 'ascending';
    } else {
      this._sortKey = key;
      this._sortDir = 'ascending';
    }

    const type = this._colTypes.get(key) || 'text';
    const ascending = this._sortDir === 'ascending';

    // Update aria-sort on th headers.
    const ths = table.querySelectorAll('thead th[data-key]');
    for (const th of ths) {
      if (th.dataset.key === key) {
        th.setAttribute('aria-sort', this._sortDir);
      } else {
        th.removeAttribute('aria-sort');
      }
    }

    // Collect the group-body tbodies (or the flat tbody if not grouped).
    const groupBodies = table.querySelectorAll('tbody.agent-table-group-body');
    if (groupBodies.length > 0) {
      // Sort within each group independently.
      for (const tbody of groupBodies) {
        this.#sortRowsInTbody(tbody, key, type, ascending);
      }
    } else {
      const flatBody = table.querySelector('tbody:not(.agent-table-group-header)');
      if (flatBody) {
        this.#sortRowsInTbody(flatBody, key, type, ascending);
      }
    }
  }

  #sortRowsInTbody(tbody, key, type, ascending) {
    const rows = Array.from(tbody.querySelectorAll('tr[data-row-id]'));
    if (rows.length < 2) return;

    // Find the column index for this key.
    const colIndex = this.#colIndexForKey(tbody.closest('table'), key);
    if (colIndex < 0) return;

    // Sort values are read from the server-emitted data-sortval attribute on each td.
    rows.sort((a, b) => {
      const aCell = a.children[colIndex];
      const bCell = b.children[colIndex];
      const aVal = aCell?.getAttribute('data-sortval') ?? '';
      const bVal = bCell?.getAttribute('data-sortval') ?? '';

      // Missing / empty sortvals always sort last (regardless of direction).
      const aEmpty = aVal === '' || aVal == null;
      const bEmpty = bVal === '' || bVal == null;
      if (aEmpty && bEmpty) return this.#rowIdTiebreak(a, b);
      if (aEmpty) return 1;
      if (bEmpty) return -1;

      let cmp;
      if (type === 'number') {
        cmp = Number(aVal) - Number(bVal);
      } else {
        cmp = String(aVal).localeCompare(String(bVal), undefined, { sensitivity: 'base' });
      }

      if (cmp === 0) return this.#rowIdTiebreak(a, b);
      return ascending ? cmp : -cmp;
    });

    // Re-append in sorted order (does not renumber badges or data-row-id).
    for (const row of rows) {
      tbody.appendChild(row);
    }
  }

  #colIndexForKey(table, key) {
    const ths = Array.from(table.querySelectorAll('thead th[data-key]'));
    return ths.findIndex((th) => th.dataset.key === key);
  }

  // Stable tiebreak: parse trailing number from data-row-id ("t1-r3" → 3).
  #rowIdTiebreak(a, b) {
    const numA = this.#rowIdNum(a.dataset.rowId);
    const numB = this.#rowIdNum(b.dataset.rowId);
    return numA - numB;
  }

  #rowIdNum(rowId) {
    const m = String(rowId || '').match(/-r(\d+)$/);
    return m ? Number(m[1]) : 0;
  }

  // ── Group-by ───────────────────────────────────────────────────────────────

  #applyGroupBy(table) {
    const key = this.groupBy;
    const type = this._colTypes.get(key);

    if (!type) {
      console.warn(`[agent-isles] agent-table: group-by="${key}" does not match any column key — ignoring`);
      return;
    }

    // Multi-select columns are unsupported for grouping (spec note 9).
    if (type === 'multi-select') {
      console.warn(`[agent-isles] agent-table: group-by="${key}" targets a multi-select column — grouping is not supported for multi-value columns`);
      return;
    }

    const colIndex = this.#colIndexForKey(table, key);
    if (colIndex < 0) return;

    // Collect all rows from the flat tbody.
    const flatBody = table.querySelector('tbody');
    if (!flatBody) return;
    const rows = Array.from(flatBody.querySelectorAll('tr[data-row-id]'));

    // Build ordered group map (insertion order = first appearance).
    const groups = new Map();
    for (const row of rows) {
      const cell = row.children[colIndex];
      const groupLabel = (cell?.getAttribute('data-sortval') || cell?.textContent || '').trim() || '(blank)';
      if (!groups.has(groupLabel)) groups.set(groupLabel, []);
      groups.get(groupLabel).push(row);
    }

    // Remove the flat tbody — we will replace it with per-group tbody pairs.
    flatBody.remove();

    const colCount = this._colCount;

    for (const [label, groupRows] of groups) {
      const count = groupRows.length;

      // Header tbody: a single row with a toggle button spanning all columns.
      const headerTbody = document.createElement('tbody');
      headerTbody.className = 'agent-table-group-header';

      const headerTr = document.createElement('tr');
      const headerTh = document.createElement('th');
      headerTh.colSpan = colCount;

      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'agent-table-group-toggle';
      toggleBtn.setAttribute('aria-expanded', 'true');
      toggleBtn.textContent = `${label} (${count})`;

      headerTh.appendChild(toggleBtn);
      headerTr.appendChild(headerTh);
      headerTbody.appendChild(headerTr);
      table.appendChild(headerTbody);

      // Body tbody: holds the group's rows.
      const bodyTbody = document.createElement('tbody');
      bodyTbody.className = 'agent-table-group-body';
      for (const row of groupRows) {
        bodyTbody.appendChild(row);
      }
      table.appendChild(bodyTbody);

      // Wire toggle: flip aria-expanded + hidden on the body tbody only.
      toggleBtn.addEventListener('click', () => this.#toggleGroup(toggleBtn, bodyTbody));
    }
  }

  #toggleGroup(btn, bodyTbody) {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    if (expanded) {
      bodyTbody.setAttribute('hidden', '');
    } else {
      bodyTbody.removeAttribute('hidden');
    }
  }
}

customElements.define('agent-table', AgentTable);
