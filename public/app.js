// App State
let products = [];
let selectedForCompare = new Set();
let activeTab = 'tab-table';
let scraperInterval = null;

let filters = {
  search: '',
  category: 'all',
  brands: new Set(),
  conditionNuevo: true,
  conditionUsado: true,
  stockOnly: false,
  priceMin: null,
  priceMax: null
};

let sorting = 'discount-desc';

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initFormListeners();
  initModalListeners();
  
  // Fetch initial data
  fetchProducts();
  checkScraperStatus();
  
  // Poll scraper status every 2 seconds
  scraperInterval = setInterval(checkScraperStatus, 2000);
});

// ==========================================================================
// API FETCHES
// ==========================================================================

async function fetchProducts() {
  try {
    const res = await fetch('/api/products');
    if (!res.ok) throw new Error('Error fetching products');
    products = await res.json();
    
    // Fill stats
    document.getElementById('stats-total-products').textContent = products.length;
    
    // Initialize filter inputs based on products
    populateFilterOptions();
    
    // Apply filters and render
    applyFiltersAndSort();
  } catch (err) {
    console.error(err);
    showSystemLog('Error al cargar productos del catálogo.', true);
  }
}

async function checkScraperStatus() {
  try {
    const res = await fetch('/api/scraper/status');
    if (!res.ok) throw new Error('Error fetching status');
    const data = await res.json();
    
    // Update header indicator
    const indicator = document.getElementById('scraper-indicator');
    const dot = indicator.querySelector('.status-dot');
    const text = indicator.querySelector('.status-text');
    
    indicator.className = 'header-sync-status';
    if (data.running) {
      indicator.classList.add('active');
      text.textContent = `Sincronizando: ${data.phase}`;
      
      // Enable/disable form buttons
      document.getElementById('btn-scraper-start').disabled = true;
      document.getElementById('btn-scraper-stop').disabled = false;
    } else {
      indicator.classList.add('idle');
      text.textContent = 'Inactivo';
      
      document.getElementById('btn-scraper-start').disabled = false;
      document.getElementById('btn-scraper-stop').disabled = true;
    }
    
    // Update stats badges in header
    document.getElementById('stats-categories').textContent = `${data.stats.scraped_categories} / ${data.stats.total_categories}`;
    document.getElementById('stats-queue').textContent = `${data.stats.completed_queue} / ${data.stats.total_queue}`;
    
    // Update progress panel in Scraper TAB
    document.getElementById('progress-phase').textContent = `Fase: ${data.phase.toUpperCase()}`;
    document.getElementById('progress-status-msg').textContent = data.message;
    
    let percent = 0;
    if (data.total > 0) {
      percent = Math.round((data.current / data.total) * 100);
    }
    document.getElementById('progress-percent').textContent = `${percent}%`;
    document.getElementById('progress-bar-fill').style.width = `${percent}%`;
    
    // Render Logs in console
    const consoleBox = document.getElementById('logs-console');
    if (data.logs && data.logs.length > 0) {
      // Clear standard console and insert logs
      consoleBox.innerHTML = '';
      data.logs.forEach(log => {
        const line = document.createElement('div');
        line.className = 'log-line';
        if (log.includes('[ERROR]') || log.includes('[STDERR]')) {
          line.classList.add('error');
        } else if (log.includes('[SISTEMA]') || log.includes('[INIT]')) {
          line.classList.add('system');
        }
        line.textContent = log;
        consoleBox.appendChild(line);
      });
      // Auto scroll
      consoleBox.scrollTop = consoleBox.scrollHeight;
    }
    
    // If scraper was running and just finished, reload products
    if (!data.running && scraperStatusWasRunning) {
      fetchProducts();
    }
    scraperStatusWasRunning = data.running;
    
  } catch (err) {
    console.error('Error connecting to scraper API:', err);
  }
}
let scraperStatusWasRunning = false;

// ==========================================================================
// NAVIGATION & INTERFACES
// ==========================================================================

function initNav() {
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      // Toggle nav buttons
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Toggle tabs
      document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
      });
      document.getElementById(targetTab).classList.add('active');
      
      activeTab = targetTab;
      
      // Run tab-specific logic if needed
      if (activeTab === 'tab-compare') {
        renderCompareMatrix();
      } else if (activeTab === 'tab-groupings') {
        renderGroupings();
      }
    });
  });
}

function showSystemLog(msg, isError = false) {
  const consoleBox = document.getElementById('logs-console');
  const line = document.createElement('div');
  line.className = `log-line ${isError ? 'error' : 'system'}`;
  line.textContent = `[SISTEMA] ${msg}`;
  consoleBox.appendChild(line);
  consoleBox.scrollTop = consoleBox.scrollHeight;
}

// ==========================================================================
// FILTER LOGIC
// ==========================================================================

function populateFilterOptions() {
  const categories = new Set();
  const brands = new Set();
  let maxPrice = 0;
  
  products.forEach(p => {
    if (p.category) categories.add(p.category);
    if (p.brand) brands.add(p.brand);
    if (p.cash_price && p.cash_price > maxPrice) maxPrice = p.cash_price;
  });
  
  // Fill Category dropdown
  const catDropdown = document.getElementById('filter-category');
  // Keep first "All" option
  catDropdown.innerHTML = '<option value="all">Todas las Categorías</option>';
  Array.from(categories).sort().forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
    catDropdown.appendChild(opt);
  });
  
  // Fill Brand checkboxes
  const brandContainer = document.getElementById('brand-checkboxes-container');
  brandContainer.innerHTML = '';
  Array.from(brands).sort().forEach(brand => {
    const lbl = document.createElement('label');
    lbl.className = 'custom-checkbox';
    
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = brand;
    input.addEventListener('change', (e) => {
      if (e.target.checked) {
        filters.brands.add(brand);
      } else {
        filters.brands.delete(brand);
      }
      applyFiltersAndSort();
    });
    
    const span = document.createElement('span');
    span.textContent = brand;
    
    lbl.appendChild(input);
    lbl.appendChild(span);
    brandContainer.appendChild(lbl);
  });
  
  // Set price placeholders
  document.getElementById('price-max').placeholder = `Max (${formatCLP(maxPrice)})`;
}

function initFormListeners() {
  // Clear filters
  document.getElementById('btn-clear-filters').addEventListener('click', () => {
    filters = {
      search: '',
      category: 'all',
      brands: new Set(),
      conditionNuevo: true,
      conditionUsado: true,
      stockOnly: false,
      priceMin: null,
      priceMax: null
    };
    
    // Reset inputs visually
    document.getElementById('filter-search').value = '';
    document.getElementById('filter-category').value = 'all';
    document.getElementById('cond-nuevo').checked = true;
    document.getElementById('cond-usado').checked = true;
    document.getElementById('filter-stock-only').checked = false;
    document.getElementById('price-min').value = '';
    document.getElementById('price-max').value = '';
    
    // Uncheck brands
    document.querySelectorAll('#brand-checkboxes-container input').forEach(input => {
      input.checked = false;
    });
    
    applyFiltersAndSort();
  });
  
  // Change listeners
  document.getElementById('filter-search').addEventListener('input', (e) => {
    filters.search = e.target.value;
    applyFiltersAndSort();
  });
  
  document.getElementById('filter-category').addEventListener('change', (e) => {
    filters.category = e.target.value;
    applyFiltersAndSort();
  });
  
  document.getElementById('cond-nuevo').addEventListener('change', (e) => {
    filters.conditionNuevo = e.target.checked;
    applyFiltersAndSort();
  });
  
  document.getElementById('cond-usado').addEventListener('change', (e) => {
    filters.conditionUsado = e.target.checked;
    applyFiltersAndSort();
  });
  
  document.getElementById('filter-stock-only').addEventListener('change', (e) => {
    filters.stockOnly = e.target.checked;
    applyFiltersAndSort();
  });
  
  document.getElementById('price-min').addEventListener('input', (e) => {
    filters.priceMin = e.target.value ? parseInt(e.target.value) : null;
    applyFiltersAndSort();
  });
  
  document.getElementById('price-max').addEventListener('input', (e) => {
    filters.priceMax = e.target.value ? parseInt(e.target.value) : null;
    applyFiltersAndSort();
  });
  
  document.getElementById('sort-select').addEventListener('change', (e) => {
    sorting = e.target.value;
    applyFiltersAndSort();
  });
  
  // Scraper Form
  document.getElementById('scraper-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const limit = document.getElementById('scraper-filter').value;
    const mode = document.getElementById('scraper-mode').value;
    
    try {
      const res = await fetch('/api/scraper/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limitCategory: limit, mode })
      });
      const data = await res.json();
      if (res.ok) {
        showSystemLog('Raspador iniciado satisfactoriamente.');
        checkScraperStatus();
      } else {
        showSystemLog(`Error al iniciar raspador: ${data.error}`, true);
      }
    } catch (err) {
      console.error(err);
      showSystemLog('Error de red al intentar arrancar el raspador.', true);
    }
  });
  
  // Scraper Stop
  document.getElementById('btn-scraper-stop').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/scraper/stop', { method: 'POST' });
      if (res.ok) {
        showSystemLog('Enviada señal de detención al raspador...');
        checkScraperStatus();
      }
    } catch (err) {
      console.error(err);
    }
  });
  
  // Clear Logs
  document.getElementById('btn-clear-logs').addEventListener('click', () => {
    document.getElementById('logs-console').innerHTML = '<div class="log-line system">[SISTEMA] Consola limpia. Esperando eventos...</div>';
  });
  
  // Export CSV
  document.getElementById('btn-export-csv').addEventListener('click', exportToCSV);
}

function applyFiltersAndSort() {
  let filtered = products.filter(p => {
    // 1. Search text
    if (filters.search) {
      const s = filters.search.toLowerCase();
      const matchText = (p.title || '').toLowerCase().includes(s) || 
                        (p.sku || '').toLowerCase().includes(s) || 
                        (p.brand || '').toLowerCase().includes(s);
      if (!matchText) return false;
    }
    
    // 2. Category
    if (filters.category !== 'all' && p.category !== filters.category) {
      return false;
    }
    
    // 3. Brands
    if (filters.brands.size > 0 && !filters.brands.has(p.brand)) {
      return false;
    }
    
    // 4. Condition
    const isNew = p.condition === 'NUEVO' || p.condition === 'NEW';
    const isUsed = p.condition === 'USADO' || p.condition === 'USED';
    if (!filters.conditionNuevo && isNew) return false;
    if (!filters.conditionUsado && isUsed) return false;
    
    // 5. Stock
    if (filters.stockOnly && p.stock <= 0) return false;
    
    // 6. Prices
    if (filters.priceMin !== null && p.cash_price < filters.priceMin) return false;
    if (filters.priceMax !== null && p.cash_price > filters.priceMax) return false;
    
    return true;
  });
  
  // Apply Sort
  filtered.sort((a, b) => {
    if (sorting === 'price-asc') {
      return (a.cash_price || 99999999) - (b.cash_price || 99999999);
    } else if (sorting === 'price-desc') {
      return (b.cash_price || 0) - (a.cash_price || 0);
    } else if (sorting === 'stock-desc') {
      return b.stock - a.stock;
    } else if (sorting === 'title-asc') {
      return (a.title || '').localeCompare(b.title || '');
    } else if (sorting === 'discount-desc') {
      return (b.discount || 0) - (a.discount || 0);
    }
    return 0;
  });
  
  renderCatalogTable(filtered);
}

// ==========================================================================
// RENDERERS
// ==========================================================================

function renderCatalogTable(list) {
  const tbody = document.getElementById('catalog-table-body');
  const noResults = document.getElementById('catalog-no-results');
  
  tbody.innerHTML = '';
  
  if (list.length === 0) {
    noResults.style.display = 'flex';
    document.getElementById('filtered-products-count').textContent = 'Mostrando 0 productos';
    return;
  }
  
  noResults.style.display = 'none';
  document.getElementById('filtered-products-count').textContent = `Mostrando ${list.length} productos`;
  
  list.forEach(p => {
    const tr = document.createElement('tr');
    
    // Checkbox compare column
    const tdCheck = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = selectedForCompare.has(p.sku);
    input.addEventListener('change', () => {
      toggleCompare(p.sku);
    });
    tdCheck.appendChild(input);
    tr.appendChild(tdCheck);
    
    // Image column
    const tdImg = document.createElement('td');
    const img = document.createElement('img');
    img.src = p.image_url || '/images/Logo-Winpy.jpg';
    img.className = 'product-img-th';
    img.alt = 'Thumb';
    img.onerror = () => { img.src = '/images/Logo-Winpy.jpg'; };
    img.addEventListener('click', () => openProductModal(p));
    img.style.cursor = 'pointer';
    tdImg.appendChild(img);
    tr.appendChild(tdImg);
    
    // Title/SKU column
    const tdTitle = document.createElement('td');
    const infoDiv = document.createElement('div');
    infoDiv.className = 'product-cell-info';
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'product-cell-title';
    titleSpan.textContent = p.title;
    titleSpan.addEventListener('click', () => openProductModal(p));
    
    const skuSpan = document.createElement('span');
    skuSpan.className = 'product-cell-sku';
    skuSpan.textContent = `SKU: ${p.sku}`;
    
    infoDiv.appendChild(titleSpan);
    infoDiv.appendChild(skuSpan);
    tdTitle.appendChild(infoDiv);
    tr.appendChild(tdTitle);
    
    // Brand column
    const tdBrand = document.createElement('td');
    tdBrand.textContent = p.brand;
    tr.appendChild(tdBrand);
    
    // Category column
    const tdCat = document.createElement('td');
    tdCat.textContent = p.category;
    tr.appendChild(tdCat);
    
    // Condition column
    const tdCond = document.createElement('td');
    const condBadge = document.createElement('span');
    const isNew = p.condition === 'NUEVO' || p.condition === 'NEW';
    condBadge.className = `badge-condition ${isNew ? 'new' : 'used'}`;
    condBadge.textContent = isNew ? 'Nuevo' : 'Usado';
    tdCond.appendChild(condBadge);
    tr.appendChild(tdCond);
    
    // Cash Price column
    const tdCash = document.createElement('td');
    tdCash.className = 'text-right price-cash-highlight';
    tdCash.textContent = formatCLP(p.cash_price);
    tr.appendChild(tdCash);
    
    // Normal Price column
    const tdNormal = document.createElement('td');
    tdNormal.className = 'text-right price-normal-dim';
    tdNormal.textContent = formatCLP(p.normal_price);
    tr.appendChild(tdNormal);
    
    // Discount column
    const tdDcto = document.createElement('td');
    tdDcto.className = 'text-center';
    if (p.discount > 0) {
      const dctoBadge = document.createElement('span');
      dctoBadge.className = 'discount-badge';
      dctoBadge.textContent = `-${Math.round(p.discount)}%`;
      tdDcto.appendChild(dctoBadge);
    } else {
      tdDcto.textContent = '-';
    }
    tr.appendChild(tdDcto);
    
    // Stock column
    const tdStock = document.createElement('td');
    tdStock.className = 'text-center';
    const stockBadge = document.createElement('span');
    const hasStock = p.stock > 0;
    stockBadge.className = `stock-count-badge ${hasStock ? 'in-stock' : 'out-of-stock'}`;
    stockBadge.textContent = hasStock ? p.stock : 'Agotado';
    tdStock.appendChild(stockBadge);
    tr.appendChild(tdStock);
    
    // Actions column
    const tdAction = document.createElement('td');
    tdAction.className = 'text-center';
    const btn = document.createElement('button');
    btn.className = 'btn-icon';
    btn.title = 'Ver Ficha';
    btn.innerHTML = '<i class="fa-solid fa-eye"></i>';
    btn.addEventListener('click', () => openProductModal(p));
    tdAction.appendChild(btn);
    tr.appendChild(tdAction);
    
    tbody.appendChild(tr);
  });
}

// ==========================================================================
// COMPARISON LOGIC
// ==========================================================================

function toggleCompare(sku) {
  if (selectedForCompare.has(sku)) {
    selectedForCompare.delete(sku);
  } else {
    selectedForCompare.add(sku);
  }
  
  // Update count in Nav tab
  document.getElementById('compare-count').textContent = selectedForCompare.size;
}

function renderCompareMatrix() {
  const container = document.getElementById('no-compare-box');
  const table = document.getElementById('compare-matrix-table');
  
  table.innerHTML = '';
  
  const selectedList = products.filter(p => selectedForCompare.has(p.sku));
  
  if (selectedList.length < 2) {
    container.style.display = 'flex';
    table.style.display = 'none';
    return;
  }
  
  container.style.display = 'none';
  table.style.display = 'table';
  
  // Collect all unique detail spec keys present in these products
  const specKeysSet = new Set();
  selectedList.forEach(p => {
    Object.keys(p.detailed_specs || {}).forEach(k => specKeysSet.add(k));
  });
  const specKeys = Array.from(specKeysSet).sort();
  
  // Row 1: Header (Product Name, Image, and Remove Action)
  const headerTr = document.createElement('tr');
  const emptyTh = document.createElement('th');
  emptyTh.className = 'compare-row-header';
  emptyTh.textContent = 'Producto';
  headerTr.appendChild(emptyTh);
  
  selectedList.forEach(p => {
    const th = document.createElement('th');
    
    const card = document.createElement('div');
    card.className = 'compare-product-card';
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-compare';
    removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    removeBtn.addEventListener('click', () => {
      toggleCompare(p.sku);
      renderCompareMatrix();
    });
    
    const img = document.createElement('img');
    img.src = p.image_url || '/images/Logo-Winpy.jpg';
    img.className = 'compare-product-img';
    img.onerror = () => { img.src = '/images/Logo-Winpy.jpg'; };
    
    const title = document.createElement('div');
    title.className = 'compare-product-title';
    title.textContent = p.title;
    title.addEventListener('click', () => openProductModal(p));
    title.style.cursor = 'pointer';
    
    card.appendChild(removeBtn);
    card.appendChild(img);
    card.appendChild(title);
    th.appendChild(card);
    headerTr.appendChild(th);
  });
  table.appendChild(headerTr);
  
  // Row 2: SKU
  addCompareRow(table, 'SKU', selectedList, p => p.sku);
  
  // Row 3: Brand
  addCompareRow(table, 'Marca', selectedList, p => p.brand);
  
  // Row 4: Category
  addCompareRow(table, 'Categoría', selectedList, p => p.category);
  
  // Row 5: Cash Price (Highlight cheapest!)
  const minCash = Math.min(...selectedList.map(p => p.cash_price || Infinity));
  addCompareRow(table, 'Precio Efectivo', selectedList, p => {
    const isCheapest = p.cash_price === minCash;
    return `<span style="font-weight:700; color:${isCheapest ? 'var(--accent-green)' : 'white'}">${formatCLP(p.cash_price)}</span> ${isCheapest ? '<i class="fa-solid fa-award" style="color:var(--accent-green)"></i>' : ''}`;
  });
  
  // Row 6: Normal Price
  addCompareRow(table, 'Precio Tarjeta', selectedList, p => formatCLP(p.normal_price));
  
  // Row 7: Discount
  addCompareRow(table, 'Descuento', selectedList, p => p.discount > 0 ? `${Math.round(p.discount)}%` : '-');
  
  // Row 8: Stock
  addCompareRow(table, 'Existencia', selectedList, p => `${p.stock} unidades`);
  
  // Row 9: Condition
  addCompareRow(table, 'Condición', selectedList, p => p.condition);
  
  // Rows 10-13: General spec summaries
  addCompareRow(table, 'Procesador', selectedList, p => p.spec_processor || '---');
  addCompareRow(table, 'Memoria RAM', selectedList, p => p.spec_memory || '---');
  addCompareRow(table, 'Almacenamiento', selectedList, p => p.spec_storage || '---');
  addCompareRow(table, 'Sist. Operativo', selectedList, p => p.spec_os || '---');
  
  // Add section title for detailed specs
  const dividerTr = document.createElement('tr');
  const dividerTd = document.createElement('td');
  dividerTd.className = 'compare-row-header';
  dividerTd.style.background = 'var(--accent-purple-glow)';
  dividerTd.style.color = 'var(--accent-cyan)';
  dividerTd.textContent = 'Especificaciones Detalladas';
  dividerTr.appendChild(dividerTd);
  
  for (let i = 0; i < selectedList.length; i++) {
    const td = document.createElement('td');
    td.style.background = 'var(--accent-purple-glow)';
    dividerTr.appendChild(td);
  }
  table.appendChild(dividerTr);
  
  // Rows: Detailed Specs (Compare each key)
  specKeys.forEach(key => {
    // Check if values are different to highlight
    const values = selectedList.map(p => (p.detailed_specs || {})[key] || '---');
    const uniqueValues = new Set(values);
    const highlight = uniqueValues.size > 1;
    
    addCompareRow(table, key, selectedList, p => (p.detailed_specs || {})[key] || '---', highlight);
  });
}

function addCompareRow(table, label, productsList, extractorFn, highlight = false) {
  const tr = document.createElement('tr');
  if (highlight) {
    tr.className = 'highlight-diff';
  }
  
  const th = document.createElement('td');
  th.className = 'compare-row-header';
  th.textContent = label;
  tr.appendChild(th);
  
  productsList.forEach(p => {
    const td = document.createElement('td');
    td.innerHTML = extractorFn(p);
    tr.appendChild(td);
  });
  
  table.appendChild(tr);
}

// Clear Comparison Set
document.getElementById('btn-clear-compare').addEventListener('click', () => {
  selectedForCompare.clear();
  document.getElementById('compare-count').textContent = 0;
  // Uncheck all in catalog DOM if they are visible
  document.querySelectorAll('#catalog-table-body input[type=checkbox]').forEach(cb => {
    cb.checked = false;
  });
  renderCompareMatrix();
});

// ==========================================================================
// GROUPINGS & STATISTICS LOGIC
// ==========================================================================

function renderGroupings() {
  const criterion = document.querySelector('input[name="group-criterio"]:checked').value;
  
  // Calculate Global stats first
  let totalStock = 0;
  let totalCashPrice = 0;
  let totalNormalPrice = 0;
  let maxDcto = 0;
  let countWithPrice = 0;
  
  products.forEach(p => {
    totalStock += p.stock || 0;
    if (p.cash_price) {
      totalCashPrice += p.cash_price;
      totalNormalPrice += p.normal_price || p.cash_price;
      countWithPrice++;
    }
    if (p.discount > maxDcto) maxDcto = p.discount;
  });
  
  const avgPrice = countWithPrice > 0 ? Math.round(totalCashPrice / countWithPrice) : 0;
  const avgDiscount = totalNormalPrice > 0 ? ((1.0 - (totalCashPrice / totalNormalPrice)) * 100) : 0;
  
  document.getElementById('stat-avg-price').textContent = formatCLP(avgPrice);
  document.getElementById('stat-max-discount').textContent = `${Math.round(maxDcto)}%`;
  document.getElementById('stat-total-stock').textContent = totalStock.toLocaleString();
  document.getElementById('stat-avg-discount').textContent = `${Math.round(avgDiscount)}%`;
  
  // Aggregate by criterion (brand or category)
  const groupedData = {};
  
  products.forEach(p => {
    const key = p[criterion] || 'No Especificado';
    if (!groupedData[key]) {
      groupedData[key] = {
        name: key,
        count: 0,
        min_price: Infinity,
        max_price: 0,
        sum_price: 0,
        sum_normal_price: 0,
        stock: 0,
        count_with_price: 0
      };
    }
    
    const group = groupedData[key];
    group.count++;
    group.stock += p.stock || 0;
    
    if (p.cash_price) {
      group.count_with_price++;
      group.sum_price += p.cash_price;
      group.sum_normal_price += p.normal_price || p.cash_price;
      if (p.cash_price < group.min_price) group.min_price = p.cash_price;
      if (p.cash_price > group.max_price) group.max_price = p.cash_price;
    }
  });
  
  // Convert map to list and clean up Infinity
  const groupsList = Object.values(groupedData).map(g => {
    return {
      name: g.name,
      count: g.count,
      stock: g.stock,
      min_price: g.min_price === Infinity ? 0 : g.min_price,
      max_price: g.max_price,
      avg_price: g.count_with_price > 0 ? Math.round(g.sum_price / g.count_with_price) : 0,
      avg_discount: g.sum_normal_price > 0 ? Math.round((1.0 - (g.sum_price / g.sum_normal_price)) * 100) : 0
    };
  }).sort((a, b) => b.count - a.count); // sort by product counts
  
  // Render table
  const colHeaderName = document.getElementById('grouped-col-name');
  colHeaderName.textContent = criterion === 'brand' ? 'Marca' : 'Categoría';
  
  const tbody = document.getElementById('grouped-table-body');
  tbody.innerHTML = '';
  
  groupsList.forEach(g => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600; color:white;">${g.name.toUpperCase()}</td>
      <td class="text-center">${g.count}</td>
      <td class="text-right">${formatCLP(g.min_price)}</td>
      <td class="text-right price-cash-highlight">${formatCLP(g.avg_price)}</td>
      <td class="text-right">${formatCLP(g.max_price)}</td>
      <td class="text-center"><span class="stock-count-badge in-stock">${g.stock}</span></td>
      <td class="text-center">${g.avg_discount}%</td>
    `;
    tbody.appendChild(tr);
  });
  
  // Draw SVG chart of these groups (Top 8 for visual space)
  drawGroupingChart(groupsList.slice(0, 8), criterion);
  
  // Render new dashboard highlights and detailed category breakdown cards
  renderAnalysisHighlights();
  renderCategoryBreakdown();
}

function renderAnalysisHighlights() {
  // Filter products with valid price
  const validProducts = products.filter(p => p.cash_price && p.cash_price > 0);
  
  // 1. Most expensive
  const mostExpensive = [...validProducts]
    .sort((a, b) => b.cash_price - a.cash_price)
    .slice(0, 5);
  populateHighlightList('list-most-expensive', mostExpensive, 'price');
  
  // 2. Cheapest
  const cheapest = [...validProducts]
    .sort((a, b) => a.cash_price - b.cash_price)
    .slice(0, 5);
  populateHighlightList('list-cheapest', cheapest, 'price');
  
  // 3. Highest Stock
  const highestStock = [...products]
    .sort((a, b) => b.stock - a.stock)
    .slice(0, 5);
  populateHighlightList('list-highest-stock', highestStock, 'stock');
  
  // 4. Lowest Stock (but > 0)
  const lowestStock = products.filter(p => p.stock && p.stock > 0)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 5);
  populateHighlightList('list-lowest-stock', lowestStock, 'stock-low');
}

function populateHighlightList(elementId, items, valueType) {
  const ul = document.getElementById(elementId);
  ul.innerHTML = '';
  
  if (items.length === 0) {
    ul.innerHTML = '<li class="text-center" style="color:var(--text-muted); font-size:0.8rem; padding: 1rem 0;">Sin datos</li>';
    return;
  }
  
  items.forEach(p => {
    const li = document.createElement('li');
    li.className = 'highlight-li';
    
    const img = document.createElement('img');
    img.src = p.image_url || '/images/Logo-Winpy.jpg';
    img.className = 'highlight-li-img';
    img.onerror = () => { img.src = '/images/Logo-Winpy.jpg'; };
    img.addEventListener('click', () => openProductModal(p));
    
    const info = document.createElement('div');
    info.className = 'highlight-li-info';
    
    const title = document.createElement('span');
    title.className = 'highlight-li-title';
    title.textContent = p.title;
    title.addEventListener('click', () => openProductModal(p));
    
    const meta = document.createElement('div');
    meta.className = 'highlight-li-meta';
    
    const brand = document.createElement('span');
    brand.className = 'highlight-li-brand';
    brand.textContent = p.brand || 'WINPY';
    
    const val = document.createElement('span');
    val.className = 'highlight-li-val';
    
    if (valueType === 'price') {
      val.className += ' price';
      val.textContent = formatCLP(p.cash_price);
    } else if (valueType === 'stock') {
      val.className += ' stock';
      val.textContent = `${p.stock} uds`;
    } else if (valueType === 'stock-low') {
      val.className += ' stock-low';
      val.textContent = `${p.stock} uds`;
    }
    
    meta.appendChild(brand);
    meta.appendChild(val);
    info.appendChild(title);
    info.appendChild(meta);
    li.appendChild(img);
    li.appendChild(info);
    ul.appendChild(li);
  });
}

function renderCategoryBreakdown() {
  const container = document.getElementById('category-analysis-container');
  container.innerHTML = '';
  
  const categoryData = {};
  
  products.forEach(p => {
    const cat = p.category || 'Otros';
    if (!categoryData[cat]) {
      categoryData[cat] = {
        name: cat,
        products: []
      };
    }
    categoryData[cat].products.push(p);
  });
  
  const sortedCategories = Object.keys(categoryData).sort();
  
  if (sortedCategories.length === 0) {
    container.innerHTML = '<div class="text-center" style="color:var(--text-muted); padding:2rem; grid-column:1/-1;">Sin datos.</div>';
    return;
  }
  
  sortedCategories.forEach(catName => {
    const cat = categoryData[catName];
    const count = cat.products.length;
    let totalStock = 0;
    let sumPrice = 0;
    let sumNormalPrice = 0;
    let countWithPrice = 0;
    
    let cheapestProduct = null;
    let expensiveProduct = null;
    
    cat.products.forEach(p => {
      totalStock += p.stock || 0;
      if (p.cash_price) {
        sumPrice += p.cash_price;
        sumNormalPrice += p.normal_price || p.cash_price;
        countWithPrice++;
        
        if (!cheapestProduct || p.cash_price < cheapestProduct.cash_price) {
          cheapestProduct = p;
        }
        if (!expensiveProduct || p.cash_price > expensiveProduct.cash_price) {
          expensiveProduct = p;
        }
      }
    });
    
    const avgPrice = countWithPrice > 0 ? Math.round(sumPrice / countWithPrice) : 0;
    const avgDiscount = sumNormalPrice > 0 ? Math.round((1.0 - (sumPrice / sumNormalPrice)) * 100) : 0;
    
    const card = document.createElement('div');
    card.className = 'category-analysis-item';
    
    // Header
    const h4 = document.createElement('h4');
    h4.textContent = catName;
    card.appendChild(h4);
    
    // Stats rows
    card.appendChild(createStatsRow('Productos', count));
    card.appendChild(createStatsRow('Stock Total', totalStock));
    card.appendChild(createStatsRow('Precio Promedio', formatCLP(avgPrice)));
    card.appendChild(createStatsRow('Dcto. Promedio', `${avgDiscount}%`));
    
    // Cheapest Product
    const cheapestRow = document.createElement('div');
    cheapestRow.className = 'category-stats-row';
    const cheapestLbl = document.createElement('span');
    cheapestLbl.textContent = 'Más Barato';
    cheapestRow.appendChild(cheapestLbl);
    
    const cheapestVal = document.createElement('div');
    cheapestVal.className = 'category-extreme-item';
    if (cheapestProduct) {
      const titleSpan = document.createElement('span');
      titleSpan.className = 'category-extreme-title';
      titleSpan.textContent = cheapestProduct.title;
      titleSpan.title = cheapestProduct.title;
      titleSpan.addEventListener('click', () => openProductModal(cheapestProduct));
      
      const priceSpan = document.createElement('span');
      priceSpan.style.color = 'var(--accent-green)';
      priceSpan.style.fontWeight = '700';
      priceSpan.textContent = formatCLP(cheapestProduct.cash_price);
      
      cheapestVal.appendChild(titleSpan);
      cheapestVal.appendChild(priceSpan);
    } else {
      cheapestVal.textContent = '---';
    }
    cheapestRow.appendChild(cheapestVal);
    card.appendChild(cheapestRow);
    
    // Most Expensive Product
    const expensiveRow = document.createElement('div');
    expensiveRow.className = 'category-stats-row';
    const expensiveLbl = document.createElement('span');
    expensiveLbl.textContent = 'Más Caro';
    expensiveRow.appendChild(expensiveLbl);
    
    const expensiveVal = document.createElement('div');
    expensiveVal.className = 'category-extreme-item';
    if (expensiveProduct) {
      const titleSpan = document.createElement('span');
      titleSpan.className = 'category-extreme-title';
      titleSpan.textContent = expensiveProduct.title;
      titleSpan.title = expensiveProduct.title;
      titleSpan.addEventListener('click', () => openProductModal(expensiveProduct));
      
      const priceSpan = document.createElement('span');
      priceSpan.style.color = 'white';
      priceSpan.style.fontWeight = '700';
      priceSpan.textContent = formatCLP(expensiveProduct.cash_price);
      
      expensiveVal.appendChild(titleSpan);
      expensiveVal.appendChild(priceSpan);
    } else {
      expensiveVal.textContent = '---';
    }
    expensiveRow.appendChild(expensiveVal);
    card.appendChild(expensiveRow);
    
    container.appendChild(card);
  });
}

function createStatsRow(label, value) {
  const row = document.createElement('div');
  row.className = 'category-stats-row';
  row.innerHTML = `<span>${label}</span><span>${value}</span>`;
  return row;
}

// Hook group criterion radio buttons
document.querySelectorAll('input[name="group-criterio"]').forEach(radio => {
  radio.addEventListener('change', renderGroupings);
});

function drawGroupingChart(groups, labelType) {
  const svg = document.getElementById('grouping-chart');
  svg.innerHTML = ''; // clear
  
  if (groups.length === 0) return;
  
  const svgWidth = svg.clientWidth || 500;
  const svgHeight = 220;
  const paddingLeft = 100;
  const paddingRight = 30;
  const paddingTop = 20;
  const paddingBottom = 30;
  
  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;
  
  const maxCount = Math.max(...groups.map(g => g.count));
  const barHeight = Math.min(22, (chartHeight / groups.length) - 6);
  
  // Title
  const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
  title.setAttribute("x", "10");
  title.setAttribute("y", "15");
  title.setAttribute("class", "chart-title");
  title.textContent = `Productos por ${labelType === 'brand' ? 'Marca' : 'Categoría'} (Top 8)`;
  svg.appendChild(title);
  
  // Draw Y axis line
  const axis = document.createElementNS("http://www.w3.org/2000/svg", "line");
  axis.setAttribute("x1", paddingLeft);
  axis.setAttribute("y1", paddingTop);
  axis.setAttribute("x2", paddingLeft);
  axis.setAttribute("y2", svgHeight - paddingBottom);
  axis.setAttribute("class", "axis-line");
  svg.appendChild(axis);
  
  groups.forEach((g, idx) => {
    const y = paddingTop + (idx * (chartHeight / groups.length)) + 4;
    
    // Label text
    const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
    txt.setAttribute("x", paddingLeft - 10);
    txt.setAttribute("y", y + (barHeight / 2) + 4);
    txt.setAttribute("text-anchor", "end");
    txt.setAttribute("style", "font-weight: 500; fill: #fff;");
    // Shorten label if too long
    const lbl = g.name.length > 14 ? g.name.substring(0, 12) + '..' : g.name;
    txt.textContent = lbl.toUpperCase();
    svg.appendChild(txt);
    
    // Bar
    const width = maxCount > 0 ? (g.count / maxCount) * chartWidth : 0;
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", paddingLeft);
    rect.setAttribute("y", y);
    rect.setAttribute("width", Math.max(width, 2));
    rect.setAttribute("height", barHeight);
    rect.setAttribute("class", "bar");
    
    // Add tooltip / hover color logic or labels inside bar
    const barVal = document.createElementNS("http://www.w3.org/2000/svg", "text");
    barVal.setAttribute("x", paddingLeft + width + 6);
    barVal.setAttribute("y", y + (barHeight / 2) + 4);
    barVal.setAttribute("style", "fill: var(--accent-cyan); font-weight:700;");
    barVal.textContent = g.count;
    
    svg.appendChild(rect);
    svg.appendChild(barVal);
  });
}

// ==========================================================================
// DETAILS MODAL LOGIC & GRAPH
// ==========================================================================

function initModalListeners() {
  const modal = document.getElementById('product-modal');
  const closeBtn = document.getElementById('btn-close-modal');
  
  closeBtn.addEventListener('click', () => {
    modal.classList.remove('active');
  });
  
  // Close modal when clicking on overlay background
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });
  
  // Tab inside modal switching
  const tabBtns = document.querySelectorAll('.modal-tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-modal-tab');
      
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      document.querySelectorAll('.modal-tab-content').forEach(c => {
        c.classList.remove('active');
      });
      document.getElementById(target).classList.add('active');
    });
  });
  
  // Local Search in Detailed specs modal tab
  document.getElementById('raw-specs-search').addEventListener('input', (e) => {
    const text = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#modal-raw-specs-table-body tr');
    rows.forEach(row => {
      const match = row.innerText.toLowerCase().includes(text);
      row.style.display = match ? 'table-row' : 'none';
    });
  });
}

function openProductModal(p) {
  // Populate basic text
  document.getElementById('modal-product-title').textContent = p.title;
  document.getElementById('modal-product-sku').textContent = p.sku || '---';
  document.getElementById('modal-product-brand').textContent = p.brand || '---';
  document.getElementById('modal-product-cat').textContent = p.category || '---';
  
  // Condition
  const isNew = p.condition === 'NUEVO' || p.condition === 'NEW';
  const condBadge = document.getElementById('modal-product-condition');
  condBadge.className = `modal-badge-condition ${isNew ? 'new' : 'used'}`;
  condBadge.textContent = isNew ? 'Nuevo' : 'Usado';
  
  // Image
  const img = document.getElementById('modal-product-img');
  img.src = p.image_url || '/images/Logo-Winpy.jpg';
  img.onerror = () => { img.src = '/images/Logo-Winpy.jpg'; };
  
  // Prices
  document.getElementById('modal-price-cash').textContent = formatCLP(p.cash_price);
  document.getElementById('modal-price-normal').textContent = formatCLP(p.normal_price);
  
  // Stock
  const stockText = document.getElementById('modal-product-stock');
  if (p.stock > 0) {
    stockText.innerHTML = `<i class="fa-solid fa-cubes" style="color:var(--accent-cyan);"></i> ${p.stock} unidades en stock`;
  } else {
    stockText.innerHTML = `<i class="fa-solid fa-cubes" style="color:var(--accent-red);"></i> Agotado`;
  }
  
  // URL Link
  document.getElementById('modal-product-url').href = p.url || '#';
  
  // General summary specs cards
  document.getElementById('modal-spec-proc').textContent = p.spec_processor || 'No especificado';
  document.getElementById('modal-spec-ram').textContent = p.spec_memory || 'No especificada';
  document.getElementById('modal-spec-storage').textContent = p.spec_storage || 'No especificado';
  document.getElementById('modal-spec-os').textContent = p.spec_os || 'No especificado';
  
  // Populate Detailed Technical table
  const rawBody = document.getElementById('modal-raw-specs-table-body');
  rawBody.innerHTML = '';
  
  const specsObj = p.detailed_specs || {};
  const keys = Object.keys(specsObj).sort();
  
  if (keys.length === 0) {
    rawBody.innerHTML = `<tr><td colspan="2" class="text-center" style="color:var(--text-muted)">No hay especificaciones técnicas detalladas.</td></tr>`;
  } else {
    keys.forEach(k => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${k}</td>
        <td style="color:white">${specsObj[k]}</td>
      `;
      rawBody.appendChild(tr);
    });
  }
  
  // Clear search on specs
  document.getElementById('raw-specs-search').value = '';
  
  // Populate Price History table & line graph
  populatePriceHistory(p);
  
  // Open modal visually
  const modal = document.getElementById('product-modal');
  modal.classList.add('active');
  
  // Activate first tab by default
  document.querySelector('.modal-tab-btn[data-modal-tab="modal-tab-specs"]').click();
}

function populatePriceHistory(product) {
  const tbody = document.getElementById('modal-history-table-body');
  tbody.innerHTML = '';
  
  // Make sure history is sorted chronologically
  const history = (product.price_history || []).sort((a, b) => new Date(a.date) - new Date(b.date));
  
  if (history.length === 0) {
    // Add current price as default entry if history is empty
    const today = new Date().toISOString().split('T')[0];
    history.push({
      date: today,
      cash_price: product.cash_price,
      normal_price: product.normal_price,
      stock: product.stock
    });
  }
  
  // Fill history table row by row
  history.forEach((h, idx) => {
    const tr = document.createElement('tr');
    
    // Trend icon indicator
    let trendIcon = '<span class="trend-indicator flat"><i class="fa-solid fa-minus"></i> Estable</span>';
    if (idx > 0) {
      const prev = history[idx - 1];
      if (h.cash_price < prev.cash_price) {
        trendIcon = '<span class="trend-indicator down"><i class="fa-solid fa-arrow-down"></i> Bajó</span>';
      } else if (h.cash_price > prev.cash_price) {
        trendIcon = '<span class="trend-indicator up"><i class="fa-solid fa-arrow-up"></i> Subió</span>';
      }
    }
    
    tr.innerHTML = `
      <td style="font-weight:600; color:white;">${formatDateString(h.date)}</td>
      <td class="text-right price-cash-highlight">${formatCLP(h.cash_price)}</td>
      <td class="text-right price-normal-dim">${formatCLP(h.normal_price)}</td>
      <td class="text-center">${h.stock}</td>
      <td class="text-center">${trendIcon}</td>
    `;
    tbody.appendChild(tr);
  });
  
  // Draw price trend mini SVG graph
  drawPriceTrendChart(history);
}

function drawPriceTrendChart(history) {
  const svg = document.getElementById('history-line-chart');
  svg.innerHTML = ''; // clear
  
  const width = svg.clientWidth || 400;
  const height = 150;
  const paddingX = 40;
  const paddingY = 20;
  
  const chartW = width - (paddingX * 2);
  const chartH = height - (paddingY * 2);
  
  // Draw backgrounds grid
  for (let i = 0; i <= 3; i++) {
    const gridY = paddingY + (chartH * i / 3);
    const gridLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    gridLine.setAttribute("x1", paddingX);
    gridLine.setAttribute("y1", gridY);
    gridLine.setAttribute("x2", width - paddingX);
    gridLine.setAttribute("y2", gridY);
    gridLine.setAttribute("stroke", "rgba(255,255,255,0.04)");
    gridLine.setAttribute("stroke-width", "1");
    svg.appendChild(gridLine);
  }
  
  if (history.length < 2) {
    // Write text "Insuficientes puntos históricos para graficar"
    const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
    txt.setAttribute("x", width / 2);
    txt.setAttribute("y", height / 2);
    txt.setAttribute("text-anchor", "middle");
    txt.setAttribute("style", "fill:var(--text-muted); font-size:11px;");
    txt.textContent = "Guardando historial de precios... Se requieren 2+ registros.";
    svg.appendChild(txt);
    return;
  }
  
  const prices = history.map(h => h.cash_price).filter(p => p !== null);
  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(...prices);
  const priceRange = maxPrice - minPrice || 1000; // avoid div by 0
  
  // Normalize prices to pixels coords
  const points = [];
  history.forEach((h, idx) => {
    const x = paddingX + (idx * (chartW / (history.length - 1)));
    const yVal = h.cash_price;
    // inverse y because in SVG 0 is top
    const y = paddingY + chartH - ((yVal - minPrice) / priceRange) * chartH;
    points.push({ x, y, price: yVal, date: h.date });
  });
  
  // Plot line path
  const pathStr = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  
  // Draw Area under curve path
  const areaStr = `${pathStr} L ${points[points.length-1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;
  const areaPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  areaPath.setAttribute("d", areaStr);
  areaPath.setAttribute("fill", "url(#purple-grad)");
  areaPath.setAttribute("opacity", "0.2");
  
  // Define Gradient definitions in SVG
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML = `
    <linearGradient id="purple-grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="var(--accent-purple-light)" />
      <stop offset="100%" stop-color="var(--accent-purple)" stop-opacity="0" />
    </linearGradient>
  `;
  svg.appendChild(defs);
  svg.appendChild(areaPath);
  
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathStr);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "var(--accent-cyan)");
  path.setAttribute("stroke-width", "2");
  svg.appendChild(path);
  
  // Draw points circles & labels
  points.forEach((p, idx) => {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", p.x);
    circle.setAttribute("cy", p.y);
    circle.setAttribute("r", "4");
    circle.setAttribute("fill", "var(--accent-purple-light)");
    circle.setAttribute("stroke", "white");
    circle.setAttribute("stroke-width", "1");
    svg.appendChild(circle);
    
    // Label for first and last, or top prices
    if (idx === 0 || idx === points.length - 1) {
      const lbl = document.createElementNS("http://www.w3.org/2000/svg", "text");
      lbl.setAttribute("x", p.x);
      lbl.setAttribute("y", p.y - 8);
      lbl.setAttribute("text-anchor", idx === 0 ? "start" : "end");
      lbl.setAttribute("style", "fill:white; font-size:9px; font-weight:700;");
      lbl.textContent = formatCLP(p.price);
      svg.appendChild(lbl);
    }
  });
  
  // Labels for dates on X axis (start and end)
  const startDate = document.createElementNS("http://www.w3.org/2000/svg", "text");
  startDate.setAttribute("x", paddingX);
  startDate.setAttribute("y", height - 4);
  startDate.setAttribute("text-anchor", "start");
  startDate.setAttribute("style", "fill:var(--text-muted); font-size:9px;");
  startDate.textContent = formatDateString(points[0].date);
  svg.appendChild(startDate);
  
  const endDate = document.createElementNS("http://www.w3.org/2000/svg", "text");
  endDate.setAttribute("x", width - paddingX);
  endDate.setAttribute("y", height - 4);
  endDate.setAttribute("text-anchor", "end");
  endDate.setAttribute("style", "fill:var(--text-muted); font-size:9px;");
  endDate.textContent = formatDateString(points[points.length-1].date);
  svg.appendChild(endDate);
}

// ==========================================================================
// HELPERS
// ==========================================================================

function formatCLP(val) {
  if (val === null || val === undefined) return '$ ---';
  return '$ ' + val.toLocaleString('es-CL');
}

function formatDateString(isoString) {
  if (!isoString) return '---';
  // Check if date is YYYY-MM-DD
  const parts = isoString.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  // Otherwise parse as date
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('es-CL');
  } catch (e) {
    return isoString;
  }
}

// Export Catalog table to CSV file download
function exportToCSV() {
  if (products.length === 0) return;
  
  let csvContent = "data:text/csv;charset=utf-8,";
  
  // CSV Headers
  csvContent += "SKU,Title,Brand,Category,Condition,Cash Price (CLP),Normal Price (CLP),Discount (%),Stock,URL\n";
  
  // Rows
  products.forEach(p => {
    const title = (p.title || '').replace(/"/g, '""');
    const row = [
      p.sku || '',
      `"${title}"`,
      p.brand || '',
      p.category || '',
      p.condition || '',
      p.cash_price || '',
      p.normal_price || '',
      p.discount || '0',
      p.stock || '0',
      p.url || ''
    ].join(',');
    csvContent += row + "\n";
  });
  
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `winpy_products_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link); // Required for FF
  
  link.click();
  document.body.removeChild(link);
}
