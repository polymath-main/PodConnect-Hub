#!/usr/bin/env python3
"""
PodConnect Autonomous Lead Sourcing & SwarmScraper Engine
Compliant, zero-paid-API podcast lead extractor using Apple Podcasts Public Index,
live RSS XML parsing with Liveness Gates, and SwarmScraper heuristic website contact spidering.
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
import socket
from html import unescape
from html.parser import HTMLParser
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone


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


class ContactLinkExtractor(HTMLParser):
    """SwarmScraper HTML parser for extracting contact sub-pages, socials, and booking forms"""
    def __init__(self, base_url):
        super().__init__()
        self.base_url = base_url
        self.contact_links = []
        self.social_links = []
        self.form_links = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == 'a':
            href = ''
            for k, v in attrs:
                if k.lower() == 'href' and v:
                    href = v.strip()
            if not href:
                return

            try:
                full_url = urllib.parse.urljoin(self.base_url, href)
                lower = full_url.lower()

                # Contact and about sub-pages
                if any(k in lower for k in ['/contact', '/about', '/booking', '/guest', '/press', '/team', 'contact-us']):
                    if full_url not in self.contact_links and not any(ext in lower for ext in ['.png', '.jpg', '.css', '.js', '.pdf', '.svg', '.mp3']):
                        self.contact_links.append(full_url)

                # Social handles
                if any(s in lower for s in ['twitter.com/', 'x.com/', 'linkedin.com/in/', 'linkedin.com/company/']):
                    if full_url not in self.social_links and not any(ign in lower for ign in ['intent/tweet', 'share?', 'widgets']):
                        self.social_links.append(full_url)

                # Direct guest booking forms
                if any(f in lower for f in ['typeform.com', 'forms.gle', 'docs.google.com/forms', 'podmatch.com', 'tally.so']):
                    if full_url not in self.form_links:
                        self.form_links.append(full_url)
            except Exception:
                pass


class EmailDiscovery:
    """Dedicated module for extracting mailto: links, advanced de-obfuscation regex, business email guessing, and domain validation."""

    IGNORED_DOMAINS = [
        'sentry.io', 'w3.org', 'schema.org', 'example.com', 'itunes.apple.com',
        'cloudflare.com', 'wp.com', 'wordpress.org', 'gravatar.com', 'googleapis.com',
        'github.com', 'medium.com', 'wixpress.com'
    ]

    HOSTING_DOMAINS = [
        'anchor.fm', 'buzzsprout.com', 'simplecast.com', 'podbean.com',
        'transistor.fm', 'megaphone.fm', 'libsyn.com', 'captivate.fm',
        'redcircle.com', 'spreaker.com', 'rss.com', 'apple.com', 'spotify.com'
    ]

    @classmethod
    def deobfuscate_text(cls, text):
        if not text:
            return ""
        cleaned = unescape(text)
        cleaned = re.sub(r'\[at\]|\(at\)|\[@\]|\(@\)', '@', cleaned, flags=re.I)
        cleaned = re.sub(r'\[dot\]|\(dot\)', '.', cleaned, flags=re.I)
        cleaned = re.sub(r'&#64;|&#x40;|%40', '@', cleaned, flags=re.I)
        return cleaned

    @classmethod
    def extract_mailto_links(cls, html_content):
        """Scans for mailto: links, unescaping HTML entities and removing query params."""
        if not html_content:
            return []
        found = []
        raw_matches = re.findall(r'href=[\'"]mailto:([^\'" >]+)[\'"]', html_content, flags=re.I)
        for m in raw_matches:
            clean = unescape(m).split('?')[0].split('#')[0].strip()
            clean = urllib.parse.unquote(clean)
            if '@' in clean and '.' in clean.split('@')[-1]:
                parts = clean.split('@')
                if len(parts) == 2 and parts[0] and parts[1]:
                    domain = parts[1].lower()
                    if not any(ign in domain for ign in cls.IGNORED_DOMAINS):
                        found.append(clean)
        return list(dict.fromkeys(found))

    @classmethod
    def extract_regex_emails(cls, text, domain_hint=None):
        """Extracts valid public contact emails using strict RFC-like pattern and de-obfuscation."""
        if not text:
            return []
        cleaned = cls.deobfuscate_text(text)
        email_pattern = r'\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b'
        matches = re.findall(email_pattern, cleaned)
        filtered = []

        for e in set(matches):
            e_lower = e.lower()
            if any(ext in e_lower for ext in ['.png', '.jpg', '.webp', '.gif', '.svg', '.css', '.js']):
                continue
            if any(ign in e_lower for ign in cls.IGNORED_DOMAINS):
                continue
            if len(e) > 6 and '.' in e.split('@')[-1]:
                filtered.append(e)

        # Prioritize domain match, then booking/guest/press prefixes over generic prefixes
        domain_clean = domain_hint.lower().replace('www.', '').split('/')[0] if domain_hint else ""

        def email_priority(em):
            score = 10
            em_l = em.lower()
            if domain_clean and domain_clean in em_l:
                score -= 5
            prefix = em_l.split('@')[0]
            if any(p in prefix for p in ['booking', 'guest', 'pitch', 'press', 'host']):
                score -= 3
            elif any(p in prefix for p in ['contact', 'hello', 'info']):
                score -= 1
            return score

        filtered.sort(key=email_priority)
        return filtered

    @classmethod
    def guess_business_emails(cls, hostname):
        """Heuristic to guess potential business emails based on hostnames found on the page."""
        if not hostname:
            return []
        clean_host = hostname.lower().strip()
        if '://' in clean_host:
            clean_host = urllib.parse.urlparse(clean_host).netloc
        clean_host = clean_host.replace('www.', '').split(':')[0].split('/')[0]
        if not clean_host or '.' not in clean_host or any(ign in clean_host for ign in cls.IGNORED_DOMAINS + cls.HOSTING_DOMAINS):
            return []

        guesses = []
        prefixes = ['booking', 'contact', 'hello', 'info', 'press', 'team']
        for p in prefixes:
            guesses.append({
                "email": f"{p}@{clean_host}",
                "type": "inferred",
                "confidence": 0.65,
                "domainValid": True,
                "validationReason": f"Inferred from show domain {clean_host}"
            })
        return guesses

    @classmethod
    def validate_domain_legitimacy(cls, domain_or_email):
        """Checks if the domain is syntactically valid and likely legitimate via DNS resolution."""
        domain = domain_or_email.split('@')[-1] if '@' in domain_or_email else domain_or_email
        domain = domain.lower().strip()

        # Syntax check
        if not domain or '.' not in domain or len(domain.split('.')[-1]) < 2:
            return False, "Invalid domain format"
        if any(ign in domain for ign in cls.IGNORED_DOMAINS):
            return False, "Domain in ignored blocklist"

        # DNS reachability check
        try:
            socket.setdefaulttimeout(2.0)
            socket.getaddrinfo(domain, None)
            return True, "Domain resolved via DNS"
        except Exception:
            return False, "Domain does not resolve via DNS"

    @classmethod
    def discover_emails_for_url(cls, url, host_name=None):
        """Enhances scrape_url to robustly search for emails, scan mailto, apply regex, guess business emails, and validate."""
        scraper = PodcastLeadScraper()
        html, _ = scraper.fetch_url(url, timeout=7)
        if not html:
            return {
                "url": url,
                "primary": "",
                "emails": [],
                "error": "Failed to fetch URL"
            }

        domain_hint = urllib.parse.urlparse(url).netloc or ""
        discovered = []
        seen = set()

        # 1. Mailto links (Highest confidence direct contacts)
        mailto_emails = cls.extract_mailto_links(html)
        for em in mailto_emails:
            if em.lower() not in seen:
                seen.add(em.lower())
                valid, reason = cls.validate_domain_legitimacy(em)
                discovered.append({
                    "email": em,
                    "type": "mailto",
                    "confidence": 0.95 if valid else 0.70,
                    "domainValid": valid,
                    "validationReason": reason
                })

        # 2. Text Regex emails
        regex_emails = cls.extract_regex_emails(html, domain_hint=domain_hint)
        for em in regex_emails:
            if em.lower() not in seen:
                seen.add(em.lower())
                valid, reason = cls.validate_domain_legitimacy(em)
                discovered.append({
                    "email": em,
                    "type": "direct",
                    "confidence": 0.90 if valid else 0.65,
                    "domainValid": valid,
                    "validationReason": reason
                })

        # 3. If no direct emails found, guess business emails from hostname
        if not discovered and domain_hint:
            guesses = cls.guess_business_emails(domain_hint)
            valid, reason = cls.validate_domain_legitimacy(domain_hint)
            for g in guesses:
                g["domainValid"] = valid
                g["validationReason"] = reason
                discovered.append(g)

        primary = ""
        for d in discovered:
            if d.get("domainValid") and not scraper.is_generic_or_hosting_email(d["email"]):
                primary = d["email"]
                break
        if not primary and discovered:
            primary = discovered[0]["email"]

        return {
            "url": url,
            "primary": primary,
            "emails": discovered
        }


def generate_lead_tags(niche, platform, subs=2500, host_name="Show Host", is_active=True, website_enriched=False):
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

    # Verification badges
    tags.append("Apple Index")
    if is_active:
        tags.append("Active Show (≤60d)")
    if website_enriched:
        tags.append("Website Enriched")

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


def expand_search_terms(niche):
    """Decomposes complex niche queries into high-recall sub-queries (bigrams and key terms)"""
    terms = [niche.strip()]
    words = [w.strip() for w in re.split(r'[,/|\s]+', niche) if len(w.strip()) > 1]

    # 2-word adjacent phrases
    for i in range(len(words) - 1):
        bigram = f"{words[i]} {words[i+1]}"
        if bigram.lower() != niche.lower() and bigram not in terms:
            terms.append(bigram)

    # Significant individual keywords
    for w in words:
        if len(w) >= 3 and w.lower() not in [t.lower() for t in terms]:
            terms.append(w)

    return terms


def search_itunes_podcasts(query, limit=10):
    """Live discovery scout: queries Apple Podcasts public catalog (100% free, real-time)"""
    encoded = urllib.parse.quote_plus(query.strip())
    url = f"https://itunes.apple.com/search?term={encoded}&media=podcast&entity=podcast&limit={max(limit * 3, 25)}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PodConnect-SwarmScraper/2.0',
        'Accept': 'application/json'
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            payload = json.loads(response.read().decode('utf-8'))
            results = payload.get('results', [])
            candidates = []
            for r in results:
                feed = r.get('feedUrl')
                name = r.get('collectionName')
                if feed and name:
                    candidates.append({
                        "show_name": name.strip(),
                        "artist_name": r.get('artistName', 'Show Host').strip(),
                        "feed_url": feed.strip(),
                        "apple_url": r.get('trackViewUrl', ''),
                        "genre": r.get('primaryGenreName', 'Podcast'),
                        "artwork": r.get('artworkUrl600', '') or r.get('artworkUrl100', ''),
                    })
            return candidates
    except Exception as e:
        sys.stderr.write(f"[Discovery] iTunes search error for '{query}': {e}\n")
        return []


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB_PATH = os.path.join(SCRIPT_DIR, "podconnect_leads.db")


class PodcastLeadScraper:
    def __init__(self, db_name=None, tenant_id="tenant_default"):
        if db_name is None:
            self.db_name = DEFAULT_DB_PATH
        elif not os.path.isabs(db_name):
            self.db_name = os.path.join(SCRIPT_DIR, db_name)
        else:
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

        # 1. Staging table: Pre-import holding area
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS staged_leads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tenant_id TEXT DEFAULT 'tenant_default',
                client_id TEXT,
                show_name TEXT,
                host_name TEXT,
                platform TEXT,
                show_url TEXT,
                feed_url TEXT,
                email TEXT,
                email_type TEXT DEFAULT 'direct',
                email_confidence REAL DEFAULT 1.0,
                subscribers INTEGER,
                niche TEXT,
                tags TEXT,
                score REAL,
                location TEXT,
                notes TEXT,
                date_scraped TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(client_id, show_name)
            )
        ''')

        # 2. Central Core Database: Approved leads
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS leads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tenant_id TEXT DEFAULT 'tenant_default',
                client_id TEXT,
                show_name TEXT,
                host_name TEXT,
                platform TEXT,
                show_url TEXT,
                feed_url TEXT,
                email TEXT,
                email_type TEXT DEFAULT 'direct',
                email_confidence REAL DEFAULT 1.0,
                subscribers INTEGER,
                niche TEXT,
                score REAL,
                status TEXT DEFAULT 'Imported',
                date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                tags TEXT,
                notes TEXT,
                location TEXT,
                UNIQUE(client_id, show_name)
            )
        ''')

        # Run SQLite column migrations if existing tables lack columns
        try:
            cursor.execute("PRAGMA table_info(staged_leads)")
            staged_cols = [c[1] for c in cursor.fetchall()]
            if 'email_type' not in staged_cols:
                cursor.execute("ALTER TABLE staged_leads ADD COLUMN email_type TEXT DEFAULT 'direct'")
            if 'email_confidence' not in staged_cols:
                cursor.execute("ALTER TABLE staged_leads ADD COLUMN email_confidence REAL DEFAULT 1.0")
            if 'notes' not in staged_cols:
                cursor.execute("ALTER TABLE staged_leads ADD COLUMN notes TEXT")
            if 'tenant_id' not in staged_cols:
                cursor.execute("ALTER TABLE staged_leads ADD COLUMN tenant_id TEXT DEFAULT 'tenant_default'")
        except Exception:
            pass

        try:
            cursor.execute("PRAGMA table_info(leads)")
            lead_cols = [c[1] for c in cursor.fetchall()]
            if 'email_type' not in lead_cols:
                cursor.execute("ALTER TABLE leads ADD COLUMN email_type TEXT DEFAULT 'direct'")
            if 'email_confidence' not in lead_cols:
                cursor.execute("ALTER TABLE leads ADD COLUMN email_confidence REAL DEFAULT 1.0")
            if 'notes' not in lead_cols:
                cursor.execute("ALTER TABLE leads ADD COLUMN notes TEXT")
            if 'tenant_id' not in lead_cols:
                cursor.execute("ALTER TABLE leads ADD COLUMN tenant_id TEXT DEFAULT 'tenant_default'")
        except Exception:
            pass

        self.conn.commit()

    def extract_emails_from_text(self, text, domain_hint=None):
        """Extracts valid public contact emails using EmailDiscovery engine"""
        return EmailDiscovery.extract_regex_emails(text, domain_hint=domain_hint)

    def is_generic_or_hosting_email(self, email):
        """Identifies generic hosting provider emails that do not reach the host directly"""
        if not email:
            return True
        email_lower = email.lower()
        hosting_domains = [
            'anchor.fm', 'buzzsprout.com', 'simplecast.com', 'podbean.com',
            'transistor.fm', 'megaphone.fm', 'libsyn.com', 'captivate.fm',
            'redcircle.com', 'spreaker.com', 'rss.com', 'apple.com', 'spotify.com'
        ]
        return any(d in email_lower for d in hosting_domains)

    def fetch_url(self, url, timeout=10):
        """Courteous URL fetcher with standard browser user-agent"""
        if not url or not url.startswith('http'):
            return None, ""
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 PodConnectBot/2.0',
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
        except Exception:
            return None, ""

    def spider_website_contacts(self, website_url, show_name):
        """SwarmScraper engine: crawls show homepage and sub-pages to extract direct booking contacts"""
        if not website_url or any(ign in website_url.lower() for ign in ['anchor.fm', 'podbean.com', 'buzzsprout.com', 'apple.com']):
            return {"email": "", "socials": [], "forms": []}

        parsed_base = urllib.parse.urlparse(website_url)
        domain_hint = parsed_base.netloc or ""

        homepage_html, _ = self.fetch_url(website_url, timeout=7)
        if not homepage_html:
            return {"email": "", "socials": [], "forms": []}

        extractor = ContactLinkExtractor(website_url)
        try:
            extractor.feed(homepage_html)
        except Exception:
            pass

        # 1. Search homepage for direct emails
        found_emails = self.extract_emails_from_text(homepage_html, domain_hint=domain_hint)

        # 2. If no direct email on homepage, visit top contact/about sub-page
        if not found_emails and extractor.contact_links:
            contact_page = extractor.contact_links[0]
            contact_html, _ = self.fetch_url(contact_page, timeout=7)
            if contact_html:
                sub_extractor = ContactLinkExtractor(contact_page)
                try:
                    sub_extractor.feed(contact_html)
                    extractor.social_links.extend(sub_extractor.social_links)
                    extractor.form_links.extend(sub_extractor.form_links)
                except Exception:
                    pass
                found_emails = self.extract_emails_from_text(contact_html, domain_hint=domain_hint)

        # Filter out generic emails if any domain-specific email is found
        direct_email = ""
        for em in found_emails:
            if not self.is_generic_or_hosting_email(em):
                direct_email = em
                break
        if not direct_email and found_emails:
            direct_email = found_emails[0]

        return {
            "email": direct_email,
            "socials": list(set(extractor.social_links))[:3],
            "forms": list(set(extractor.form_links))[:2]
        }

    def evaluate_lead(self, text, emails, base_score=7.0, min_subs=1000, is_active=True, website_enriched=False):
        """Evaluates and scores lead based on subscriber metrics, recency, and verified direct contact"""
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

        if is_active:
            score += 1.5
        if len(emails) > 0 and not self.is_generic_or_hosting_email(emails[0]):
            score += 1.5
        if website_enriched:
            score += 0.5
        if subs >= min_subs:
            score += 0.5

        return max(1.0, min(10.0, round(score, 1))), int(subs)

    def parse_rss_feed(self, rss_url, client_id, niche, min_subs=1000, max_inactive_days=60, stage_immediately=True, itunes_item=None):
        """Parses RSS feed XML, enforces Liveness Gate (≤60 days), and applies SwarmScraper contact enrichment"""
        text, _ = self.fetch_url(rss_url)
        if not text:
            return None

        title = itunes_item.get("show_name") if itunes_item else None
        link = rss_url
        host_name = itunes_item.get("artist_name") if itunes_item else "Show Host"
        description = ""
        emails = []
        latest_pub_date = None

        try:
            root = ET.fromstring(text)
            channel = root.find('channel')
            if channel is not None:
                title = title or channel.findtext('title')
                raw_link = channel.findtext('link')
                if raw_link and not any(raw_link.lower().endswith(ext) for ext in ['.xml', '.rss', '/feed', '/rss', '/feed.xml']):
                    link = raw_link.strip()
                elif itunes_item and itunes_item.get("apple_url"):
                    link = itunes_item.get("apple_url")
                else:
                    link = raw_link or rss_url

                description = channel.findtext('description') or ""

                itunes_owner = channel.find('{http://www.itunes.com/dtds/podcast-1.0.dtd}owner')
                if itunes_owner is not None:
                    owner_email = itunes_owner.findtext('{http://www.itunes.com/dtds/podcast-1.0.dtd}email')
                    owner_name = itunes_owner.findtext('{http://www.itunes.com/dtds/podcast-1.0.dtd}name')
                    if owner_email:
                        emails.append(owner_email.strip())
                    if owner_name and host_name in ["Show Host", ""]:
                        host_name = owner_name.strip()

                author = channel.findtext('{http://www.itunes.com/dtds/podcast-1.0.dtd}author')
                if author and host_name in ["Show Host", ""]:
                    host_name = author.strip()

                # Extract latest episode publication date across recent episodes for Liveness Gate
                items = channel.findall('item')
                for item in items[:5]:
                    item_pub = item.findtext('pubDate')
                    if item_pub:
                        try:
                            dt = parsedate_to_datetime(item_pub.strip())
                            if dt.tzinfo is None:
                                dt = dt.replace(tzinfo=timezone.utc)
                            if latest_pub_date is None or dt > latest_pub_date:
                                latest_pub_date = dt
                        except Exception:
                            pass
        except Exception:
            pass

        # Regex fallback for title
        if not title:
            title_match = re.search(r'<title>(.*?)</title>', text, re.I | re.S)
            if title_match:
                title = re.sub(r'<!\[CDATA\[(.*?)\]\]>', r'\1', title_match.group(1)).strip()

        # Regex fallback for author
        if host_name in ["Show Host", ""]:
            author_match = re.search(r'<itunes:author>(.*?)</itunes:author>', text, re.I | re.S)
            if author_match:
                host_name = re.sub(r'<!\[CDATA\[(.*?)\]\]>', r'\1', author_match.group(1)).strip()

        # Regex fallback for owner email
        email_match = re.search(r'<itunes:email>(.*?)</itunes:email>', text, re.I | re.S)
        if email_match:
            em = email_match.group(1).strip()
            if em and em not in emails:
                emails.append(em)

        # Regex fallback for latest episode date
        if not latest_pub_date:
            pub_match = re.search(r'<pubDate>(.*?)</pubDate>', text, re.I)
            if pub_match:
                try:
                    latest_pub_date = parsedate_to_datetime(pub_match.group(1).strip())
                except Exception:
                    pass

        # ----------------------------------------------------
        # LIVENESS GATE: Filter out dormant/abandoned podcasts
        # ----------------------------------------------------
        is_active = True
        if latest_pub_date:
            try:
                now_utc = datetime.now(timezone.utc)
                if latest_pub_date.tzinfo is None:
                    latest_pub_date = latest_pub_date.replace(tzinfo=timezone.utc)
                age_days = (now_utc - latest_pub_date).days

                if age_days > max_inactive_days:
                    self.log(
                        f"Skipping dormant podcast: '{title}' (last episode was {age_days} days ago > {max_inactive_days}d threshold)",
                        level="WARN"
                    )
                    return None
            except Exception:
                pass

        if not title:
            title = "Podcast: " + niche

        # ----------------------------------------------------
        # SWARMSCRAPER WEBSITE & CONTACT SPIDER
        # ----------------------------------------------------
        website_enriched = False
        primary_email = emails[0] if emails else ""
        booking_notes = []

        # If email is missing or belongs to a hosting domain (@anchor, @buzzsprout, etc.)
        if self.is_generic_or_hosting_email(primary_email) and link and link.startswith('http'):
            self.log(f"Feed email is generic/missing ({primary_email or 'None'}). SwarmScraper spidering show website: {link}...")
            spider_res = self.spider_website_contacts(link, title)

            if spider_res.get("email"):
                primary_email = spider_res["email"]
                website_enriched = True
                self.log(f"✓ Discovered direct host booking email via website spider: {primary_email}", level="SUCCESS")

            if spider_res.get("socials"):
                booking_notes.append("Socials: " + ", ".join(spider_res["socials"]))
            if spider_res.get("forms"):
                booking_notes.append("Guest Form: " + ", ".join(spider_res["forms"]))

        # Secondary search in feed description
        if not primary_email:
            desc_match = re.search(r'<description>(.*?)</description>', text, re.I | re.S)
            if desc_match:
                description = desc_match.group(1)
            desc_emails = self.extract_emails_from_text(description + " " + text[:15000])
            for em in desc_emails:
                if not self.is_generic_or_hosting_email(em):
                    primary_email = em
                    break

        score, subs = self.evaluate_lead(
            description + " " + text[:15000],
            [primary_email] if primary_email else [],
            min_subs=min_subs,
            is_active=is_active,
            website_enriched=website_enriched
        )

        tags = generate_lead_tags(
            niche,
            "Apple Index / RSS",
            subs=subs,
            host_name=host_name,
            is_active=is_active,
            website_enriched=website_enriched
        )

        lead = {
            "client_id": client_id,
            "show_name": title.strip(),
            "host_name": host_name.strip() if host_name else "Show Host",
            "platform": "Apple Podcasts / RSS",
            "show_url": link.strip(),
            "feed_url": rss_url,
            "email": primary_email,
            "subscribers": subs,
            "niche": niche,
            "tags": tags,
            "score": score,
            "location": "Global / Remote",
            "notes": " | ".join(booking_notes) if booking_notes else None
        }

        if stage_immediately:
            self.save_staged_lead(lead)
        else:
            self.save_lead(lead)

        return lead

    def save_staged_lead(self, lead):
        """Saves scraped lead to the STAGING area for operator validation, edit, and approval"""
        cursor = self.conn.cursor()
        tags_json = json.dumps(lead.get("tags") or [])

        cursor.execute('''
            INSERT INTO staged_leads (
                tenant_id, client_id, show_name, host_name, platform, show_url,
                feed_url, email, email_type, email_confidence, subscribers, niche, tags, score, location, notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(client_id, show_name) DO UPDATE SET
                tenant_id = excluded.tenant_id,
                host_name = excluded.host_name,
                email = CASE WHEN excluded.email != '' THEN excluded.email ELSE staged_leads.email END,
                email_type = excluded.email_type,
                email_confidence = excluded.email_confidence,
                subscribers = max(staged_leads.subscribers, excluded.subscribers),
                tags = excluded.tags,
                score = excluded.score,
                notes = CASE WHEN excluded.notes IS NOT NULL THEN excluded.notes ELSE staged_leads.notes END
        ''', (
            self.tenant_id,
            lead["client_id"],
            lead["show_name"],
            lead["host_name"],
            lead["platform"],
            lead["show_url"],
            lead.get("feed_url", ""),
            lead.get("email", ""),
            lead.get("email_type", "direct"),
            lead.get("email_confidence", 1.0),
            lead.get("subscribers", 2500),
            lead["niche"],
            tags_json,
            lead.get("score", 8.0),
            lead.get("location", "Global / Remote"),
            lead.get("notes")
        ))
        self.conn.commit()
        self.log(f"[STAGED] Scraped lead held in review area: {lead['show_name']} ({lead['platform']})", lead=lead)

    def save_lead(self, lead):
        """Saves scraped lead directly to the core LEADS database (bypassing staging)"""
        cursor = self.conn.cursor()
        tags_json = json.dumps(lead.get("tags") or [])

        cursor.execute('''
            INSERT INTO leads (
                tenant_id, client_id, show_name, host_name, platform, show_url,
                feed_url, email, email_type, email_confidence, subscribers, niche, score, status, tags, notes, location
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Imported', ?, ?, ?)
            ON CONFLICT(client_id, show_name) DO UPDATE SET
                tenant_id = excluded.tenant_id,
                host_name = excluded.host_name,
                email = CASE WHEN excluded.email != '' THEN excluded.email ELSE leads.email END,
                email_type = excluded.email_type,
                email_confidence = excluded.email_confidence,
                subscribers = max(leads.subscribers, excluded.subscribers),
                tags = excluded.tags,
                score = excluded.score,
                notes = CASE WHEN excluded.notes IS NOT NULL THEN excluded.notes ELSE leads.notes END
        ''', (
            self.tenant_id,
            lead["client_id"],
            lead["show_name"],
            lead["host_name"],
            lead["platform"],
            lead["show_url"],
            lead.get("feed_url", ""),
            lead.get("email", ""),
            lead.get("email_type", "direct"),
            lead.get("email_confidence", 1.0),
            lead.get("subscribers", 2500),
            lead["niche"],
            lead.get("score", 8.0),
            tags_json,
            lead.get("notes"),
            lead.get("location", "Global / Remote")
        ))
        self.conn.commit()
        self.log(f"[IMPORTED] Lead directly added to core database: {lead['show_name']}", lead=lead)

    def get_staged_leads(self, client_id=None):
        cursor = self.conn.cursor()
        if client_id and client_id != "ALL":
            cursor.execute(
                'SELECT id, client_id, show_name, host_name, platform, show_url, feed_url, email, email_type, email_confidence, subscribers, niche, tags, score, location, notes, date_scraped '
                'FROM staged_leads WHERE (tenant_id = ? OR tenant_id = "tenant_default") AND client_id = ? ORDER BY date_scraped DESC',
                (self.tenant_id, client_id)
            )
        else:
            cursor.execute(
                'SELECT id, client_id, show_name, host_name, platform, show_url, feed_url, email, email_type, email_confidence, subscribers, niche, tags, score, location, notes, date_scraped '
                'FROM staged_leads WHERE tenant_id = ? OR tenant_id = "tenant_default" ORDER BY date_scraped DESC',
                (self.tenant_id,)
            )
        rows = cursor.fetchall()
        leads = []
        for r in rows:
            tags = []
            try:
                tags = json.loads(r[12]) if r[12] else []
            except Exception:
                tags = [t.strip() for t in (r[12] or "").split(',') if t.strip()]

            leads.append({
                "id": r[0],
                "clientId": r[1],
                "showName": r[2],
                "hostName": r[3],
                "platform": r[4],
                "showUrl": r[5],
                "feedUrl": r[6],
                "email": r[7],
                "emailType": r[8] or "direct",
                "emailConfidence": r[9] if r[9] is not None else 1.0,
                "subscribers": r[10],
                "niche": r[11],
                "tags": tags,
                "score": r[13],
                "location": r[14],
                "notes": r[15],
                "dateScraped": r[16]
            })
        return leads

    def get_leads(self, client_id=None, niche=None, tag=None, status=None, search=None):
        cursor = self.conn.cursor()
        query = 'SELECT id, client_id, show_name, host_name, platform, show_url, feed_url, email, subscribers, niche, tags, score, status, date_added, notes, location FROM leads WHERE (tenant_id = ? OR tenant_id = "tenant_default")'
        params = [self.tenant_id]

        if client_id and client_id != "ALL":
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


def run_discovery_pipeline(client_id, niche, min_subs=1000, target_count=5, stage_only=True, tenant_id="tenant_default", job_id="", max_inactive_days=60):
    scraper = PodcastLeadScraper(tenant_id=tenant_id)
    scraper.log(f"Initializing SwarmScraper Multi-Source Discovery for Client {client_id} (Niche: '{niche}')", progress=5)

    # 1. Tier 1: Query Apple Podcasts live directory with autonomous query expansion
    candidates = []
    seen_feeds = set()
    search_terms = expand_search_terms(niche)

    for term in search_terms:
        if len(candidates) >= max(target_count * 4, 30):
            break
        scraper.log(f"Querying Apple Podcasts live catalog for '{term}'...", progress=min(25, 10 + len(candidates)))
        term_candidates = search_itunes_podcasts(term, limit=max(target_count * 3, 20))
        for item in term_candidates:
            if item["feed_url"] not in seen_feeds:
                seen_feeds.add(item["feed_url"])
                candidates.append(item)

    if not candidates:
        scraper.log(f"No live podcasts found on Apple Index for '{niche}'. Expanding keyword dorks...", level="WARN", progress=25)
        candidates = search_itunes_podcasts("Technology and Business", limit=max(target_count * 3, 20))

    scraper.log(f"Discovered {len(candidates)} candidate shows matching '{niche}'. Initializing RSS & Liveness Inspection...", progress=30)

    # 2. Tier 2 & Tier 3: Process feeds with Liveness Gate and SwarmScraper Website Spidering
    staged_results = []
    max_to_inspect = min(len(candidates), max(target_count * 5, 30))

    for idx, cand in enumerate(candidates[:max_to_inspect]):
        if len(staged_results) >= target_count:
            break

        calc_progress = int(30 + ((idx + 1) / max_to_inspect) * 60)
        scraper.log(f"Inspecting feed [{idx+1}/{max_to_inspect}]: {cand['show_name']} ({cand['genre']})", progress=calc_progress)

        time.sleep(0.1)
        lead = scraper.parse_rss_feed(
            cand["feed_url"],
            client_id,
            niche,
            min_subs=min_subs,
            max_inactive_days=max_inactive_days,
            stage_immediately=stage_only,
            itunes_item=cand
        )

        if lead:
            staged_results.append(lead)

    action_label = "staged for validation & review" if stage_only else "stored in database"
    scraper.log(
        f"SwarmScraper pipeline completed: {len(staged_results)} active, verified leads {action_label}",
        level="SUCCESS",
        progress=100
    )
    return staged_results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PodConnect Autonomous SwarmScraper Lead Engine")
    parser.add_argument("--tenant-id", default="tenant_default", help="Tenant / Workspace ID")
    parser.add_argument("--job-id", default="", help="Scrape Job UUID")
    parser.add_argument("--client", default="C001", help="Client ID")
    parser.add_argument("--niche", default="B2B SaaS and Tech", help="Podcast Niche")
    parser.add_argument("--min-subs", type=int, default=1000, help="Minimum subscriber threshold")
    parser.add_argument("--limit", type=int, default=5, help="Lead count limit")
    parser.add_argument("--max-inactive-days", type=int, default=60, help="Max days since last episode (Liveness Gate)")
    parser.add_argument("--discover-email", help="Discover and validate public contact emails from a target URL")
    parser.add_argument("--scrape-url", help="Scrape podcast information from a direct URL")
    parser.add_argument("--dump-json", action="store_true", help="Print all approved leads as JSON")
    parser.add_argument("--dump-staged", action="store_true", help="Print all staged leads as JSON")
    parser.add_argument("--direct-import", action="store_true", help="Bypass staging and import directly")
    args = parser.parse_args()

    scraper = PodcastLeadScraper(tenant_id=args.tenant_id)
    if args.discover_email:
        res = EmailDiscovery.discover_emails_for_url(args.discover_email)
        print(json.dumps(res))
    elif args.dump_json:
        print(json.dumps(scraper.get_leads(args.client)))
    elif args.dump_staged:
        print(json.dumps(scraper.get_staged_leads(args.client)))
    else:
        run_discovery_pipeline(
            client_id=args.client,
            niche=args.niche,
            min_subs=args.min_subs,
            target_count=args.limit,
            stage_only=not args.direct_import,
            tenant_id=args.tenant_id,
            job_id=args.job_id,
            max_inactive_days=args.max_inactive_days
        )
