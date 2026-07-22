from curl_cffi import requests
from bs4 import BeautifulSoup

url = "https://www.winpy.cl/portatiles/notebooks/"
r = requests.get(url, impersonate="chrome")
soup = BeautifulSoup(r.text, "html.parser")

# Find the first few elements with class "valor"
price_elements = soup.find_all(class_="valor")
print(f"Found {len(price_elements)} elements with class='valor'")

for i, p in enumerate(price_elements[:5]):
    print(f"\n--- Price Element {i+1} ---")
    print("Tag:", p)
    # Print parent element structure
    parent = p.parent
    print("Parent Tag Name:", parent.name)
    print("Parent Attributes:", parent.attrs)
    # Let's print the full HTML of the parent
    print("Parent HTML:")
    print(parent.prettify())
