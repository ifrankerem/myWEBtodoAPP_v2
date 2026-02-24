# -*- coding: utf-8 -*-
"""Quick test: capture both calendar views"""
import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from playwright.sync_api import sync_playwright

DIR = r"C:\Users\irfan\.gemini\antigravity\brain\9e6fa4e5-5cd8-4a83-8d80-2684043497d8"
URL = "http://localhost:3000"

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, color_scheme="dark")
        page = ctx.new_page()

        # Go to calendar via drawer
        page.goto(URL)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(800)

        # Open drawer
        page.locator("button").filter(has=page.locator("svg.lucide-menu")).first.click()
        page.wait_for_timeout(400)
        page.get_by_text("CALENDAR").click()
        page.wait_for_timeout(800)

        # Grid view (default)
        page.screenshot(path=os.path.join(DIR, "cal_grid_view.png"), full_page=True)
        print("[OK] Grid view captured")

        # Switch to schedule view
        schedule_btn = page.locator("button[title='Schedule view']")
        if schedule_btn.is_visible():
            schedule_btn.click()
            page.wait_for_timeout(600)
            page.screenshot(path=os.path.join(DIR, "cal_schedule_view.png"), full_page=True)
            print("[OK] Schedule view captured")
        else:
            print("[WARN] Schedule view button not found")

        browser.close()
        print("[DONE]")

if __name__ == "__main__":
    main()
