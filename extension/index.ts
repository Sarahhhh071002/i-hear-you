/**
 * pi-supertonic — bundled Supertonic TTS engine for pi talk mode.
 *
 * Spawns a local Supertonic server (127.0.0.1:7788 by default) from inside
 * the pi process, installs the bundled M1 and F1 voice styles, and keeps the
 * engine alive for the session. Works with the existing `talk` extension
 * (POST /v1/tts, GET /v1/styles, GET /v1/health) so no separate
 * supertonic.service is required.
 *
 * Voices bundled: M1.json, F1.json only.
 *
 * Env overrides:
 *   PI_SUPERTONIC_BIN   path to the `supertonic` executable
 *   PI_SUPERTONIC_PORT  HTTP port (default 7788)
 *   PI_SUPERTONIC_MODEL model name (default supertonic-3)
 *   SUPERTONIC_CACHE_DIR  model cache dir (default ~/.cache/supertonic3)
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, ChildProcess } from "node:child_process";

const HOME = homedir();
const CACHE_DIR = resolve(process.env.SUPERTONIC_CACHE_DIR || join(HOME, ".cache", "supertonic3"));
const VOICE_STYLES_DIR = join(CACHE_DIR, "voice_styles");
const PORT = parseInt(process.env.PI_SUPERTONIC_PORT || "7788", 10);
const MODEL = process.env.PI_SUPERTONIC_MODEL || "supertonic-3";
const BIN =
	process.env.PI_SUPERTONIC_BIN ??
	join(HOME, ".local", "share", "supertonic-tts", "venv", "bin", "supertonic");

let engineProc: ChildProcess | null = null;
let enginePort = PORT;

function findFreePort(preferred: number): number {
	return preferred; // supertonic bind-fails loudly if taken; keep it simple
}

function installVoices(): void {
	const voicesDir = join(resolve(import.meta.dirname), "voices");
	if (!existsSync(voicesDir)) return;
	mkdirSync(VOICE_STYLES_DIR, { recursive: true });
	for (const name of ["M1.json", "F1.json"]) {
		const src = join(voicesDir, name);
		const dst = join(VOICE_STYLES_DIR, name);
		if (existsSync(src) && (!existsSync(dst) || readFileSync(src).byteLength !== readFileSync(dst).byteLength)) {
			writeFileSync(dst, readFileSync(src));
		}
	}
}

function spawnEngine(): Promise<void> {
	return new Promise((resolve, reject) => {
		if (!existsSync(BIN)) {
			reject(new Error(`supertonic binary not found at ${BIN}`));
			return;
		}
		enginePort = findFreePort(PORT);
		const env = { ...process.env, SUPERTONIC_PORT: String(enginePort), SUPERTONIC_CACHE_DIR: CACHE_DIR };
		engineProc = spawn(BIN, ["serve", "--host", "127.0.0.1", "--port", String(enginePort), "--model", MODEL], {
			env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stderr = "";
		engineProc.stderr?.on("data", (d) => (stderr += d.toString()));
		engineProc.on("error", (err) => reject(err));
		engineProc.on("exit", (code) => {
			engineProc = null;
			if (code && code !== 0) {
				reject(new Error(`supertonic exited ${code}: ${stderr.slice(-200)}`));
			}
		});
		// Poll health until ready or timeout
		let attempts = 0;
		const tryHealth = async () => {
			attempts++;
			try {
				const r = await fetch(`http://127.0.0.1:${enginePort}/v1/health`);
				if (r.ok) {
					resolve();
					return;
				}
			} catch {}
			if (attempts > 100) {
				reject(new Error(`supertonic did not become healthy on port ${enginePort}: ${stderr.slice(-200)}`));
				return;
			}
			setTimeout(tryHealth, 200);
		};
		tryHealth();
	});
}

function stopEngine(): void {
	if (engineProc) {
		try {
			engineProc.kill("SIGTERM");
		} catch {}
		engineProc = null;
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async () => {
		installVoices();
		try {
			await spawnEngine();
		} catch (e) {
			// Non-fatal: pi still works, just no bundled TTS engine.
			// The user can still point `talk` at an external supertonic.service.
		}
	});

	pi.on("shutdown", () => {
		stopEngine();
	});

	pi.registerCommand("supertonic", {
		description: "Bundled Supertonic TTS engine status (on|off|status|voices)",
		handler: async (args, ctx) => {
			const trimmed = (args ?? "").trim().toLowerCase();
			try {
				const r = await fetch(`http://127.0.0.1:${enginePort}/v1/health`);
				const j: any = await r.json();
				if (trimmed === "voices") {
					const vr = await fetch(`http://127.0.0.1:${enginePort}/v1/styles`);
					const vj: any = await vr.json();
					const names = (vj.styles ?? []).map((s: any) => s.name).join(", ");
					ctx.ui.notify(`Supertonic voices: ${names}`, "info");
					return;
				}
				ctx.ui.notify(
					`Supertonic: ${j.status} (port ${enginePort}, model ${MODEL}, voices: ${j.voices_loaded})`,
					"info",
				);
			} catch {
				ctx.ui.notify("Supertonic: engine not running", "warn");
			}
		},
	});
}
