import urllib.parse
from curl_cffi import requests
from bs4 import BeautifulSoup
import json

url = "https://www.winpy.cl/portatiles/notebooks/"
print("Fetching url:", url)
r = requests.get(url, impersonate="chrome")
soup = BeautifulSoup(r.text, "html.parser")

print("Page title:", soup.title.string if soup.title else "No title")

# Find typical product links, divs, class names
print("\n--- Searching for divs with classes that might contain products ---")
# Check elements that look like products. Common ones are divs with product, item, box, col, card, etc.
divs = soup.find_all("div")
class_counts = {}
for d in divs:
    cls = d.get("class")
    if cls:
        cls_str = " ".join(cls)
        class_counts[cls_str] = class_counts.get(cls_str, 0) + 1

# Print top 20 class names
sorted_classes = sorted(class_counts.items(), key=lambda x: x[1], reverse=True)
print("Top classes:")
for c, cnt in sorted_classes[:30]:
    print(f"  {c}: {cnt}")

# Let's look for product elements. E-commerce sites often use links to products.
# Product URLs on Winpy often contain product IDs or specific patterns.
print("\n--- Links on the page ---")
links = soup.find_all("a")
product_links = []
other_links = []
for a in links:
    href = a.get("href", "")
    text = a.get_text(strip=True)
    if not href:
        continue
    # Check if links are product detail pages
    # Let's inspect some links
    if "/venta/" in href or "/p/" in href or "producto" in href or href.endswith(".html") or any(char.isdigit() for char in href.split("/")[-1]):
        product_links.append((href, text))
    else:
        other_links.append((href, text))

print(f"Total links: {len(links)}")
print(f"Potential product links: {len(product_links)}")
for href, text in product_links[:20]:
    print(f"  Href: {href} | Text: {text}")

# Let's look at elements containing $ (prices)
print("\n--- Elements containing '$' ---")
prices = soup.find_all(lambda tag: tag.name in ["span", "div", "p", "strong", "b"] and "$" in tag.text)
print(f"Found {len(prices)} price-like tags.")
for p in prices[:15]:
    # Print the tag and some parent context
    print(f"  Tag: <{p.name} class='{p.get('class')}'> {p.text.strip()}")
