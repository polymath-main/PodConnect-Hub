#!/usr/bin/env python3
"""
Test Suite for PodConnect SwarmScraper Lead Discovery Engine
Tests:
1. Live Apple iTunes Catalog Search (Zero Paid API)
2. Liveness Gate (≤ 60 days recency verification)
3. Website Contact Spider & Strict Email Regex Validation (no npm package false positives)
4. End-to-End Pipeline & SQLite Staged Leads Persistence
"""

import os
import sys
import sqlite3
import datetime
from email.utils import format_datetime

# Add repository root to path
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)

from scraper import (
    search_itunes_podcasts,
    PodcastLeadScraper,
    run_discovery_pipeline,
    ContactLinkExtractor,
)


def test_itunes_live_search():
    print("------------------------------------------------------------")
    print("TEST 1: Live Apple Podcasts Search (Zero Paid API)")
    print("------------------------------------------------------------")
    niches = ["AI SaaS", "B2B Sales", "Real Estate Investing"]
    for niche in niches:
        results = search_itunes_podcasts(niche, limit=5)
        print(f"[*] Query '{niche}': returned {len(results)} live podcasts from Apple catalog")
        assert len(results) >= 3, f"Expected at least 3 podcasts for '{niche}', got {len(results)}"
        first = results[0]
        assert "show_name" in first and len(first["show_name"]) > 0
        assert "feed_url" in first and first["feed_url"].startswith("http")
        print(f"    -> Sample: '{first['show_name']}' ({first['genre']}) | Feed: {first['feed_url'][:50]}...")
    print("[PASS] Test 1: Apple iTunes live catalog search verified!\n")


def test_liveness_gate():
    print("------------------------------------------------------------")
    print("TEST 2: Liveness & Cadence Gate (≤ 60 days episode age)")
    print("------------------------------------------------------------")
    scraper = PodcastLeadScraper()
    now = datetime.datetime.now(datetime.timezone.utc)

    # 1. Active show XML (<pubDate> 5 days ago)
    recent_date = format_datetime(now - datetime.timedelta(days=5))
    active_rss = f"""<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
        <channel>
            <title>Active AI Founders Show</title>
            <link>https://example.com/show</link>
            <itunes:author>Jane Founder</itunes:author>
            <itunes:owner>
                <itunes:email>jane@example.com</itunes:email>
            </itunes:owner>
            <item>
                <title>Episode 100: Live Episode</title>
                <pubDate>{recent_date}</pubDate>
            </item>
        </channel>
    </rss>
    """

    # 2. Dormant show XML (<pubDate> 120 days ago)
    dormant_date = format_datetime(now - datetime.timedelta(days=120))
    dormant_rss = f"""<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
        <channel>
            <title>Dormant Zombie Podcast</title>
            <link>https://example.com/dead</link>
            <itunes:author>Ghost Host</itunes:author>
            <itunes:owner>
                <itunes:email>ghost@example.com</itunes:email>
            </itunes:owner>
            <item>
                <title>Episode 1: Last Gasp</title>
                <pubDate>{dormant_date}</pubDate>
            </item>
        </channel>
    </rss>
    """

    # Mock fetch_url to return our XMLs
    original_fetch = scraper.fetch_url

    def mock_fetch(url, timeout=10):
        if "active" in url:
            return active_rss, "application/xml"
        elif "dormant" in url:
            return dormant_rss, "application/xml"
        return original_fetch(url, timeout)

    scraper.fetch_url = mock_fetch

    # Test Active Show passes
    lead_active = scraper.parse_rss_feed("https://test.local/active.xml", "C001", "AI SaaS", max_inactive_days=60, stage_immediately=False)
    assert lead_active is not None, "Active show within 60 days should pass liveness gate"
    assert lead_active["show_name"] == "Active AI Founders Show"
    assert "Active Show (≤60d)" in lead_active["tags"]
    print(f"[*] Active show (5 days old): ACCEPTED ({lead_active['show_name']})")

    # Test Dormant Show rejected
    lead_dormant = scraper.parse_rss_feed("https://test.local/dormant.xml", "C001", "AI SaaS", max_inactive_days=60, stage_immediately=False)
    assert lead_dormant is None, "Dormant show (>60 days old) must be rejected by liveness gate"
    print("[*] Dormant show (120 days old): CORRECTLY DISCARDED by Liveness Gate")

    scraper.fetch_url = original_fetch
    print("[PASS] Test 2: Liveness Gate verified!\n")


def test_contact_spider_and_email_regex():
    print("------------------------------------------------------------")
    print("TEST 3: Swarm Contact Spider & Strict Email Regex")
    print("------------------------------------------------------------")
    scraper = PodcastLeadScraper()

    # Verify npm packages are not mistaken for emails
    dirty_html = """
    <html>
        <head>
            <script src="https://cdn.jsdelivr.net/npm/react@18.3.1/index.min.js"></script>
            <script src="https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js"></script>
        </head>
        <body>
            <p>Welcome! For press and guest bookings, email us at booking@aifounders.io or hello@aifounders.io.</p>
            <a href="mailto:booking@aifounders.io">Contact Show</a>
        </body>
    </html>
    """
    emails = scraper.extract_emails_from_text(dirty_html, domain_hint="aifounders.io")
    print(f"[*] Extracted emails from HTML containing npm package references: {emails}")
    assert "react@18.3.1" not in emails
    assert "lodash@4.17.21" not in emails
    assert "booking@aifounders.io" in emails
    assert emails[0] == "booking@aifounders.io"

    # Verify ContactLinkExtractor captures sub-pages, socials and forms
    sample_page = """
    <html>
        <body>
            <a href="/about-us">About</a>
            <a href="/contact">Contact Page</a>
            <a href="/booking">Guest Booking</a>
            <a href="https://x.com/podcasthost">Host on X</a>
            <a href="https://linkedin.com/in/podcasthost">Host on LinkedIn</a>
            <a href="https://typeform.com/to/guestform123">Guest Application</a>
            <a href="/style.css">Stylesheet</a>
        </body>
    </html>
    """
    extractor = ContactLinkExtractor("https://mygreatshow.com")
    extractor.feed(sample_page)
    print(f"[*] Contact sub-pages: {extractor.contact_links}")
    print(f"[*] Host social links: {extractor.social_links}")
    print(f"[*] Booking form links: {extractor.form_links}")

    assert any("/contact" in l for l in extractor.contact_links)
    assert any("x.com/podcasthost" in s for s in extractor.social_links)
    assert any("typeform.com" in f for f in extractor.form_links)

    print("[PASS] Test 3: Contact spider and email regex verified!\n")


def test_end_to_end_discovery_staging():
    print("------------------------------------------------------------")
    print("TEST 4: End-to-End Live Discovery & SQLite Staging")
    print("------------------------------------------------------------")
    tenant_id = "test_tenant_swarm"
    client_id = "TEST_C001"
    niche = "B2B SaaS Growth"

    # Run discovery pipeline for 2 leads
    staged = run_discovery_pipeline(
        client_id=client_id,
        niche=niche,
        min_subs=1000,
        target_count=2,
        stage_only=True,
        tenant_id=tenant_id,
        max_inactive_days=90
    )

    print(f"[*] Pipeline finished. Staged {len(staged)} live shows.")
    assert len(staged) >= 1, "Pipeline should stage at least 1 live podcast"

    # Direct SQLite verification
    db_path = os.path.join(REPO_ROOT, "podconnect_leads.db")
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute(
        "SELECT id, tenant_id, client_id, show_name, email, score, tags FROM staged_leads WHERE tenant_id = ? AND client_id = ?",
        (tenant_id, client_id)
    )
    rows = cur.fetchall()
    print(f"[*] Direct DB query retrieved {len(rows)} staged leads for tenant '{tenant_id}':")
    for r in rows:
        print(f"    -> ID: {r[0]} | Show: '{r[3]}' | Email: '{r[4]}' | Score: {r[5]} | Tags: {r[6]}")

    assert len(rows) >= 1, "Expected staged records in SQLite table"

    # Clean up test rows
    cur.execute("DELETE FROM staged_leads WHERE tenant_id = ?", (tenant_id,))
    conn.commit()
    conn.close()
    print("[*] Cleaned up temporary test rows in SQLite database")
    print("[PASS] Test 4: End-to-end live discovery and staging verified!\n")


if __name__ == "__main__":
    print("\n============================================================")
    print(" RUNNING PODCONNECT SWARMSCRAPER TEST SUITE")
    print("============================================================\n")
    test_itunes_live_search()
    test_liveness_gate()
    test_contact_spider_and_email_regex()
    test_end_to_end_discovery_staging()
    print("============================================================")
    print(" ALL 4 SWARMSCRAPER TESTS PASSED SUCCESSFULLY! ")
    print("============================================================\n")
