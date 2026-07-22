from curl_cffi import requests
from bs4 import BeautifulSoup

url = "https://www.winpy.cl/venta/notebook-hp-elitebook-840-de-14-i7-8565u-8gb-ram-512gb-ssd-win11-pro/"
r = requests.get(url, impersonate="chrome")
soup = BeautifulSoup(r.text, "html.parser")

for div_id in ["details-product", "spec-product", "info-product"]:
    div = soup.find(id=div_id)
    print(f"\n================= DIV ID: {div_id} =================")
    if div:
        print(div.prettify())
    else:
        print("Not found")
