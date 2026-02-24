# -*- coding: utf-8 -*-
"""
Obsidian Forge Theme Visual Test
Tests all screens of the task manager PWA and captures screenshots.
"""
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from playwright.sync_api import sync_playwright
import os

SCREENSHOTS_DIR = r"C:\Users\irfan\.gemini\antigravity\brain\9e6fa4e5-5cd8-4a83-8d80-2684043497d8"
BASE_URL = "http://localhost:3000"

def screenshot(page, name):
    path = os.path.join(SCREENSHOTS_DIR, f"{name}.png")
    page.screenshot(path=path, full_page=True)
    print(f"  [OK] Screenshot saved: {name}.png")
    return path

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            color_scheme="dark",
        )
        page = context.new_page()

        errors = []
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)

        print("\n=== Obsidian Forge Theme Visual Test ===\n")

        # 1. Main page load
        print("1. Testing main page load...")
        page.goto(BASE_URL)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1000)
        screenshot(page, "01_tasks_screen")

        # 2. Add a test task
        print("2. Opening add task screen...")
        add_btn = page.locator("button").filter(has=page.locator("svg.lucide-plus")).first
        if add_btn.is_visible():
            add_btn.click()
            page.wait_for_timeout(500)
            screenshot(page, "02_add_task_screen")

            title_input = page.locator("input[type='text']").first
            if title_input.is_visible():
                title_input.fill("Test Obsidian Task")

            detail_input = page.locator("textarea").first
            if detail_input.is_visible():
                detail_input.fill("Testing the new Obsidian Forge dark theme.")

            date_input = page.locator("input[type='date']").first
            if date_input.is_visible():
                date_input.fill("2026-03-01")

            page.wait_for_timeout(300)
            screenshot(page, "03_add_task_filled")

            save_btn = page.locator("button").filter(has=page.locator("svg.lucide-check")).first
            if save_btn.is_visible():
                save_btn.click()
                page.wait_for_timeout(800)

        # 3. Tasks grid with card
        print("3. Tasks grid with card...")
        screenshot(page, "04_tasks_with_card")

        # 4. Open drawer
        print("4. Opening drawer...")
        menu_btn = page.locator("button").filter(has=page.locator("svg.lucide-menu")).first
        if menu_btn.is_visible():
            menu_btn.click()
            page.wait_for_timeout(500)
            screenshot(page, "05_drawer_open")

            # 5. Calendar
            print("5. Calendar screen...")
            calendar_link = page.get_by_text("CALENDAR")
            if calendar_link.is_visible():
                calendar_link.click()
                page.wait_for_timeout(800)
                screenshot(page, "06_calendar_screen")

            # 6. Settings
            print("6. Settings screen...")
            menu_btn2 = page.locator("button").filter(has=page.locator("svg.lucide-menu")).first
            if menu_btn2.is_visible():
                menu_btn2.click()
                page.wait_for_timeout(500)
                settings_link = page.get_by_text("SETTINGS")
                if settings_link.is_visible():
                    settings_link.click()
                    page.wait_for_timeout(800)
                    screenshot(page, "07_settings_screen")

            # 7. Completed
            print("7. Completed screen...")
            menu_btn3 = page.locator("button").filter(has=page.locator("svg.lucide-menu")).first
            if menu_btn3.is_visible():
                menu_btn3.click()
                page.wait_for_timeout(500)
                completed_link = page.get_by_text("COMPLETED")
                if completed_link.is_visible():
                    completed_link.click()
                    page.wait_for_timeout(800)
                    screenshot(page, "08_completed_screen")

        # 8. Task detail
        print("8. Task detail screen...")
        menu_btn4 = page.locator("button").filter(has=page.locator("svg.lucide-menu")).first
        if menu_btn4.is_visible():
            menu_btn4.click()
            page.wait_for_timeout(500)
            tasks_link = page.get_by_text("TASKS").first
            if tasks_link.is_visible():
                tasks_link.click()
                page.wait_for_timeout(800)

        task_card = page.locator("text=Test Obsidian Task").first
        if task_card.is_visible():
            task_card.click()
            page.wait_for_timeout(800)
            screenshot(page, "09_task_detail_screen")

        # Summary
        print(f"\n=== Results ===")
        print(f"Console errors: {len(errors)}")
        for err in errors[:5]:
            print(f"  ERROR: {err[:120]}")

        if not errors:
            print("  No console errors detected!")

        print("\n=== Test complete! ===")

        browser.close()

if __name__ == "__main__":
    main()
