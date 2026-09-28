// เดินหน้าเว็บด้วย Playwright + ถ่าย screenshot มือถือ (ต้อง npm i -D playwright && npx playwright install chromium) — ใช้กับ mock upstream
import { chromium } from "playwright";
const B = "http://localhost:3005";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "th-TH", timezoneId: "Asia/Bangkok" });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text()); });
await page.goto(B + "/login"); await page.waitForTimeout(800); await page.screenshot({ path: "/tmp/s1-login.png" });
await page.fill("input", "0805088183"); await page.click("text=ขอรหัส OTP"); await page.waitForTimeout(800);
await page.fill("input", "123456"); await page.click("text=ยืนยัน OTP"); await page.waitForURL(B + "/"); await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/s2-home.png" });
await page.goto(B + "/book"); await page.waitForTimeout(1500); await page.screenshot({ path: "/tmp/s3-book.png" });
// เลือกวันที่ปิด (index 20) แล้วเลือก 2 ช่อง
const dates = page.locator("button:has-text('ตั้งคิว')"); await dates.nth(5).click(); await page.waitForTimeout(1200);
await page.locator("button.slot.free:has-text('฿')").nth(0).click(); await page.locator("button.slot.free:has-text('฿')").nth(1).click(); await page.waitForTimeout(300);
await page.screenshot({ path: "/tmp/s4-book-picked.png" });
await page.click("text=ใส่ตะกร้า"); await page.waitForURL(/cart/); await page.waitForTimeout(1200); await page.screenshot({ path: "/tmp/s5-cart.png" });
// จองวันเปิด → QR
await page.goto(B + "/book"); await page.waitForTimeout(1500);
await page.locator("button:has-text('จองได้')").nth(2).click(); await page.waitForTimeout(1200);
await page.locator("button.slot.free:has-text('฿')").nth(0).click(); await page.click("text=จองเลย"); await page.waitForURL(/cart/); await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/s6-cart-pending.png" });
await page.click("text=สแกนจ่าย"); await page.waitForURL(/pay/); await page.waitForTimeout(1200); await page.screenshot({ path: "/tmp/s7-pay.png", fullPage: true });
await page.goto(B + "/wallet"); await page.waitForTimeout(1200); await page.screenshot({ path: "/tmp/s8-wallet.png" });
await page.goto(B + "/bookings"); await page.waitForTimeout(1200); await page.screenshot({ path: "/tmp/s9-bookings.png" });
await page.goto(B + "/manual"); await page.waitForTimeout(800); await page.screenshot({ path: "/tmp/s10-manual.png", fullPage: true });
await page.goto(B + "/settings"); await page.waitForTimeout(1200); await page.screenshot({ path: "/tmp/s11-settings.png" });
await browser.close(); console.log("done");
