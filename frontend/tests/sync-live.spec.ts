import { test, expect, BrowserContext, Page } from '@playwright/test';

/**
 * Full visual E2E test: admin creates a 2-question quiz via API,
 * 5 bot-players join via browser, answer both questions, and verify sync.
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:7860';
const FRONTEND_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Quiz Synchronization Live Test', () => {
    test.setTimeout(180_000);

    test('Admin + 5 players sync test through 2 questions', async ({ browser }) => {
        // ─── 1. LOGIN via Backend API ───────────────────────────
        const loginRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'inFina2026!!**' }),
        });
        const loginBody = await loginRes.json();
        const token = loginBody.token;
        if (!token) throw new Error(`Login failed: ${JSON.stringify(loginBody)}`);
        console.log('✅ Admin logged in via API');

        const authHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        };

        // ─── 2. CREATE QUIZ + QUESTIONS via API ─────────────────
        const createRes = await fetch(`${BACKEND_URL}/api/quizzes`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ title: `SyncTest_${Date.now()}`, description: 'Automated sync test' }),
        });
        const quiz = await createRes.json();
        const quizId = quiz.id;
        console.log(`✅ Quiz created: id=${quizId}`);

        // Add Question 1
        await fetch(`${BACKEND_URL}/api/quizzes/${quizId}/questions`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                questionText: 'Question 1: Are we synced?',
                questionType: 'multiple_choice',
                timeLimitSeconds: 30,
                basePoints: 1000,
                deductionPoints: 50,
                deductionInterval: 1,
                choices: [
                    { choiceText: 'Yes', isCorrect: true, orderIndex: 0 },
                    { choiceText: 'No', isCorrect: false, orderIndex: 1 },
                ],
            }),
        });
        console.log('✅ Question 1 added');

        // Add Question 2
        await fetch(`${BACKEND_URL}/api/quizzes/${quizId}/questions`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                questionText: 'Question 2: Still synced?',
                questionType: 'multiple_choice',
                timeLimitSeconds: 30,
                basePoints: 1000,
                deductionPoints: 50,
                deductionInterval: 1,
                choices: [
                    { choiceText: 'Absolutely', isCorrect: true, orderIndex: 0 },
                    { choiceText: 'Nope', isCorrect: false, orderIndex: 1 },
                ],
            }),
        });
        console.log('✅ Question 2 added');

        // Publish quiz
        const publishRes = await fetch(`${BACKEND_URL}/api/quizzes/${quizId}/publish`, {
            method: 'POST',
            headers: authHeaders,
        });
        const pubData = await publishRes.json();
        const sessionId = pubData.session?.id || pubData.sessionId || pubData.id;
        const pin = pubData.pin || pubData.pinCode;
        console.log(`✅ Published! Session=${sessionId}, PIN=${pin}`);

        // ─── 3. ADMIN: Open live control page ───────────────────
        const adminCtx = await browser.newContext({
            viewport: { width: 1280, height: 800 },
            locale: 'en-US',
            storageState: {
                cookies: [],
                origins: [{
                    origin: FRONTEND_URL,
                    localStorage: [{ name: 'infinarena:admin-token', value: token }],
                }],
            },
        });
        const admin = await adminCtx.newPage();
        await admin.goto(`${FRONTEND_URL}/infinarenapanel/live/${pin}`);
        await admin.waitForLoadState('domcontentloaded');
        await admin.waitForTimeout(3000);

        // Click "Start Live" if visible
        const startLiveBtn = admin.getByRole('button', { name: /Start Live|Canlıyı Başlat/i });
        if (await startLiveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await startLiveBtn.click();
            await admin.waitForTimeout(2000);
            console.log('✅ Live session started');
        }
        console.log(`✅ Admin in lobby, PIN: ${pin}`);

        // ─── 4. PLAYERS: Join ──────────────────────────────────
        const NUM_PLAYERS = 5;
        const playerCtxs: BrowserContext[] = [];
        const players: Page[] = [];

        for (let i = 1; i <= NUM_PLAYERS; i++) {
            const ctx = await browser.newContext({
                viewport: { width: 420, height: 700 },
                locale: 'en-US',
            });
            playerCtxs.push(ctx);
            const page = await ctx.newPage();
            players.push(page);

            await page.goto(FRONTEND_URL);
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(1500);

            // Enter PIN
            const pinInput = page.locator('input').first();
            await pinInput.fill(String(pin));
            const enterBtn = page.getByRole('button').first();
            await enterBtn.click();
            await page.waitForTimeout(2000);

            // Enter nickname
            const nicknameInput = page.locator('input').first();
            await nicknameInput.fill(`Bot_${i}`);
            const joinBtn = page.getByRole('button', { name: /join|katıl/i });
            await joinBtn.click();
            await page.waitForTimeout(1500);
            console.log(`  🤖 Bot_${i} joined`);
        }
        console.log(`✅ All ${NUM_PLAYERS} players joined`);
        await admin.waitForTimeout(2000);

        // ─── 5. ADMIN: Start Quiz ──────────────────────────────
        const startQuizBtn = admin.getByRole('button', { name: /Start Quiz|Quizi Başlat/i });
        await expect(startQuizBtn).toBeVisible({ timeout: 10000 });
        await startQuizBtn.click();
        console.log('✅ Quiz started! Q1 active');
        await admin.waitForTimeout(3000);

        // ─── 6. PLAYERS: Answer Q1 ─────────────────────────────
        let q1Count = 0;
        for (const p of players) {
            try {
                const allButtons = await p.locator('button').all();
                for (const btn of allButtons) {
                    const box = await btn.boundingBox();
                    if (box && box.height > 80 && box.width > 80) {
                        await btn.click();
                        q1Count++;
                        break;
                    }
                }
            } catch (e) {
                console.log(`  ⚠️ Q1 answer fail: ${(e as Error).message.slice(0, 60)}`);
            }
            await p.waitForTimeout(300);
        }
        console.log(`✅ Q1: ${q1Count}/${NUM_PLAYERS} answered`);
        await admin.waitForTimeout(3000);

        // ─── 7. ADMIN: Show Results Q1 ─────────────────────────
        const showRes1 = admin.getByRole('button', { name: /Show Results|Sonuçları Göster/i });
        if (await showRes1.isVisible({ timeout: 5000 }).catch(() => false)) {
            await showRes1.click();
            console.log('✅ Admin: Show Results Q1');
        }
        await admin.waitForTimeout(2000);

        // ─── 8. ADMIN: Next Question ───────────────────────────
        const nextBtn = admin.getByRole('button', { name: /Next Question|Sonraki Soru/i });
        if (await nextBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await nextBtn.click();
            console.log('✅ Admin: Next Question → Q2');
        }
        await admin.waitForTimeout(3000);

        // ─── 9. PLAYERS: Answer Q2 ─────────────────────────────
        let q2Count = 0;
        for (const p of players) {
            try {
                const allButtons = await p.locator('button').all();
                for (const btn of allButtons) {
                    const box = await btn.boundingBox();
                    if (box && box.height > 80 && box.width > 80) {
                        await btn.click();
                        q2Count++;
                        break;
                    }
                }
            } catch (e) {
                console.log(`  ⚠️ Q2 answer fail: ${(e as Error).message.slice(0, 60)}`);
            }
            await p.waitForTimeout(300);
        }
        console.log(`✅ Q2: ${q2Count}/${NUM_PLAYERS} answered`);
        await admin.waitForTimeout(3000);

        // ─── 10. ADMIN: Show Results Q2 ────────────────────────
        const showRes2 = admin.getByRole('button', { name: /Show Results|Sonuçları Göster/i });
        if (await showRes2.isVisible({ timeout: 5000 }).catch(() => false)) {
            await showRes2.click();
            console.log('✅ Admin: Show Results Q2');
        }
        await admin.waitForTimeout(2000);

        // ─── 11. REPORT ────────────────────────────────────────
        console.log('\n════════════════════════════════════════');
        console.log('📊 SYNC TEST REPORT');
        console.log('════════════════════════════════════════');
        console.log(`  Players joined:     ${NUM_PLAYERS}`);
        console.log(`  Q1 answers:         ${q1Count}/${NUM_PLAYERS}`);
        console.log(`  Q2 answers:         ${q2Count}/${NUM_PLAYERS}`);
        if (q1Count === NUM_PLAYERS && q2Count === NUM_PLAYERS) {
            console.log('  ✅ SYNC TEST PASSED: All players answered both questions');
        } else {
            console.log('  ❌ SYNC TEST FAILED: Some players could not answer');
            if (q2Count < q1Count) {
                console.log('  🐛 BUG CONFIRMED: Players stopped answering after Q1');
            }
        }
        console.log('════════════════════════════════════════\n');

        // Cleanup
        for (const ctx of playerCtxs) await ctx.close();
        await adminCtx.close();
    });
});
