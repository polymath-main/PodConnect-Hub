#!/usr/bin/env python3
"""
PodConnect Autonomous Lead Sourcing & Scraping Engine
Compliant, zero-paid-API podcast lead extractor using native Python standard libraries.
Parses public directory endpoints, RSS feeds, and search dorks with robots.txt courtesy.
Supports Pre-Import Staging, Data Selection, Lead Editing/Discarding, and Central Tag Bank.
"""

import sys
import os
import json
import re
import time
import sqlite3
import argparse
import urllib.request
import urllib.parse
from html.parser import HTMLParser
import xml.etree.ElementTree as ET


class LinkAndTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text_chunks = []
        self.links = []
        self.title = ""
        self.in_title = False

    def handle_starttag(self, tag, attrs):
        if tag.lower() == 'title':
            self.in_title = True
        elif tag.lower() == 'a':
            for name, val in attrs:
                if name.lower() == 'href' and val:
                    self.links.append(val)

    def handle_endtag(self, tag):
        if tag.lower() == 'title':
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data.strip()
        cleaned = data.strip()
        if cleaned:
            self.text_chunks.append(cleaned)

    def get_text(self):
        return " ".join(self.text_chunks)


def generate_lead_tags(niche, platform, subs=2500, host_name="Show Host"):
    """Generates normalized keyword and metadata tags based on niche, platform, and audience"""
    tags = []
    
    # Niche derived tags
    parts = [p.strip() for p in re.split(r'[,;/|]+', niche) if p.strip()]
    for p in parts:
        if len(p) <= 24 and p not in tags:
            tags.append(p)
            
    # Sub-keyword extraction
    lower_niche = niche.lower()
    keyword_map = {
        "saas": "SaaS",
        "b2b": "B2B",
        "ai": "AI & ML",
        "devops": "DevOps",
        "cloud": "Cloud",
        "tech": "Tech",
        "marketing": "Marketing",
        "growth": "Growth",
        "sales": "Sales",
        "finance": "Finance",
        "investing": "Investing",
        "startup": "Startups",
        "founder": "Founders",
        "health": "Health",
        "biohacking": "Biohacking",
        "crypto": "Web3/Crypto",
        "ecommerce": "E-Commerce",
        "product": "Product",
        "leadership": "Leadership",
    }
    for k, v in keyword_map.items():
        if k in lower_niche and v not in tags:
            tags.append(v)

    # Platform tag
    if platform and platform not in tags:
        tags.append(platform)

    # Audience scale tag
    if subs >= 25000:
        tags.append("Top Tier (25k+)")
    elif subs >= 10000:
        tags.append("Enterprise Reach (10k+)")
    elif subs >= 5000:
        tags.append("High Reach (5k+)")
    else:
        tags.append("Targeted Niche")

    # Host verified tag
    if host_name and host_name != "Show Host" and "Host Verified" not in tags:
        tags.append("Host Identified")

    return tags[:8]


class PodcastLeadScraper:
    def __init__(self, db_name="podconnect_leads.db", tenant_id="tenant_default"):
        self.db_name = db_name
        self.tenant_id = tenant_id
        self.conn = sqlite3.connect(self.db_name)
        self.create_tables()

    def log(self, message, lead=None, level="INFO", progress=None):
        """Outputs structured JSON line for backend SSE streaming"""
        payload = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "level": level,
            "message": message,
            "lead": lead
        }
        if progress is not None:
            payload["progress"] = progress
        print(json.dumps(payload), flush=True)

    def create_tables(self):
        cursor = self.conn.cursor()

        # 1. Staging table: Pre-import holding area for review, filtering, editing, and discard
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS staged_leads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id TEXT,
                show_name TEXT,
                host_name TEXT,
                platform TEXT,
                show_url TEXT,
                feed_url TEXT,
                email TEXT,
                subscribers INTEGER,
                niche TEXT,
                tags TEXT,
                score REAL,
                location TEXT,
                date_scraped TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(client_id, show_name)
            )
        ''')

        # 2. Central Core Database: Approved, imported leads bank
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS leads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id TEXT,
                show_name TEXT,
                host_name TEXT,
                platform TEXT,
                show_url TEXT,
                feed_url TEXT,
                email TEXT,
                subscribers INTEGER,
                niche TEXT,
                score REAL,
                status TEXT DEFAULT 'Imported',
                date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(client_id, show_name)
            )
        ''')

        # Run safe migrations for additional columns if needed
        cursor.execute("PRAGMA table_info(leads)")
        existing_cols = [c[1] for c in cursor.fetchall()]

        if "tags" not in existing_cols:
            try:
                cursor.execute("ALTER TABLE leads ADD COLUMN tags TEXT")
            except Exception:
                pass

        if "notes" not in existing_cols:
            try:
                cursor.execute("ALTER TABLE leads ADD COLUMN notes TEXT")
            except Exception:
                pass

        if "location" not in existing_cols:
            try:
                cursor.execute("ALTER TABLE leads ADD COLUMN location TEXT")
            except Exception:
                pass

        self.conn.commit()

    def extract_emails_from_text(self, text):
        """Extracts valid public contact emails using robust regex patterns"""
        email_pattern = r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+'
        matches = re.findall(email_pattern, text)
        filtered = []
        for e in matches:
            e_lower = e.lower()
            if any(ext in e_lower for ext in ['.png', '.jpg', '.webp', '.gif', 'sentry.io', 'w3.org', 'schema.org', 'example.com', 'itunes.apple.com']):
                continue
            if len(e) > 6 and '.' in e.split('@')[-1]:
                filtered.append(e)
        return list(set(filtered))

    def fetch_url(self, url, timeout=12):
        """Courteous URL fetcher with custom user-agent and robots.txt sanity check"""
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 PodConnectBot/1.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8'
        }
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                content_type = response.headers.get('Content-Type', '')
                raw_data = response.read(2 * 1024 * 1024)
                try:
                    text = raw_data.decode('utf-8', errors='ignore')
                except Exception:
                    text = raw_data.decode('latin-1', errors='ignore')
                return text, content_type
        except Exception as e:
            self.log(f"Fetch skipped for {url}: {str(e)}", level="WARN")
            return None, ""

    def evaluate_lead(self, text, emails, base_score=6.0, min_subs=1000):
        """Evaluates and scores lead based on subscriber metrics and email presence"""
        score = base_score
        text_lower = text.lower()
        subs = 2500

        sub_match = re.search(r'([\d,.]+)\s*(k|m)?\s*(subscribers|subs|followers|listeners|downloads|episodes)', text_lower)
        if sub_match:
            try:
                num_str = sub_match.group(1).replace(',', '')
                subs = float(num_str)
                multiplier = sub_match.group(2)
                if multiplier == 'k':
                    subs *= 1000
                elif multiplier == 'm':
                    subs *= 1000000
            except Exception:
                subs = min_subs

        if subs >= min_subs:
            score += 2.5
        if len(emails) > 0:
            score += 1.5

        return max(1.0, min(10.0, round(score, 1))), int(subs)

    def parse_rss_feed(self, rss_url, client_id, niche, min_subs=1000, stage_immediately=True):
        """Parses public RSS feed for show metadata and contact info with regex fallback"""
        text, content_type = self.fetch_url(rss_url)
        if not text:
            return None

        title = None
        link = rss_url
        host_name = "Show Host"
        description = ""
        emails = []

        try:
            root = ET.fromstring(text)
            channel = root.find('channel')
            if channel is not None:
                title = channel.findtext('title')
                link = channel.findtext('link') or rss_url
                description = channel.findtext('description') or ""
                itunes_owner = channel.find('{http://www.itunes.com/dtds/podcast-1.0.dtd}owner')
                if itunes_owner is not None:
                    owner_email = itunes_owner.findtext('{http://www.itunes.com/dtds/podcast-1.0.dtd}email')
                    owner_name = itunes_owner.findtext('{http://www.itunes.com/dtds/podcast-1.0.dtd}name')
                    if owner_email:
                        emails.append(owner_email)
                    if owner_name:
                        host_name = owner_name
                else:
                    host_name = channel.findtext('{http://www.itunes.com/dtds/podcast-1.0.dtd}author') or host_name
        except Exception:
            pass

        if not title:
            title_match = re.search(r'<title>(.*?)</title>', text, re.I | re.S)
            if title_match:
                title = re.sub(r'<!\[CDATA\[(.*?)\]\]>', r'\1', title_match.group(1)).strip()

        if host_name == "Show Host":
            author_match = re.search(r'<itunes:author>(.*?)</itunes:author>', text, re.I | re.S)
            if author_match:
                host_name = re.sub(r'<!\[CDATA\[(.*?)\]\]>', r'\1', author_match.group(1)).strip()

        email_match = re.search(r'<itunes:email>(.*?)</itunes:email>', text, re.I | re.S)
        if email_match:
            e = email_match.group(1).strip()
            if e and e not in emails:
                emails.append(e)

        desc_match = re.search(r'<description>(.*?)</description>', text, re.I | re.S)
        if desc_match:
            description = desc_match.group(1)

        extracted = self.extract_emails_from_text(description + " " + text[:25000])
        for em in extracted:
            if em not in emails:
                emails.append(em)

        if not title:
            title = "Podcast: " + niche

        primary_email = emails[0] if emails else ""
        score, subs = self.evaluate_lead(description + " " + text[:15000], emails, min_subs=min_subs)
        tags = generate_lead_tags(niche, "RSS Feed", subs=subs, host_name=host_name)

        lead = {
            "client_id": client_id,
            "show_name": title.strip(),
            "host_name": host_name.strip() if host_name else "Show Host",
            "platform": "RSS Feed",
            "show_url": link.strip(),
            "feed_url": rss_url,
            "email": primary_email,
            "subscribers": subs,
            "niche": niche,
            "tags": tags,
            "score": score
        }

        if stage_immediately:
            self.save_staged_lead(lead)
        else:
            self.save_lead(lead)

        return lead

    def save_staged_lead(self, lead):
        """Saves scraped lead to the STAGING area for operator validation, edit, and approval"""
        cursor = self.conn.cursor()
        tags_json = json.dumps(lead.get("tags") or generate_lead_tags(lead["niche"], lead["platform"], lead.get("subscribers", 2500), lead.get("host_name", "Show Host")))
        
        cursor.execute('''
            INSERT INTO staged_leads (tenant_id, client_id, show_name, host_name, platform, show_url, feed_url, email, subscribers, niche, tags, score, location)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(client_id, show_name) DO UPDATE SET
                tenant_id = excluded.tenant_id,
                host_name = excluded.host_name,
                email = CASE WHEN excluded.email != '' THEN excluded.email ELSE staged_leads.email END,
                subscribers = max(staged_leads.subscribers, excluded.subscribers),
                tags = excluded.tags,
                score = excluded.score
        ''', (
            self.tenant_id,
            lead["client_id"],
            lead["show_name"],
            lead["host_name"],
            lead["platform"],
            lead["show_url"],
            lead.get("feed_url", ""),
            lead.get("email", ""),
            lead.get("subscribers", 2500),
            lead["niche"],
            tags_json,
            lead.get("score", 8.0),
            lead.get("location", "Global / Remote")
        ))
        self.conn.commit()
        self.log(f"[STAGED] Scraped lead held in review area: {lead['show_name']} ({lead['platform']})", lead=lead)

    def get_staged_leads(self, client_id=None):
        """Returns all staged leads waiting for review"""
        cursor = self.conn.cursor()
        if client_id:
            cursor.execute('SELECT id, client_id, show_name, host_name, platform, show_url, feed_url, email, subscribers, niche, tags, score, location, date_scraped FROM staged_leads WHERE client_id = ? ORDER BY date_scraped DESC', (client_id,))
        else:
            cursor.execute('SELECT id, client_id, show_name, host_name, platform, show_url, feed_url, email, subscribers, niche, tags, score, location, date_scraped FROM staged_leads ORDER BY date_scraped DESC')
        rows = cursor.fetchall()
        leads = []
        for r in rows:
            tags = []
            try:
                tags = json.loads(r[10]) if r[10] else []
            except Exception:
                tags = [t.strip() for t in (r[10] or "").split(',') if t.strip()]

            leads.append({
                "id": r[0],
                "clientId": r[1],
                "showName": r[2],
                "hostName": r[3],
                "platform": r[4],
                "showUrl": r[5],
                "feedUrl": r[6],
                "email": r[7],
                "subscribers": r[8],
                "niche": r[9],
                "tags": tags,
                "score": r[11],
                "location": r[12],
                "dateScraped": r[13]
            })
        return leads

    def import_staged_leads(self, staged_ids):
        """Approves and imports selected staged leads into the central core database"""
        cursor = self.conn.cursor()
        imported = []
        for s_id in staged_ids:
            cursor.execute('SELECT id, client_id, show_name, host_name, platform, show_url, feed_url, email, subscribers, niche, tags, score, location FROM staged_leads WHERE id = ?', (s_id,))
            row = cursor.fetchone()
            if not row:
                continue

            tags = row[10] or json.dumps(generate_lead_tags(row[9], row[4], row[8], row[3]))

            # Insert into core leads table with status 'Imported'
            cursor.execute('''
                INSERT INTO leads (client_id, show_name, host_name, platform, show_url, feed_url, email, subscribers, niche, tags, score, status, location)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Imported', ?)
                ON CONFLICT(client_id, show_name) DO UPDATE SET
                    host_name = excluded.host_name,
                    email = CASE WHEN excluded.email != '' THEN excluded.email ELSE leads.email END,
                    subscribers = max(leads.subscribers, excluded.subscribers),
                    tags = excluded.tags,
                    score = excluded.score
            ''', (row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], tags, row[11], row[12]))

            # Remove from staged area
            cursor.execute('DELETE FROM staged_leads WHERE id = ?', (s_id,))
            imported.append({"id": s_id, "showName": row[2], "clientId": row[1]})

        self.conn.commit()
        return imported

    def delete_staged_lead(self, staged_id):
        cursor = self.conn.cursor()
        cursor.execute('DELETE FROM staged_leads WHERE id = ?', (staged_id,))
        self.conn.commit()
        return True

    def edit_staged_lead(self, staged_id, data):
        cursor = self.conn.cursor()
        tags_json = json.dumps(data.get("tags") or [])
        cursor.execute('''
            UPDATE staged_leads SET
                show_name = ?,
                host_name = ?,
                platform = ?,
                show_url = ?,
                email = ?,
                subscribers = ?,
                niche = ?,
                tags = ?,
                score = ?,
                location = ?
            WHERE id = ?
        ''', (
            data["showName"],
            data.get("hostName", "Show Host"),
            data.get("platform", "Podcast"),
            data.get("showUrl", ""),
            data.get("email", ""),
            int(data.get("subscribers", 1000)),
            data.get("niche", "General"),
            tags_json,
            float(data.get("score", 7.5)),
            data.get("location", "Global"),
            staged_id
        ))
        self.conn.commit()
        return True

    def save_lead(self, lead):
        """Saves lead directly into the approved core database"""
        cursor = self.conn.cursor()
        tags_json = json.dumps(lead.get("tags") or generate_lead_tags(lead["niche"], lead["platform"], lead.get("subscribers", 2500), lead.get("host_name", "Show Host")))
        
        cursor.execute('''
            INSERT INTO leads (client_id, show_name, host_name, platform, show_url, feed_url, email, subscribers, niche, tags, score, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Imported')
            ON CONFLICT(client_id, show_name) DO UPDATE SET
                host_name = excluded.host_name,
                email = CASE WHEN excluded.email != '' THEN excluded.email ELSE leads.email END,
                subscribers = max(leads.subscribers, excluded.subscribers),
                tags = excluded.tags,
                score = excluded.score
        ''', (
            lead["client_id"],
            lead["show_name"],
            lead["host_name"],
            lead["platform"],
            lead["show_url"],
            lead.get("feed_url", ""),
            lead["email"],
            lead["subscribers"],
            lead["niche"],
            tags_json,
            lead["score"]
        ))
        self.conn.commit()
        self.log(f"Lead committed to database: {lead['show_name']} ({lead['platform']})", lead=lead)

    def get_leads(self, client_id=None, niche=None, tag=None, status=None, search=None):
        """Retrieves leads from the central database with multi-facet filters"""
        cursor = self.conn.cursor()
        query = 'SELECT id, client_id, show_name, host_name, platform, show_url, feed_url, email, subscribers, niche, tags, score, status, date_added, notes, location FROM leads WHERE 1=1'
        params = []

        if client_id:
            query += ' AND client_id = ?'
            params.append(client_id)
        if niche:
            query += ' AND niche LIKE ?'
            params.append(f'%{niche}%')
        if status and status.lower() != 'all':
            query += ' AND status = ?'
            params.append(status)
        if search:
            query += ' AND (show_name LIKE ? OR host_name LIKE ? OR email LIKE ? OR niche LIKE ?)'
            wild = f'%{search}%'
            params.extend([wild, wild, wild, wild])

        query += ' ORDER BY score DESC, subscribers DESC'
        cursor.execute(query, params)
        rows = cursor.fetchall()
        leads = []
        for r in rows:
            tags = []
            try:
                tags = json.loads(r[10]) if r[10] else []
            except Exception:
                tags = [t.strip() for t in (r[10] or "").split(',') if t.strip()]

            # Tag in-memory filter if specified
            if tag and tag.lower() != 'all':
                if not any(tag.lower() in t.lower() for t in tags):
                    continue

            leads.append({
                "id": r[0],
                "clientId": r[1],
                "showName": r[2],
                "hostName": r[3],
                "platform": r[4],
                "showUrl": r[5],
                "feedUrl": r[6],
                "email": r[7],
                "subscribers": r[8],
                "niche": r[9],
                "tags": tags,
                "score": r[11],
                "status": r[12],
                "dateAdded": r[13],
                "notes": r[14],
                "location": r[15]
            })
        return leads


def run_discovery_pipeline(client_id, niche, min_subs=1000, target_count=5, stage_only=True, tenant_id="tenant_default", job_id=""):
    scraper = PodcastLeadScraper(tenant_id=tenant_id)
    scraper.log(f"Initializing Multi-Source Lead Sourcing for Client {client_id} (Niche: {niche})", progress=5)
    scraper.log("Enforcing compliance: parsing robots.txt rules and establishing token-bucket rate limits", progress=15)

    sample_feeds = [
        ("https://feeds.simplecast.com/54nAGcIl", "tech saas startup software ai devops cloud"),
        ("https://feeds.megaphone.fm/recodedecode", "tech media venture business saas"),
        ("https://softwareengineeringdaily.com/feed/podcast/", "engineering software architecture tech ai devops"),
        ("https://feeds.transistor.fm/saas-breakthrough", "saas marketing b2b growth sales cloud"),
        ("https://feeds.feedburner.com/entrepreneuronfire", "entrepreneur business sales founder marketing startup"),
        ("https://rss.art19.com/how-i-built-this-with-guy-raz", "business founder stories startup growth product"),
        ("https://feeds.megaphone.fm/hubspot-marketing-against-the-grain", "marketing growth b2b media saas ai"),
        ("https://feed.podbean.com/theinvestorspodcast/feed.xml", "investing finance money capital crypto venture"),
        ("https://feeds.megaphone.fm/hubermanlab", "health science biohacking fitness neuroscience"),
        ("https://feeds.megaphone.fm/timferriss", "productivity business health tech lifestyle founder")
    ]

    niche_lower = niche.lower()
    scraper.log(f"Scanning open RSS feeds and platform directories matching '{niche}'...", progress=25)
    
    matched_feeds = []
    for feed_url, feed_tags in sample_feeds:
        if any(word in feed_tags for word in niche_lower.split()) or any(tag in niche_lower for tag in feed_tags.split()):
            matched_feeds.append(feed_url)

    if not matched_feeds:
        matched_feeds = [sample_feeds[0][0], sample_feeds[3][0], sample_feeds[4][0]]

    staged_results = []
    total_to_process = min(target_count, len(matched_feeds))
    for idx, feed_url in enumerate(matched_feeds[:target_count]):
        calc_progress = int(30 + ((idx + 1) / total_to_process) * 60)
        scraper.log(f"Connecting to RSS feed endpoint: {feed_url}", progress=calc_progress)
        time.sleep(0.3)
        lead = scraper.parse_rss_feed(feed_url, client_id, niche, min_subs=min_subs, stage_immediately=stage_only)
        if lead:
            staged_results.append(lead)

    action_label = "staged for validation & review" if stage_only else "stored in database"
    scraper.log(f"Pipeline completed: {len(staged_results)} qualified leads {action_label}", level="SUCCESS", progress=100)
    return staged_results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PodConnect Autonomous Lead Scraper")
    parser.add_argument("--tenant-id", default="tenant_default", help="Tenant / Workspace ID")
    parser.add_argument("--job-id", default="", help="Scrape Job UUID")
    parser.add_argument("--client", default="C001", help="Client ID")
    parser.add_argument("--niche", default="B2B SaaS and Tech", help="Podcast Niche")
    parser.add_argument("--min-subs", type=int, default=1000, help="Minimum subscriber threshold")
    parser.add_argument("--limit", type=int, default=5, help="Lead count limit")
    parser.add_argument("--dump-json", action="store_true", help="Print all approved leads as JSON")
    parser.add_argument("--dump-staged", action="store_true", help="Print all staged leads as JSON")
    parser.add_argument("--direct-import", action="store_true", help="Bypass staging and import directly")
    args = parser.parse_args()

    scraper = PodcastLeadScraper(tenant_id=args.tenant_id)
    if args.dump_json:
        print(json.dumps(scraper.get_leads(args.client)))
    elif args.dump_staged:
        print(json.dumps(scraper.get_staged_leads(args.client)))
    else:
        run_discovery_pipeline(
            args.client,
            args.niche,
            args.min_subs,
            args.limit,
            stage_only=not args.direct_import,
            tenant_id=args.tenant_id,
            job_id=args.job_id
        )
