#!/usr/bin/env python3
"""
Facebook Marketplace monitor for Apple Vision Pro listings in Ann Arbor.

Required environment variables (set as GitHub Actions secrets):
  FB_EMAIL           - Facebook account email
  FB_PASSWORD        - Facebook account password
  EMAIL_FROM         - Gmail address to send notifications from
  EMAIL_APP_PASSWORD - Gmail App Password (not your regular password)
                       Generate at: myaccount.google.com/apppasswords
  EMAIL_TO           - Recipient email address
"""

import asyncio
import json
import os
import re
import smtplib
import sys
import time
import random
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

SEEN_LISTINGS_FILE = Path(__file__).parent / "seen_listings.json"
MARKETPLACE_URL = (
    "https://www.facebook.com/marketplace/annarbor/search/"
    "?query=apple+vision+pro&exact=false"
)
MAX_LISTINGS_TO_CHECK = 30


# --------------------------------------------------------------------------- #
# Seen-listings persistence                                                    #
# --------------------------------------------------------------------------- #

def load_seen_listings() -> set:
    if SEEN_LISTINGS_FILE.exists():
        try:
            data = json.loads(SEEN_LISTINGS_FILE.read_text())
            return set(data.get("seen_ids", []))
        except (json.JSONDecodeError, KeyError):
            pass
    return set()


def save_seen_listings(seen_ids: set) -> None:
    SEEN_LISTINGS_FILE.write_text(
        json.dumps({"seen_ids": sorted(seen_ids), "updated": datetime.utcnow().isoformat()}, indent=2)
    )


# --------------------------------------------------------------------------- #
# Facebook login                                                               #
# --------------------------------------------------------------------------- #

async def facebook_login(page, email: str, password: str) -> bool:
    print("Navigating to Facebook login...")
    await page.goto("https://www.facebook.com/", wait_until="domcontentloaded")
    await asyncio.sleep(random.uniform(2, 4))

    # Dismiss cookie consent if present
    for selector in ['[data-testid="cookie-policy-manage-dialog-accept-button"]',
                     'button[title="Allow all cookies"]',
                     '[aria-label="Allow all cookies"]',
                     'button:has-text("Accept All")']:
        try:
            btn = page.locator(selector).first
            if await btn.is_visible(timeout=2000):
                await btn.click()
                await asyncio.sleep(1)
                break
        except Exception:
            pass

    # Fill login form
    try:
        await page.fill('input[name="email"]', email, timeout=10000)
        await asyncio.sleep(random.uniform(0.5, 1.5))
        await page.fill('input[name="pass"]', password, timeout=5000)
        await asyncio.sleep(random.uniform(0.5, 1.0))
        await page.click('button[name="login"]', timeout=5000)
    except Exception as e:
        print(f"Login form interaction failed: {e}")
        return False

    # Wait for navigation after login
    try:
        await page.wait_for_url(re.compile(r"facebook\.com/(?!login)"), timeout=15000)
        print("Login successful.")
        return True
    except PlaywrightTimeoutError:
        current = page.url
        if "login" in current or "checkpoint" in current:
            print(f"Login may have failed or hit a checkpoint. URL: {current}")
            return False
        print(f"Logged in (URL: {current})")
        return True


# --------------------------------------------------------------------------- #
# Listing extraction via GraphQL interception + DOM fallback                  #
# --------------------------------------------------------------------------- #

def _parse_graphql_listings(raw_text: str) -> list[dict]:
    """Parse Facebook's newline-delimited JSON GraphQL responses."""
    results = []
    for line in raw_text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue

        # Walk the object looking for marketplace item nodes
        _walk_for_listings(obj, results)

    return results


def _walk_for_listings(obj, results: list, depth: int = 0) -> None:
    if depth > 20:
        return
    if not isinstance(obj, (dict, list)):
        return

    if isinstance(obj, dict):
        # Facebook Marketplace listing nodes contain "__typename": "MarketplaceListing"
        if obj.get("__typename") in ("MarketplaceListing", "MarketplaceListingItemForCard"):
            listing = _extract_listing_from_node(obj)
            if listing:
                results.append(listing)
                return  # Don't recurse into it; we got the data

        for v in obj.values():
            _walk_for_listings(v, results, depth + 1)
    elif isinstance(obj, list):
        for item in obj:
            _walk_for_listings(item, results, depth + 1)


def _extract_listing_from_node(node: dict) -> dict | None:
    try:
        listing_id = node.get("id") or node.get("listing_id")
        if not listing_id:
            return None

        # Title
        title = (
            node.get("marketplace_listing_title")
            or (node.get("listing_title") or {}).get("text")
            or "Unknown Title"
        )

        # Price
        price_info = node.get("listing_price") or node.get("price") or {}
        price = (
            price_info.get("formatted_amount")
            or price_info.get("amount_with_offset_in_currency")
            or "Unknown Price"
        )

        # Location
        location_info = (
            node.get("location") or
            node.get("listing_location") or
            node.get("marketplace_listing_seller", {}).get("location") or
            {}
        )
        city = (
            location_info.get("city")
            or location_info.get("reverse_geocode", {}).get("city")
            or ""
        )
        state = (
            location_info.get("state")
            or location_info.get("reverse_geocode", {}).get("state")
            or ""
        )
        location = f"{city}, {state}".strip(", ") or "Ann Arbor area"

        # Primary photo
        photo = node.get("primary_listing_photo") or {}
        image_url = (
            (photo.get("image") or {}).get("uri")
            or (photo.get("listing_image") or {}).get("uri")
            or ""
        )

        url = f"https://www.facebook.com/marketplace/item/{listing_id}/"

        return {
            "id": str(listing_id),
            "title": title,
            "price": price,
            "location": location,
            "image_url": image_url,
            "url": url,
        }
    except Exception:
        return None


async def scrape_listings(page) -> list[dict]:
    """Navigate to Marketplace, intercept GraphQL, fall back to DOM."""
    collected_listings: list[dict] = []
    graphql_hit = False

    async def on_response(response):
        nonlocal graphql_hit
        if "graphql" not in response.url:
            return
        if response.status != 200:
            return
        try:
            text = await response.text()
            found = _parse_graphql_listings(text)
            if found:
                graphql_hit = True
                for item in found:
                    if not any(l["id"] == item["id"] for l in collected_listings):
                        collected_listings.append(item)
        except Exception as e:
            print(f"GraphQL parse error: {e}")

    page.on("response", on_response)

    print(f"Navigating to Marketplace: {MARKETPLACE_URL}")
    await page.goto(MARKETPLACE_URL, wait_until="domcontentloaded")
    await asyncio.sleep(random.uniform(4, 7))

    # Scroll to trigger lazy-loading of more listings
    for _ in range(3):
        await page.evaluate("window.scrollBy(0, window.innerHeight * 2)")
        await asyncio.sleep(random.uniform(1.5, 3))

    if graphql_hit:
        print(f"GraphQL interception found {len(collected_listings)} listings.")
        return collected_listings[:MAX_LISTINGS_TO_CHECK]

    # DOM fallback: scrape anchor tags pointing to /marketplace/item/
    print("No GraphQL data captured — falling back to DOM scraping.")
    anchors = await page.query_selector_all('a[href*="/marketplace/item/"]')
    seen_hrefs = set()

    for anchor in anchors[:MAX_LISTINGS_TO_CHECK]:
        try:
            href = await anchor.get_attribute("href") or ""
            if not href or href in seen_hrefs:
                continue
            seen_hrefs.add(href)

            match = re.search(r"/marketplace/item/(\d+)", href)
            if not match:
                continue
            listing_id = match.group(1)

            # Try to grab visible text from the card
            card_text = (await anchor.inner_text()).strip().splitlines()
            card_text = [t.strip() for t in card_text if t.strip()]

            price = next((t for t in card_text if "$" in t), "Unknown Price")
            title = next((t for t in card_text if "$" not in t and len(t) > 3), "Unknown Title")

            url = href if href.startswith("http") else f"https://www.facebook.com{href}"
            collected_listings.append({
                "id": listing_id,
                "title": title,
                "price": price,
                "location": "Ann Arbor area",
                "image_url": "",
                "url": url,
            })
        except Exception as e:
            print(f"DOM parse error on listing card: {e}")

    print(f"DOM fallback found {len(collected_listings)} listings.")
    return collected_listings


# --------------------------------------------------------------------------- #
# Email                                                                        #
# --------------------------------------------------------------------------- #

def build_email_html(listings: list[dict]) -> str:
    items_html = ""
    for i, l in enumerate(listings, 1):
        image_block = (
            f'<img src="{l["image_url"]}" alt="Listing image" '
            f'style="max-width:200px;border-radius:8px;margin-bottom:8px;"><br>'
            if l.get("image_url") else ""
        )
        items_html += f"""
        <div style="border:1px solid #ddd;border-radius:10px;padding:16px;margin-bottom:16px;background:#fff;">
          {image_block}
          <h3 style="margin:0 0 6px 0;color:#1877f2;">#{i}: {l['title']}</h3>
          <p style="margin:2px 0;font-size:18px;font-weight:bold;color:#333;">{l['price']}</p>
          <p style="margin:2px 0;color:#666;font-size:14px;">📍 {l['location']}</p>
          <a href="{l['url']}" style="display:inline-block;margin-top:10px;padding:8px 16px;
             background:#1877f2;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">
            View Listing
          </a>
        </div>"""

    return f"""
    <html><body style="font-family:Arial,sans-serif;background:#f0f2f5;padding:20px;max-width:600px;margin:0 auto;">
      <div style="background:#1877f2;color:#fff;padding:20px;border-radius:10px 10px 0 0;text-align:center;">
        <h2 style="margin:0;">Apple Vision Pro Found on Facebook Marketplace</h2>
        <p style="margin:6px 0 0 0;opacity:0.85;">Ann Arbor area &mdash; {datetime.now().strftime('%B %d, %Y')}</p>
      </div>
      <div style="padding:20px;">
        <p style="color:#333;">Found <strong>{len(listings)} new listing(s)</strong> for Apple Vision Pro near Ann Arbor:</p>
        {items_html}
        <hr style="border:none;border-top:1px solid #ddd;margin:24px 0;">
        <p style="color:#999;font-size:12px;text-align:center;">
          This alert was sent by your GitHub Actions marketplace monitor.<br>
          Search: <a href="{MARKETPLACE_URL}">{MARKETPLACE_URL}</a>
        </p>
      </div>
    </body></html>"""


def send_email(new_listings: list[dict]) -> None:
    email_from = os.environ["EMAIL_FROM"]
    email_to = os.environ["EMAIL_TO"]
    app_password = os.environ["EMAIL_APP_PASSWORD"]

    count = len(new_listings)
    subject = f"[Vision Pro Alert] {count} new listing{'s' if count != 1 else ''} in Ann Arbor"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = email_from
    msg["To"] = email_to

    # Plain-text fallback
    plain_lines = [f"Apple Vision Pro — {count} new listing(s) found near Ann Arbor\n"]
    for i, l in enumerate(new_listings, 1):
        plain_lines.append(f"{i}. {l['title']}\n   {l['price']} | {l['location']}\n   {l['url']}\n")
    msg.attach(MIMEText("\n".join(plain_lines), "plain"))
    msg.attach(MIMEText(build_email_html(new_listings), "html"))

    print(f"Sending email to {email_to}...")
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(email_from, app_password)
        server.sendmail(email_from, email_to, msg.as_string())
    print("Email sent successfully.")


# --------------------------------------------------------------------------- #
# Main                                                                         #
# --------------------------------------------------------------------------- #

async def main() -> None:
    # Validate required env vars
    required_vars = ["FB_EMAIL", "FB_PASSWORD", "EMAIL_FROM", "EMAIL_APP_PASSWORD", "EMAIL_TO"]
    missing = [v for v in required_vars if not os.environ.get(v)]
    if missing:
        print(f"ERROR: Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)

    seen_ids = load_seen_listings()
    print(f"Loaded {len(seen_ids)} previously seen listing IDs.")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
            ],
        )

        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
            locale="en-US",
            timezone_id="America/Detroit",
        )

        # Mask WebDriver flag
        await context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )

        page = await context.new_page()

        login_ok = await facebook_login(
            page,
            os.environ["FB_EMAIL"],
            os.environ["FB_PASSWORD"],
        )
        if not login_ok:
            print("Login failed. Exiting.")
            await browser.close()
            sys.exit(1)

        await asyncio.sleep(random.uniform(2, 4))

        all_listings = await scrape_listings(page)
        await browser.close()

    if not all_listings:
        print("No listings found. This may be a scraping issue — check for Facebook login problems.")
        sys.exit(0)

    # Filter to new listings only
    new_listings = [l for l in all_listings if l["id"] not in seen_ids]
    print(f"Total listings found: {len(all_listings)} | New (unseen): {len(new_listings)}")

    if new_listings:
        send_email(new_listings)
        # Persist all seen IDs (new + old)
        seen_ids.update(l["id"] for l in all_listings)
        save_seen_listings(seen_ids)
        print(f"Saved {len(seen_ids)} total seen listing IDs.")
    else:
        print("No new listings since last check. No email sent.")
        # Still update the seen set in case listings were refreshed
        seen_ids.update(l["id"] for l in all_listings)
        save_seen_listings(seen_ids)


if __name__ == "__main__":
    asyncio.run(main())
