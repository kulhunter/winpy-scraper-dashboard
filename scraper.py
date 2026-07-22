#!/usr/bin/env python3
import os
import sys
import re
import time
import json
import sqlite3
import argparse
import datetime
import urllib.parse
from curl_cffi import requests
from bs4 import BeautifulSoup
import warnings
from bs4 import XMLParsedAsHTMLWarning

# Mute beautifulsoup XML as HTML warning
warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

BASE_URL = "https://www.winpy.cl/"
DB_FILE = "winpy_products.db"

# Ignored patterns in sitemap for category pages
IGNORED_KEYWORDS = [
    'que-es-winpy', 'como-comprar', 'que-forma-de-pago', 'acerca-de-la-garantia',
    'politicas-de-privacidad', 'terminos-y-condiciones', 'garantias', 'trabaja-con-nosotros',
    'contacto', 'estado-de-compra', 'formas-de-pago', 'retiros-y-despachos', 'solicita-factura'
]

def log_progress(phase, current, total, message="", extra=None):
    """Outputs structured JSON to stdout for the server to read."""
    payload = {
        "type": "progress",
        "phase": phase,
        "current": current,
        "total": total,
        "message": message,
        "timestamp": datetime.datetime.now().isoformat()
    }
    if extra:
        payload.update(extra)
    print(json.dumps(payload), flush=True)

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Categories table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS categories (
        url TEXT PRIMARY KEY,
        scraped INTEGER DEFAULT 0,
        last_scraped_at TEXT
    )
    """)
    
    # Product URL Queue table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS product_queue (
        url TEXT PRIMARY KEY,
        category TEXT,
        status TEXT DEFAULT 'pending',
        attempts INTEGER DEFAULT 0,
        error TEXT,
        updated_at TEXT
    )
    """)
    
    # Products table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS products (
        sku TEXT PRIMARY KEY,
        title TEXT,
        brand TEXT,
        category TEXT,
        condition TEXT,
        url TEXT,
        cash_price INTEGER,
        normal_price INTEGER,
        discount REAL,
        stock INTEGER,
        spec_processor TEXT,
        spec_memory TEXT,
        spec_storage TEXT,
        spec_os TEXT,
        detailed_specs TEXT,
        image_url TEXT,
        scraped_at TEXT
    )
    """)
    
    # Price History table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS price_history (
        sku TEXT,
        date TEXT,
        cash_price INTEGER,
        normal_price INTEGER,
        stock INTEGER,
        PRIMARY KEY (sku, date)
    )
    """)
    
    conn.commit()
    conn.close()

def load_sitemap(limit_pattern=None):
    """Fetches sitemap and loads valid category URLs into the database."""
    init_db()
    log_progress("init", 0, 1, "Obteniendo sitemap.xml...")
    
    try:
        r = requests.get(urllib.parse.urljoin(BASE_URL, "sitemap.xml"), impersonate="chrome")
        if r.status_code != 200:
            log_progress("init", 0, 1, f"Error al cargar sitemap: HTTP {r.status_code}")
            return False
            
        soup = BeautifulSoup(r.text, "html.parser")
        urls = [loc.text.strip() for loc in soup.find_all("loc")]
        
        valid_cats = []
        for u in urls:
            if u == BASE_URL or u == BASE_URL.rstrip("/"):
                continue
            if any(k in u for k in IGNORED_KEYWORDS):
                continue
            # Apply limit pattern if provided
            if limit_pattern and limit_pattern.lower() not in u.lower():
                continue
            valid_cats.append(u)
            
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # We insert or ignore to avoid resetting scraped categories if we rerun
        new_count = 0
        for u in valid_cats:
            cursor.execute("INSERT OR IGNORE INTO categories (url, scraped) VALUES (?, 0)", (u,))
            if cursor.rowcount > 0:
                new_count += 1
                
        conn.commit()
        
        # Get total categories in DB
        cursor.execute("SELECT COUNT(*) FROM categories")
        total_cats = cursor.fetchone()[0]
        conn.close()
        
        log_progress("init", 1, 1, f"Sitemap cargado. {new_count} nuevas categorías agregadas. Total en DB: {total_cats}")
        return True
    except Exception as e:
        log_progress("init", 0, 1, f"Excepción cargando sitemap: {str(e)}")
        return False

def crawl_category(category_url):
    """Crawls a category, handles pagination, and adds product links to the queue."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    log_progress("crawl_categories", 0, 1, f"Iniciando rastreo de categoría: {category_url}")
    
    # Extract category name from URL for categorization
    parsed = urllib.parse.urlparse(category_url)
    path_parts = [p for p in parsed.path.split("/") if p]
    category_name = path_parts[-1] if path_parts else "general"
    
    current_page = 1
    total_products_found = 0
    
    while True:
        # Construct URL for the page
        if current_page == 1:
            page_url = category_url
        else:
            page_url = urllib.parse.urljoin(category_url, f"paged/{current_page}/")
            
        log_progress("crawl_categories", current_page, current_page + 1, f"Buscando productos en {page_url}...")
        
        try:
            r = requests.get(page_url, impersonate="chrome")
            # If 404 or other error on pagination page, we stop
            if r.status_code != 200:
                log_progress("crawl_categories", current_page, current_page, f"Fin de paginación o error en {page_url} (HTTP {r.status_code})")
                break
                
            soup = BeautifulSoup(r.text, "html.parser")
            articles = soup.find_all("article")
            
            if not articles:
                log_progress("crawl_categories", current_page, current_page, f"No se encontraron productos en la página {current_page}.")
                break
                
            page_added = 0
            for art in articles:
                # Find the first link which contains the product detail url
                link_tag = art.find("a")
                if not link_tag:
                    continue
                href = link_tag.get("href", "")
                if not href or not href.startswith("/venta/"):
                    continue
                    
                prod_url = urllib.parse.urljoin(BASE_URL, href)
                
                # Check if this product is already in queue
                cursor.execute("INSERT OR IGNORE INTO product_queue (url, category, status, attempts) VALUES (?, ?, 'pending', 0)", (prod_url, category_name))
                if cursor.rowcount > 0:
                    page_added += 1
                    total_products_found += 1
                    
            conn.commit()
            log_progress("crawl_categories", current_page, current_page, f"Página {current_page} procesada. {page_added} nuevos productos encolados.")
            
            # Check if there is a next page. Look for a paginador link with page current_page + 1
            # Or we can see if the count of pages is in the paginator block
            paginator = soup.find(class_="paginador")
            if not paginator:
                # No paginator means single page
                break
                
            # If there is a paginator, check if page current_page + 1 exists in the HTML links
            next_page_str = f"paged/{current_page + 1}/"
            has_next = False
            for a in paginator.find_all("a"):
                if next_page_str in a.get("href", ""):
                    has_next = True
                    break
            
            if not has_next:
                log_progress("crawl_categories", current_page, current_page, "No se detecta página siguiente en el paginador.")
                break
                
            current_page += 1
            # Polite delay between pages
            time.sleep(0.8)
            
        except Exception as e:
            log_progress("crawl_categories", current_page, current_page, f"Error rastreando página {page_url}: {str(e)}")
            break
            
    # Mark category as scraped
    cursor.execute("UPDATE categories SET scraped = 1, last_scraped_at = ? WHERE url = ?", (datetime.datetime.now().isoformat(), category_url))
    conn.commit()
    conn.close()
    
    log_progress("crawl_categories", 1, 1, f"Categoría terminada. Total productos encolados: {total_products_found}", {"category": category_url})
    return total_products_found

def scrape_product_detail(product_url):
    """Scrapes individual product page details and saves them to products/price_history tables."""
    try:
        r = requests.get(product_url, impersonate="chrome")
        if r.status_code != 200:
            return {"success": False, "error": f"HTTP status {r.status_code}"}
            
        soup = BeautifulSoup(r.text, "html.parser")
        
        # Div details container
        details_div = soup.find(id="details-product")
        if not details_div:
            return {"success": False, "error": "No se encontró el contenedor '#details-product'"}
            
        # 1. Title
        title = soup.title.string.split("|")[0].strip() if soup.title else ""
        if not title:
            # Fallback title from page
            h1 = soup.find("h1")
            title = h1.get_text(strip=True) if h1 else ""
            
        # 2. Metadata elements
        category_tag = details_div.find(itemprop="category")
        category = category_tag.get_text(strip=True) if category_tag else ""
        
        brand_tag = details_div.find(itemprop="manufacturer")
        brand = brand_tag.get_text(strip=True).upper() if brand_tag else ""
        
        gtin_tag = details_div.find(itemprop="gtin")
        gtin = gtin_tag.get_text(strip=True) if gtin_tag else ""
        
        # 3. Prices
        # Cash Price (Transferencia / Depósito)
        cash_price_tag = details_div.find(itemprop="lowPrice")
        cash_price = None
        if cash_price_tag:
            try:
                cash_price = int(cash_price_tag.get_text(strip=True).replace(".", "").replace("$", ""))
            except ValueError:
                pass
        
        # Normal Price (Otros medios de pago)
        normal_price_tag = details_div.find(itemprop="highPrice")
        normal_price = None
        if normal_price_tag:
            try:
                normal_price = int(normal_price_tag.get_text(strip=True).replace(".", "").replace("$", ""))
            except ValueError:
                pass
        
        # Stock count
        stock_tag = details_div.find(itemprop="offerCount")
        stock = 0
        if stock_tag:
            try:
                stock = int(stock_tag.get_text(strip=True))
            except ValueError:
                pass
        else:
            # Parse text from stock-product h3 if count tag is missing
            stock_h3 = details_div.find(id="stock-product")
            if stock_h3:
                h3_text = stock_h3.find("h3")
                if h3_text:
                    match = re.search(r"(\d+)", h3_text.get_text())
                    if match:
                        stock = int(match.group(1))
                        
        # Discount if any (usually found in listing or page. Let's see if we can calculate it)
        discount = 0.0
        if normal_price and cash_price and normal_price > 0:
            discount = round((1.0 - (cash_price / normal_price)) * 100, 1)
            
        # SKU & Condition
        sku = ""
        sku_tag = details_div.find(class_="sku")
        if sku_tag:
            sku = sku_tag.get_text(strip=True)
        if not sku and gtin:
            sku = gtin  # fallback
            
        condition = "NEW"
        cond_tag = details_div.find(class_="condition")
        if cond_tag:
            condition = cond_tag.get_text(strip=True).upper()
            
        # 4. Summary specs from spec-product
        spec_proc = ""
        spec_mem = ""
        spec_storage = ""
        spec_os = ""
        
        spec_div = details_div.find(id="spec-product")
        if spec_div:
            paragraphs = spec_div.find_all("p")
            for p in paragraphs:
                style_bg = p.get("style", "")
                b_tag = p.find("b")
                b_text = b_tag.get_text(strip=True) if b_tag else ""
                
                if "ico-proce" in style_bg or "Procesador" in p.text:
                    spec_proc = b_text
                elif "ico-memo" in style_bg or "Memoria" in p.text:
                    spec_mem = b_text
                elif "ico-disco" in style_bg or "Almacenamiento" in p.text:
                    spec_storage = b_text
                elif "ico-sistema" in style_bg or "Sistema Operativo" in p.text:
                    spec_os = b_text
                    
        # 5. Image URL
        image_url = ""
        # The first image in the product page is typically the main product image
        # Let's search inside #details-product or the whole page
        main_img = soup.find(id="galerias")
        if main_img:
            img = main_img.find("img")
            if img:
                image_url = urllib.parse.urljoin(BASE_URL, img.get("src", ""))
        if not image_url:
            # Fallback: search for meta og:image or any image on page
            og_img = soup.find("meta", property="og:image")
            if og_img:
                image_url = urllib.parse.urljoin(BASE_URL, og_img.get("content", ""))
            else:
                # Look in details div
                img = details_div.find("img")
                if img:
                    image_url = urllib.parse.urljoin(BASE_URL, img.get("src", ""))
        else:
            # Guarantee it's absolute
            image_url = urllib.parse.urljoin(BASE_URL, image_url)

        # 6. Detailed specs table
        detailed_specs = {}
        spec_table = soup.find("table")
        if spec_table:
            rows = spec_table.find_all("tr")
            for r_row in rows:
                cols = r_row.find_all(["td", "th"])
                if len(cols) >= 2:
                    key = cols[0].get_text(strip=True)
                    val = cols[1].get_text(strip=True)
                    if key:
                        detailed_specs[key] = val
                        
        # If detailed specs table is empty, see if we can find other tables
        if not detailed_specs:
            all_tables = soup.find_all("table")
            for table in all_tables:
                rows = table.find_all("tr")
                for r_row in rows:
                    cols = r_row.find_all(["td", "th"])
                    if len(cols) >= 2:
                        key = cols[0].get_text(strip=True)
                        val = cols[1].get_text(strip=True)
                        if key:
                            detailed_specs[key] = val

        # Clean SKU
        if not sku:
            # Try to extract SKU from title or url
            sku = product_url.rstrip("/").split("-")[-1]
            
        product_data = {
            "sku": sku,
            "title": title,
            "brand": brand,
            "category": category if category else category_url.split("/")[-2],
            "condition": condition,
            "url": product_url,
            "cash_price": cash_price,
            "normal_price": normal_price,
            "discount": discount,
            "stock": stock,
            "spec_processor": spec_proc,
            "spec_memory": spec_mem,
            "spec_storage": spec_storage,
            "spec_os": spec_os,
            "detailed_specs": json.dumps(detailed_specs, ensure_ascii=False),
            "image_url": image_url,
            "scraped_at": datetime.datetime.now().isoformat()
        }
        
        return {"success": True, "data": product_data}
        
    except Exception as e:
        return {"success": False, "error": str(e)}

def scrape_queued_products():
    """Loops through pending products in queue, scrapes them, and updates DB."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Get count of pending items
    cursor.execute("SELECT COUNT(*) FROM product_queue WHERE status = 'pending'")
    total_pending = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM product_queue WHERE status = 'completed'")
    total_completed_before = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM product_queue")
    total_queue = cursor.fetchone()[0]
    
    log_progress("scrape_products", total_completed_before, total_queue, f"Iniciando raspado de productos. Pendientes: {total_pending}")
    
    # Select all pending items
    cursor.execute("SELECT url, category, attempts FROM product_queue WHERE status = 'pending'")
    pending_items = cursor.fetchall()
    conn.close()
    
    current_count = total_completed_before
    
    for url, category, attempts in pending_items:
        current_count += 1
        log_progress("scrape_products", current_count, total_queue, f"Raspando ({current_count}/{total_queue}): {url}", {"url": url})
        
        # Retry logic
        result = scrape_product_detail(url)
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        if result["success"]:
            data = result["data"]
            # Save product
            cursor.execute("""
            INSERT OR REPLACE INTO products (
                sku, title, brand, category, condition, url, cash_price, normal_price, 
                discount, stock, spec_processor, spec_memory, spec_storage, spec_os, 
                detailed_specs, image_url, scraped_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                data["sku"], data["title"], data["brand"], data["category"], data["condition"],
                data["url"], data["cash_price"], data["normal_price"], data["discount"], data["stock"],
                data["spec_processor"], data["spec_memory"], data["spec_storage"], data["spec_os"],
                data["detailed_specs"], data["image_url"], data["scraped_at"]
            ))
            
            # Save price history
            today = datetime.date.today().isoformat()
            cursor.execute("""
            INSERT OR REPLACE INTO price_history (sku, date, cash_price, normal_price, stock)
            VALUES (?, ?, ?, ?, ?)
            """, (data["sku"], today, data["cash_price"], data["normal_price"], data["stock"]))
            
            # Mark queue item as completed
            cursor.execute("""
            UPDATE product_queue 
            SET status = 'completed', updated_at = ? 
            WHERE url = ?
            """, (datetime.datetime.now().isoformat(), url))
            
            conn.commit()
            log_progress("scrape_products", current_count, total_queue, f"Producto guardado: {data['title'][:40]}...", {"sku": data["sku"]})
        else:
            # Mark failed
            new_attempts = attempts + 1
            status = 'failed' if new_attempts >= 3 else 'pending'
            cursor.execute("""
            UPDATE product_queue 
            SET status = ?, attempts = ?, error = ?, updated_at = ? 
            WHERE url = ?
            """, (status, new_attempts, result["error"], datetime.datetime.now().isoformat(), url))
            conn.commit()
            log_progress("scrape_products", current_count, total_queue, f"Error raspando producto {url}: {result['error']}")
        conn.close()
        # Polite delay to avoid rate limiting
        time.sleep(0.8)
        
    log_progress("scrape_products", total_queue, total_queue, "Raspado de productos finalizado con éxito.")
    export_to_json()

def export_to_json():
    """Exports all products and their price history from SQLite to docs/products.json."""
    log_progress("export", 0, 1, "Exportando datos de la base de datos a docs/products.json...")
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # Query all products
        cursor.execute("SELECT * FROM products")
        columns = [col[0] for col in cursor.description]
        products_rows = cursor.fetchall()
        
        exported_products = []
        
        for p_row in products_rows:
            p = dict(zip(columns, p_row))
            
            # Fetch price history for this sku
            cursor.execute("""
            SELECT date, cash_price, normal_price, stock 
            FROM price_history 
            WHERE sku = ? 
            ORDER BY date ASC
            """, (p["sku"],))
            
            history_rows = cursor.fetchall()
            history = []
            for h in history_rows:
                history.append({
                    "date": h[0],
                    "cash_price": h[1],
                    "normal_price": h[2],
                    "stock": h[3]
                })
                
            # Parse detailed specs JSON
            detailed = {}
            try:
                if p["detailed_specs"]:
                    detailed = json.loads(p["detailed_specs"])
            except Exception:
                pass
                
            exported_products.append({
                "sku": p["sku"],
                "title": p["title"],
                "brand": p["brand"],
                "category": p["category"],
                "condition": p["condition"],
                "url": p["url"],
                "cash_price": p["cash_price"],
                "normal_price": p["normal_price"],
                "discount": p["discount"],
                "stock": p["stock"],
                "spec_processor": p["spec_processor"],
                "spec_memory": p["spec_memory"],
                "spec_storage": p["spec_storage"],
                "spec_os": p["spec_os"],
                "detailed_specs": detailed,
                "image_url": p["image_url"],
                "scraped_at": p["scraped_at"],
                "price_history": history
            })
            
        conn.close()
        
        # Write to docs/products.json
        output_dir = os.path.join(os.path.dirname(__file__), "docs")
        os.makedirs(output_dir, exist_ok=True)
        output_file = os.path.join(output_dir, "products.json")
        
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(exported_products, f, ensure_ascii=False, indent=2)
            
        log_progress("export", 1, 1, f"Exportación exitosa. {len(exported_products)} productos guardados en docs/products.json.")
        return True
    except Exception as e:
        log_progress("export", 0, 1, f"Error al exportar JSON: {str(e)}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Raspador de productos de Winpy.cl")
    parser.add_argument("--sitemap", action="store_true", help="Cargar el sitemap y actualizar categorías")
    parser.add_argument("--limit-category", type=str, help="Filtrar categorías del sitemap por palabra clave")
    parser.add_argument("--crawl-only", action="store_true", help="Solo rastrear las categorías para llenar la cola de URLs")
    parser.add_argument("--scrape-only", action="store_true", help="Solo procesar la cola de URLs de productos pendientes")
    parser.add_argument("--list-categories", action="store_true", help="Listar las categorías del sitemap filtradas en DB")
    parser.add_argument("--url", type=str, help="Probar a raspar una URL de producto individual directamente y mostrar el JSON")
    
    args = parser.parse_args()
    
    if args.url:
        print(f"Probando raspado de URL: {args.url}")
        res = scrape_product_detail(args.url)
        print(json.dumps(res, indent=4, ensure_ascii=False))
        return
        
    init_db()
    
    if args.list_categories:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT url, scraped FROM categories")
        rows = cursor.fetchall()
        print(f"Total categorías en DB: {len(rows)}")
        for r in rows:
            print(f"[{'Scraped' if r[1] else 'Pending'}] {r[0]}")
        conn.close()
        return

    # Phase 1: Load sitemap categories
    if args.sitemap or (not args.scrape_only):
        load_sitemap(limit_pattern=args.limit_category)
        
    # Phase 2: Crawl categories to collect product URLs
    if not args.scrape_only:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT url FROM categories WHERE scraped = 0")
        pending_cats = [r[0] for r in cursor.fetchall()]
        conn.close()
        
        log_progress("crawl_categories", 0, len(pending_cats), f"Descubriendo productos en {len(pending_cats)} categorías...")
        for idx, cat_url in enumerate(pending_cats):
            crawl_category(cat_url)
            log_progress("crawl_categories", idx + 1, len(pending_cats), f"Categoría {idx+1}/{len(pending_cats)} completada.")
            time.sleep(1.0)
            
    # Phase 3: Scrape product details
    if not args.crawl_only:
        scrape_queued_products()
        export_to_json()

if __name__ == "__main__":
    main()
