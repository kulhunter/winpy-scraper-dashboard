from curl_cffi import requests
from bs4 import BeautifulSoup

url = "https://www.winpy.cl/venta/notebook-hp-elitebook-840-de-14-i7-8565u-8gb-ram-512gb-ssd-win11-pro/"
print("Fetching product url:", url)
r = requests.get(url, impersonate="chrome")
soup = BeautifulSoup(r.text, "html.parser")

print("Title:", soup.title.string if soup.title else "No title")

# Let's search for tables or list of specs
print("\n--- Tables ---")
tables = soup.find_all("table")
print(f"Found {len(tables)} tables")
for i, t in enumerate(tables):
    print(f"Table {i+1} class: {t.get('class')}")
    # Print some table content
    rows = t.find_all("tr")
    print(f"  Rows count: {len(rows)}")
    for r_idx, row in enumerate(rows[:5]):
        cols = [col.get_text(strip=True) for col in row.find_all(["td", "th"])]
        print(f"    Row {r_idx+1}: {cols}")

print("\n--- List elements (ul/ol) ---")
lists = soup.find_all("ul")
print(f"Found {len(lists)} ul lists")
for i, l in enumerate(lists[:10]):
    print(f"List {i+1} class: {l.get('class')}")
    items = [li.get_text(strip=True) for li in l.find_all("li")]
    print(f"  Items (first 5): {items[:5]}")

print("\n--- Divs with specifications or features ---")
# Often there's a div with id/class spec, ficha, caracteristicas, details, info, etc.
spec_divs = soup.find_all(lambda tag: tag.name == "div" and any(k in str(tag.get("id")) or k in str(tag.get("class")) for k in ["espec", "ficha", "detail", "caract", "info", "spec"]))
print(f"Found {len(spec_divs)} potential spec divs.")
for d in spec_divs[:5]:
    print(f"  Div id: {d.get('id')}, class: {d.get('class')}")
    # Print first 200 chars of text
    txt = d.get_text(separator=" | ", strip=True)
    print(f"    Text: {txt[:200]}...")
