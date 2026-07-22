from curl_cffi import requests
from bs4 import BeautifulSoup

url = "https://www.winpy.cl/portatiles/notebooks/"
r = requests.get(url, impersonate="chrome")
soup = BeautifulSoup(r.text, "html.parser")

# Search for elements that might represent pagination, e.g. class pag, pagination, links with numbers
# Let's search for tags that contain links like notebooks/?page= or similar. Or notebooks/page/
print("=== Searching for page links ===")
links = soup.find_all("a")
for a in links:
    href = a.get("href", "")
    text = a.get_text(strip=True)
    if "notebooks" in href and ("p=" in href or "page=" in href or "pag=" in href or "?" in href):
        print(f"  Href: {href} | Text: {text}")

# Let's inspect the block containing "1234"
# Search for elements containing "1" and "2" as siblings or near
pagination_block = soup.find(lambda tag: tag.name in ["div", "ul", "p"] and "1" in tag.text and "2" in tag.text and "3" in tag.text)
if pagination_block:
    print("\n=== Found potential pagination block ===")
    print("Tag:", pagination_block.name, "Class:", pagination_block.get("class"), "Id:", pagination_block.get("id"))
    print(pagination_block.prettify())
