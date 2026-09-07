import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const port = 4014;
const debuggerPort = 9224;
const baseUrl = `http://127.0.0.1:${port}`;
const storeDirectory = await mkdtemp(path.join(os.tmpdir(), "typing-arena-top-three-"));
const storePath = path.join(storeDirectory, "scores.json");
let server;
let browser;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(check, message) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await check()) return;
    await wait(125);
  }
  throw new Error(message);
}

function startProcess(command, args, options = {}) {
  return spawn(command, args, { stdio: "ignore", ...options });
}

async function stopProcess(process) {
  if (!process || process.exitCode !== null) return;
  const exited = once(process, "exit");
  process.kill("SIGTERM");
  await Promise.race([exited, wait(2_000)]);
}

async function postScore(playId, nickname, score, wpm) {
  const response = await fetch(`${baseUrl}/api/record-score`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({
      playId,
      mode: "basic",
      nickname,
      score,
      wpm,
      accuracy: 100,
      completed: 10,
      bestStreak: 10,
      duration: 60,
    }),
  });
  assert.equal(response.status, 201, `${nickname}のテスト記録に失敗しました。`);
}

async function connectCdp() {
  const pages = await fetch(`http://127.0.0.1:${debuggerPort}/json/list`).then((response) => response.json());
  const page = pages.find((candidate) => candidate.type === "page" && candidate.url.startsWith(baseUrl))
    ?? pages.find((candidate) => candidate.type === "page");
  assert.ok(page?.webSocketDebuggerUrl, "ブラウザのデバッグ接続先が見つかりません。");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let messageId = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    const resolver = pending.get(message.id);
    if (!resolver) return;
    pending.delete(message.id);
    resolver(message);
  });

  const evaluate = async (expression) => {
    const id = ++messageId;
    const result = new Promise((resolve) => pending.set(id, resolve));
    socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
    const response = await result;
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result?.result?.value;
  };
  return { socket, evaluate };
}

try {
  server = startProcess("node", ["dist/index.js"], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: "", RANKING_STORE_PATH: storePath, NODE_ENV: "production", HOST: "127.0.0.1", PORT: String(port) },
  });
  await waitFor(async () => (await fetch(`${baseUrl}/`).catch(() => null))?.ok, "LANテストサーバーが起動しませんでした。");

  await postScore("top_three_alpha_01", "ALPHA", 1400, 72);
  await postScore("top_three_bravo_02", "BRAVO", 1100, 60);
  await postScore("top_three_charlie03", "ゲスト", 1100, 58);

  browser = startProcess("chromium", [
    "--headless=new", `--remote-debugging-port=${debuggerPort}`, `--user-data-dir=${path.join(storeDirectory, "browser")}`,
    "--no-first-run", "--no-default-browser-check", "--no-sandbox", `${baseUrl}/`,
  ]);
  await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debuggerPort}/json/list`).catch(() => null);
    if (!response?.ok) return false;
    const pages = await response.json();
    return pages.some((candidate) => candidate.type === "page" && candidate.url.startsWith(baseUrl));
  }, "ヘッドレスブラウザがゲーム画面を開けませんでした。");

  const { socket, evaluate } = await connectCdp();
  const completedRun = {
    playId: "top_three_result_04",
    mode: "basic",
    nickname: "表示確認",
    score: 500,
    wpm: 31,
    accuracy: 98,
    completed: 5,
    bestStreak: 4,
    duration: 60,
    typedCharacters: 25,
    averageInputCharacters: 5,
    completedAt: new Date().toISOString(),
    presentedTerms: [],
  };
  const storageValue = JSON.stringify(completedRun);
  await evaluate(`sessionStorage.setItem("computer-typing-arena.completed-run", ${JSON.stringify(storageValue)}); location.assign("/result");`);
  await waitFor(async () => await evaluate("document.querySelectorAll('.result-leaderboard-list li').length === 3 && document.body.textContent.includes('記録が完了しました')"), "結果画面のトップ3が表示されませんでした。");

  const renderedRows = await evaluate("Array.from(document.querySelectorAll('.result-leaderboard-list li')).map((row) => row.textContent.replace(/\\s+/g, ' ').trim())");
  assert.deepEqual(renderedRows, ["#1ALPHA1,400点72 WPM", "#2BRAVO1,100点60 WPM", "#2ゲスト1,100点58 WPM"]);
  socket.close();
  console.log("PASS: 結果画面に基本モードのトップ3（同点順位・ゲスト名・スコア・WPM）が表示されました。");
} finally {
  await stopProcess(browser);
  await stopProcess(server);
  await rm(storeDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
